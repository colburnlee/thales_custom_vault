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
    round: +roundData.tradeLog[0].round,
    optimism: {
      trades: 0,
      wins: 0,
      losses: 0,
      amountWon: 0,
      amountLost: 0,
      invested: 0,
      profit: 0,
      winPercent: 0,
      lossPercent: 0,
    },
    arbitrum: {
      trades: 0,
      wins: 0,
      losses: 0,
      amountWon: 0,
      amountLost: 0,
      invested: 0,
      profit: 0,
      winPercent: 0,
      lossPercent: 0,
    },
    bsc: {
      trades: 0,
      wins: 0,
      losses: 0,
      amountWon: 0,
      amountLost: 0,
      invested: 0,
      profit: 0,
      winPercent: 0,
      lossPercent: 0,
    },
    polygon: {
      trades: 0,
      wins: 0,
      losses: 0,
      amountWon: 0,
      amountLost: 0,
      invested: 0,
      profit: 0,
      winPercent: 0,
      lossPercent: 0,
    },
    total: {
      trades: 0,
      wins: 0,
      losses: 0,
      amountWon: 0,
      amountLost: 0,
      invested: 0,
      profit: 0,
      winPercent: 0,
      lossPercent: 0,
    },
  };

  for (let i = 0; i < roundData.tradeLog.length; i++) {
    let market = roundData.tradeLog[i];
    summary.total.trades += 1;
    summary.total.invested += +market.quote;
    if (market.network === "optimism") {
      summary.optimism.trades += 1;
      summary.optimism.invested += +market.quote;
    } else if (market.network === "arbitrum") {
      summary.arbitrum.trades += 1;
      summary.arbitrum.invested += +market.quote;
    } else if (market.network === "bsc") {
      summary.bsc.trades += 1;
      summary.bsc.invested += +market.quote;
    } else if (market.network === "polygon") {
      summary.polygon.trades += 1;
      summary.polygon.invested += +market.quote;
    }

    if (
      (market.result === "UP" && market.position === "UP") ||
      (market.result === "DOWN" && market.position === "DOWN")
    ) {
      summary.total.wins += 1;
      summary.total.amountWon += +market.amount - +market.quote;
      if (market.network === "optimism") {
        summary.optimism.wins += 1;
        summary.optimism.amountWon += +market.amount - +market.quote;
      } else if (market.network === "arbitrum") {
        summary.arbitrum.wins += 1;
        summary.arbitrum.amountWon += +market.amount - +market.quote;
      } else if (market.network === "bsc") {
        summary.bsc.wins += 1;
        summary.bsc.amountWon += +market.amount - +market.quote;
      } else if (market.network === "polygon") {
        summary.polygon.wins += 1;
        summary.polygon.amountWon += +market.amount - +market.quote;
      }
    } else if (
      (market.result === "UP" && market.position === "DOWN") ||
      (market.result === "DOWN" && market.position === "UP")
    ) {
      summary.total.losses += 1;
      summary.total.amountLost += +market.quote;
      if (market.network === "optimism") {
        summary.optimism.losses += 1;
        summary.optimism.amountLost += +market.quote;
      } else if (market.network === "arbitrum") {
        summary.arbitrum.losses += 1;
        summary.arbitrum.amountLost += +market.quote;
      } else if (market.network === "bsc") {
        summary.bsc.losses += 1;
        summary.bsc.amountLost += +market.quote;
      } else if (market.network === "polygon") {
        summary.polygon.losses += 1;
        summary.polygon.amountLost += +market.quote;
      }
    }
  }

  // Calculate percentages - wins, losses, profit - All Networks, Optimism, Arbitrum, BSC, Polygon
  // All Networks
  summary.total.winPercent = (summary.total.wins / summary.total.trades) * 100;
  summary.total.lossPercent =
    (summary.total.losses / summary.total.trades) * 100;
  summary.total.amountWon = Number(summary.total.amountWon.toFixed(2));
  summary.total.amountLost = Number(summary.total.amountLost.toFixed(2));
  summary.total.invested = Number(summary.total.invested.toFixed(2));
  summary.total.winPercent = Number(summary.total.winPercent.toFixed(2));
  summary.total.lossPercent = Number(summary.total.lossPercent.toFixed(2));
  summary.total.profit = Number(
    (summary.total.amountWon - summary.total.amountLost).toFixed(2)
  );

  // Optimism
  summary.optimism.winPercent =
    (summary.optimism.wins / summary.optimism.trades) * 100;
  summary.optimism.lossPercent =
    (summary.optimism.losses / summary.optimism.trades) * 100;
  summary.optimism.amountWon = Number(summary.optimism.amountWon.toFixed(2));
  summary.optimism.amountLost = Number(summary.optimism.amountLost.toFixed(2));
  summary.optimism.invested = Number(summary.optimism.invested.toFixed(2));
  summary.optimism.winPercent = Number(summary.optimism.winPercent.toFixed(2));
  summary.optimism.lossPercent = Number(
    summary.optimism.lossPercent.toFixed(2)
  );
  summary.optimism.profit = Number(
    (summary.optimism.amountWon - summary.optimism.amountLost).toFixed(2)
  );

  // Arbitrum
  summary.arbitrum.winPercent =
    (summary.arbitrum.wins / summary.arbitrum.trades) * 100;
  summary.arbitrum.lossPercent =
    (summary.arbitrum.losses / summary.arbitrum.trades) * 100;
  summary.arbitrum.amountWon = Number(summary.arbitrum.amountWon.toFixed(2));
  summary.arbitrum.amountLost = Number(summary.arbitrum.amountLost.toFixed(2));
  summary.arbitrum.invested = Number(summary.arbitrum.invested.toFixed(2));
  summary.arbitrum.winPercent = Number(summary.arbitrum.winPercent.toFixed(2));
  summary.arbitrum.lossPercent = Number(
    summary.arbitrum.lossPercent.toFixed(2)
  );
  summary.arbitrum.profit = Number(
    (summary.arbitrum.amountWon - summary.arbitrum.amountLost).toFixed(2)
  );

  // BSC
  summary.bsc.winPercent = (summary.bsc.wins / summary.bsc.trades) * 100;
  summary.bsc.lossPercent = (summary.bsc.losses / summary.bsc.trades) * 100;
  summary.bsc.amountWon = Number(summary.bsc.amountWon.toFixed(2));
  summary.bsc.amountLost = Number(summary.bsc.amountLost.toFixed(2));
  summary.bsc.invested = Number(summary.bsc.invested.toFixed(2));
  summary.bsc.winPercent = Number(summary.bsc.winPercent.toFixed(2));
  summary.bsc.lossPercent = Number(summary.bsc.lossPercent.toFixed(2));
  summary.bsc.profit = Number(
    (summary.bsc.amountWon - summary.bsc.amountLost).toFixed(2)
  );

  // Polygon
  summary.polygon.winPercent =
    (summary.polygon.wins / summary.polygon.trades) * 100;
  summary.polygon.lossPercent =
    (summary.polygon.losses / summary.polygon.trades) * 100;
  summary.polygon.amountWon = Number(summary.polygon.amountWon.toFixed(2));
  summary.polygon.amountLost = Number(summary.polygon.amountLost.toFixed(2));
  summary.polygon.invested = Number(summary.polygon.invested.toFixed(2));
  summary.polygon.winPercent = Number(summary.polygon.winPercent.toFixed(2));
  summary.polygon.lossPercent = Number(summary.polygon.lossPercent.toFixed(2));
  summary.polygon.profit = Number(
    (summary.polygon.amountWon - summary.polygon.amountLost).toFixed(2)
  );

  // Remove networks with no trades
  if (summary.arbitrum.trades === 0) {
    delete summary.arbitrum;
  }
  if (summary.optimism.trades === 0) {
    delete summary.optimism;
  }
  if (summary.bsc.trades === 0) {
    delete summary.bsc;
  }
  if (summary.polygon.trades === 0) {
    delete summary.polygon;
  }

  console.log(summary);

  return summary;
};

const main = async () => {
  const roundData = require("../data/archive/round_18.json"); // Change this to the round you want to process
  let roundDataWithResults = await createResults(roundData);
  let summary = await createSummary(roundDataWithResults);
  allResults.roundResults.push(summary);
  fs.writeFileSync("./data/results.json", JSON.stringify(allResults, null, 2));
};

main();

module.exports = createResults;
