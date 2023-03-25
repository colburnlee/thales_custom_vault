require("dotenv").config();
const constants = require("../constants.js");
const ethers = require("ethers");
const w3utils = require("web3-utils");
const Vault = require("../contracts/Vault.js");
const ThalesAMM = require("../contracts/ThalesAMM.js");
// const PositionalMarketDataContract = require("../contracts/PositionalMarketData.js");
const marketschecker = require("./marketschecker.js");
const fs = require("fs");
const allResults = require("../data/results.json");

// Takes in the round data json. Function will loop throught he tradeLog and add a result field to each market. Result will be '0' for a loss, '1' for a win.

const createResults = async (roundData) => {
  let roundDataWithResults = roundData;
  console.log(`Processing ${roundDataWithResults.tradeLog.length} markets...`);

  // Loop through each market in the tradeLog
  for (let i = 0; i < roundDataWithResults.tradeLog.length; i++) {
    let market = roundDataWithResults.tradeLog[i];
    let networkVars = await getNetworkVariables(market.network);

    let contract = new ethers.Contract(
      market.market,
      networkVars.abi.marketContract.abi,
      networkVars.wallet
    );
    let marketResult = await contract.result();
    marketResult = marketResult > 0 ? "DOWN" : "UP";
    market.result = marketResult;
  }

  // Return the roundData with results
  return roundDataWithResults;
};

const getNetworkVariables = async (network) => {
  // Optimism
  const PositionalMarketDataContract = require("../contracts/market.js");
  const wallet = new ethers.Wallet(
    constants.privateKey,
    constants.etherprovider
  );

  // Arbitrum
  const ArbPositionalMarketDataContract = require("../contracts/market.js");
  const arbWallet = new ethers.Wallet(
    constants.privateKey,
    constants.arbitrumProvider
  );

  // BSC
  const BSCPositionalMarketDataContract = require("../contracts/market.js");
  const bscWallet = new ethers.Wallet(
    constants.privateKey,
    constants.bscProvider
  );

  // Polygon
  const PolygonPositionalMarketDataContract = require("../contracts/market.js");
  const polygonWallet = new ethers.Wallet(
    constants.privateKey,
    constants.polygonProvider
  );
  let networkVariables = {};
  switch (network) {
    case "optimism":
      networkVariables = {
        wallet: wallet,
        abi: PositionalMarketDataContract,
      };
      break;
    case "arbitrum":
      networkVariables = {
        wallet: arbWallet,
        abi: ArbPositionalMarketDataContract,
      };
      break;
    case "bsc":
      networkVariables = {
        wallet: bscWallet,
        abi: BSCPositionalMarketDataContract,
      };
      break;
    case "polygon":
      networkVariables = {
        wallet: polygonWallet,
        abi: PolygonPositionalMarketDataContract,
      };
      break;
  }
  return networkVariables;
};

const createSummary = async (roundData) => {
  let summary = {
    round: 0,
    trades: 0,
    wins: 0,
    losses: 0,
    amountWon: 0,
    amountLost: 0,
    invested: 0,
    profit: 0,
    winPercent: 0,
    lossPercent: 0,
  };

  for (let i = 0; i < roundData.tradeLog.length; i++) {
    if (i === 0) {
      summary.round = +roundData.tradeLog[i].round;
    }
    let market = roundData.tradeLog[i];
    summary.trades += 1;
    summary.invested += +market.quote;
    if (
      (market.result === "UP" && market.position === "UP") ||
      (market.result === "DOWN" && market.position === "DOWN")
    ) {
      summary.wins += 1;
      summary.amountWon += +market.amount - +market.quote;
    } else if (
      (market.result === "UP" && market.position === "DOWN") ||
      (market.result === "DOWN" && market.position === "UP")
    ) {
      summary.losses += 1;
      summary.amountLost += +market.quote;
    }
  }

  summary.winPercent = (summary.wins / summary.trades) * 100;
  summary.lossPercent = (summary.losses / summary.trades) * 100;

  summary.amountWon = Number(summary.amountWon.toFixed(2));
  summary.amountLost = Number(summary.amountLost.toFixed(2));
  summary.invested = Number(summary.invested.toFixed(2));
  summary.winPercent = Number(summary.winPercent.toFixed(2));
  summary.lossPercent = Number(summary.lossPercent.toFixed(2));
  summary.profit = Number((summary.amountWon - summary.amountLost).toFixed(2));

  console.log(summary);

  return summary;
};

module.exports = createResults;

const main = async () => {
  const roundData = require("../data/archive/round_18.json"); // Change this to the round you want to process
  let roundDataWithResults = await createResults(roundData);
  let summary = await createSummary(roundDataWithResults);
  allResults.roundResults.push(summary);
  fs.writeFileSync("./data/results.json", JSON.stringify(allResults, null, 2));
};

main();
