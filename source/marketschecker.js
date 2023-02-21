require("dotenv").config();

const constants = require("../constants.js");
const thalesData = require("thales-data");
const ethers = require("ethers");
const w3utils = require("web3-utils");

const wallet = new ethers.Wallet(constants.privateKey, constants.etherprovider);

const { performance } = require("perf_hooks");

const PositionalMarketDataContract = require("../contracts/PositionalMarketData.js");

const Position = {
  UP: 0,
  DOWN: 1,
  DRAW: 2,
};

async function processMarkets(
  priceLowerLimit,
  priceUpperLimit,
  roundEndTime,
  skewImpactLimit
) {
  let tradingMarkets = [];

  console.log(
    "--------------------Started processing markets-------------------"
  );

  let minManurityValue = parseInt(new Date().getTime() / 1000);
  let positionalMarkets = await thalesData.binaryOptions.markets({
    max: Infinity,
    network: process.env.NETWORK_ID,
    minMaturity: minManurityValue,
  });

  const positionalMarketDataContract = new ethers.Contract(
    process.env.POSITIONAL_MARKET_DATA_CONTRACT,
    PositionalMarketDataContract.positionalMarketDataContract.abi,
    wallet
  );

  const [pricesForAllActiveMarkets, priceImpactForAllActiveMarkets] =
    await Promise.all([
      positionalMarketDataContract.getBasePricesForAllActiveMarkets(),
      positionalMarketDataContract.getPriceImpactForAllActiveMarkets(),
    ]);

  console.log("Processing a total of " + positionalMarkets.length + " markets");
  let i = 0;

  for (const market of positionalMarkets) {
    console.log("Processing " + i + " market " + market.address);
    i++;

    const marketPrices = pricesForAllActiveMarkets.find(
      (prices) => prices.market.toLowerCase() === market.address
    );
    const marketPriceImpact = priceImpactForAllActiveMarkets.find(
      (priceImpact) => priceImpact.market.toLowerCase() === market.address
    );

    if (
      inTradingWeek(market.maturityDate, roundEndTime) &&
      marketPrices &&
      marketPriceImpact
    ) {
      console.log("eligible");
      try {
        let buyPriceImpactUP = marketPriceImpact.upPriceImpact / 1e18;
        let buyPriceImpactDOWN = marketPriceImpact.downPriceImpact / 1e18;
        console.log("buyPriceImpactUP is " + buyPriceImpactUP);
        console.log("buyPriceImpactDOWN is " + buyPriceImpactDOWN);
        if (
          buyPriceImpactUP >= skewImpactLimit &&
          buyPriceImpactDOWN >= skewImpactLimit
        ) {
          continue;
        }

        let priceUP = marketPrices.upPrice / 1e18;
        let priceDOWN = marketPrices.downPrice / 1e18;

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
    "--------------------Finished processing markets-------------------"
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
    Number(maturityDate) < Number(roundEndTime) * 1000
  ) {
    return true;
  }
  return false;
}

module.exports = {
  processMarkets,
};
