require("dotenv").config();

const constants = require("../constants.js");
const thalesData = require("thales-data");
const ethers = require("ethers");
const w3utils = require("web3-utils");

const wallet = new ethers.Wallet(constants.privateKey, constants.etherprovider);

const { performance } = require("perf_hooks");

const SportPositionalMarketDataContract = require("../contracts/SportPositionalMarketData.js");

const Position = {
  HOME: 0,
  AWAY: 1,
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

  const positionalMarkets = await thalesData.sportMarkets.markets({
    max: Infinity,
    network: process.env.NETWORK_ID,
    isResolved: false,
  });

  const sportPositionalMarketDataContract = new ethers.Contract(
    process.env.SPORT_POSITIONAL_MARKET_DATA_CONTRACT,
    SportPositionalMarketDataContract.sportPositionalMarketDataContract.abi,
    wallet
  );

  const [oddsForAllActiveMarkets, priceImpactForAllActiveMarkets] =
    await Promise.all([
      sportPositionalMarketDataContract.getBaseOddsForAllActiveMarkets(),
      sportPositionalMarketDataContract.getPriceImpactForAllActiveMarkets(),
    ]);

  console.log("Processing a total of " + positionalMarkets.length + " markets");
  let i = 0;

  for (const market of positionalMarkets) {
    console.log("Processing " + i + " market");
    i++;

    const marketOdds = oddsForAllActiveMarkets.find(
      (odds) => odds.market.toLowerCase() === market.address
    );
    const marketPriceImpact = priceImpactForAllActiveMarkets.find(
      (priceImpact) => priceImpact.market.toLowerCase() === market.address
    );

    if (
      inTradingWeek(market.maturityDate, roundEndTime) &&
      marketOdds &&
      marketPriceImpact
    ) {
      console.log("eligible");
      try {
        let buyPriceImpactHome =
          marketPriceImpact.priceImpact[Position.HOME] / 1e18;
        let buyPriceImpactAway =
          marketPriceImpact.priceImpact[Position.AWAY] / 1e18;
        let buyPriceImpactDraw =
          (marketPriceImpact.priceImpact[Position.DRAW] || 0) / 1e18;
        console.log(market.homeTeam + " vs " + market.awayTeam);
        console.log("buyPriceImpactHome is " + buyPriceImpactHome);
        console.log("buyPriceImpactAway is " + buyPriceImpactAway);
        console.log("buyPriceImpactDraw is " + buyPriceImpactDraw);
        if (
          buyPriceImpactHome >= skewImpactLimit &&
          buyPriceImpactAway >= skewImpactLimit &&
          buyPriceImpactDraw >= skewImpactLimit
        ) {
          continue;
        }

        let priceHome = marketOdds.odds[Position.HOME] / 1e18;
        let priceAway = marketOdds.odds[Position.AWAY] / 1e18;
        let priceDraw = (marketOdds.odds[Position.DRAW] || 0) / 1e18;

        if (
          priceDraw > priceLowerLimit &&
          priceDraw < priceUpperLimit &&
          buyPriceImpactDraw < skewImpactLimit
        ) {
          tradingMarkets.push({
            address: market.address,
            position: Position.DRAW,
            currencyKey: market.currencyKey,
            price: priceDraw,
          });
          console.log(market.address, "priceDraw", priceDraw);
        }
        if (
          priceHome > priceLowerLimit &&
          priceHome < priceUpperLimit &&
          buyPriceImpactHome < skewImpactLimit
        ) {
          tradingMarkets.push({
            address: market.address,
            position: Position.HOME,
            currencyKey: market.currencyKey,
            price: priceHome,
          });
          console.log(market.address, "PriceHome", priceHome);
        }
        if (
          priceAway > priceLowerLimit &&
          priceAway < priceUpperLimit &&
          buyPriceImpactAway < skewImpactLimit
        ) {
          tradingMarkets.push({
            address: market.address,
            position: Position.AWAY,
            currencyKey: market.currencyKey,
            price: priceAway,
          });
          console.log(market.address, "PriceAway", priceAway);
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
