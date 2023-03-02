require("dotenv").config();

const thalesData = require("thales-data");
const ethers = require("ethers");

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
  abi
) {
  let tradingMarkets = [];

  console.log(
    "--------------------Started processing markets-------------------"
  );

  let minMaturityValue = parseInt(new Date().getTime() / 1000);
  let positionalMarkets = await thalesData.binaryOptions.markets({
    max: Infinity,
    network: process.env.ARBITRUM_NETWORK_ID,
    minMaturity: minMaturityValue,
  });

  const positionalMarketDataContract = new ethers.Contract(
    positionalContractAddress,
    abi.positionalMarketDataContract.abi,
    wallet
  );

  const [pricesForAllActiveMarkets, priceImpactForAllActiveMarkets] =
    await Promise.all([
      positionalMarketDataContract.getPricesForAllActiveMarkets(), // Changed for Arbitrum
      positionalMarketDataContract.getPriceImpactForAllActiveMarkets(),
    ]);

  console.log("Processing a total of " + positionalMarkets.length + " markets");
  let i = 0;

  for (const market of positionalMarkets) {
    // console.log("Processing " + i + " market " + market.address);
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
      // console.log("eligible");
      try {
        let buyPriceImpactUP = marketPriceImpact.upPriceImpact / 1e18;
        let buyPriceImpactDOWN = marketPriceImpact.downPriceImpact / 1e18;
        // console.log("buyPriceImpactUP: " + buyPriceImpactUP);
        // console.log("buyPriceImpactDOWN: " + buyPriceImpactDOWN);
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
          // console.log(market.address, "PriceUP", priceUP);
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
          // console.log(market.address, "PriceDOWN", priceDOWN);
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
