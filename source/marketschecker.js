require("dotenv").config();

// const constants = require("../constants.js");
const thalesData = require("thales-data");
const ethers = require("ethers");
// const w3utils = require("web3-utils");

// const wallet = new ethers.Wallet(constants.privateKey, constants.etherprovider);

const { performance } = require("perf_hooks");

const Position = {
  UP: 0,
  DOWN: 1,
  DRAW: 2,
};

async function processMarkets(
  priceLowerLimit,
  priceUpperLimit,
  roundEndTime,
  skewImpactLimit,
  wallet,
  positionalContractAddress,
  abi,
  networkId
) {
  let tradingMarkets = [];

  console.log(
    "--------------------Started processing markets-------------------"
  );

  let minMaturityValue = parseInt(new Date().getTime() / 1000);
  let positionalMarkets = await thalesData.binaryOptions.markets({
    max: Infinity,
    network: +networkId,
    minMaturity: minMaturityValue,
  });

  const positionalMarketDataContract = new ethers.Contract(
    positionalContractAddress,
    abi.positionalMarketDataContract.abi,
    wallet
  );

  let [pricesForAllActiveMarkets, priceImpactForAllActiveMarkets] = [];
  if (+networkId == 10) {
    [pricesForAllActiveMarkets, priceImpactForAllActiveMarkets] =
      await Promise.all([
        positionalMarketDataContract.getBasePricesForAllActiveMarkets(),
        positionalMarketDataContract.getPriceImpactForAllActiveMarkets(),
      ]);
  } else if (+networkId == 42161 || +networkId == 56 || +networkId == 137) {
    [pricesForAllActiveMarkets, priceImpactForAllActiveMarkets] =
      await Promise.all([
        positionalMarketDataContract.getPricesForAllActiveMarkets(),
        positionalMarketDataContract.getPriceImpactForAllActiveMarkets(),
      ]);
  }
  // console.log("pricesForAllActiveMarkets: " + pricesForAllActiveMarkets);
  //     console.log(
  //       "priceImpactForAllActiveMarkets: " + priceImpactForAllActiveMarkets
  //     );

  //     console.log(
  //       "Processing a total of " + positionalMarkets.length + " markets"
  //     );

  let i = 0;
  /* *
    Process individual markets
      Schema:  {
      customMarket: false,
      customOracle: '0x0000000000000000000000000000000000000000',
      address: '0x37dcb4ccf7f5cd5c78d97d20ae1b698865d54ba0',
      timestamp: 1677058735000,
      creator: '0x5027ce356c375a934b4d1de9240ba789072a5af1',
      currencyKey: 'SNX',
      strikePrice: 2.3,
      maturityDate: 1678293000000,
      expiryDate: 1686069000000,
      isOpen: true,
      poolSize: 305,
      longAddress: '0x02bbfd96b7db61855731f7f71eefa836def55220',
      shortAddress: '0x1f7f05b1c06f8a4015fe296727d1e1fcbfdd7d80',
      result: null,
      finalPrice: 0
    }
  **/
  for (const market of positionalMarkets) {
    // console.log("Processing " + i + " market " + market.address);
    i++;

    const marketPrices = pricesForAllActiveMarkets.find(
      (prices) => prices.market.toLowerCase() === market.address
    );
    const marketPriceImpact = priceImpactForAllActiveMarkets.find(
      (priceImpact) => priceImpact.market.toLowerCase() === market.address
    );

    // console.log(
    //   `Market: ${market.address} - ${
    //     market.currencyKey
    //   } - MarketPrices: ${marketPrices} MarketPriceImpact- ${marketPriceImpact} - IntradingWeek: ${inTradingWeek(
    //     market.maturityDate,
    //     roundEndTime
    //   )}`
    // );

    if (
      inTradingWeek(market.maturityDate, roundEndTime) &&
      marketPrices &&
      marketPriceImpact
    ) {
      // console.log("eligible");
      try {
        let buyPriceImpactUP = marketPriceImpact.upPriceImpact / 1e18;
        let buyPriceImpactDOWN = marketPriceImpact.downPriceImpact / 1e18;
        // console.log("buyPriceImpactUP: " + buyPriceImpactUP);
        // console.log("buyPriceImpactDOWN: " + buyPriceImpactDOWN);

        // if (
        //   buyPriceImpactUP >= skewImpactLimit &&
        //   buyPriceImpactDOWN >= skewImpactLimit
        // ) {
        //   console.log(
        //     `Market: ${market.address} - ${market.currencyKey} - Skew Impact too high`
        //   );
        //   continue;
        // }

        let priceUP, priceDOWN;

        if (+networkId == 10 || +networkId == 56) {
          priceUP = marketPrices.upPrice / 1e18;
          priceDOWN = marketPrices.downPrice / 1e18;
        } else if (+networkId == 42161 || +networkId == 56) {
          priceUP = marketPrices.upPrice / 1e6;
          priceDOWN = marketPrices.downPrice / 1e6;
        }

        // console.log(
        //   `Market: ${market.address} - ${
        //     market.currencyKey
        //   } - UP: ${priceUP} - Impact UP: ${buyPriceImpactUP} - DOWN: ${priceDOWN} - Impact DOWN: ${buyPriceImpactDOWN} - IntradingWeek: ${inTradingWeek(
        //     market.maturityDate,
        //     roundEndTime
        //   )}`
        // );
        if (
          priceUP > priceLowerLimit &&
          priceUP < priceUpperLimit &&
          buyPriceImpactUP < skewImpactLimit
        ) {
          tradingMarkets.push({
            address: market.address,
            position: Position.UP,
            currencyKey: market.currencyKey,
            price: priceUP,
          });
          console.log(market.address, "PriceUP", priceUP);
        } else if (
          priceDOWN > priceLowerLimit &&
          priceDOWN < priceUpperLimit &&
          buyPriceImpactDOWN < skewImpactLimit
        ) {
          tradingMarkets.push({
            address: market.address,
            position: Position.DOWN,
            currencyKey: market.currencyKey,
            price: priceDOWN,
          });
          console.log(market.address, "PriceDOWN", priceDOWN);
        } else {
          continue;
        }
      } catch (e) {
        console.log(e);
      }
    }
  }
  console.log(
    `--------------Markets processed. ${tradingMarkets.length} Eligible -------------------`
  );

  return tradingMarkets;
}

function delay(time) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

function inTradingWeek(maturityDate, roundEndTime) {
  const now = Date.now();
  if (
    Number(maturityDate) > Number(now) &&
    Number(maturityDate) < Number(roundEndTime)
  ) {
    return true;
  }
  return false;
}

module.exports = {
  processMarkets,
};
