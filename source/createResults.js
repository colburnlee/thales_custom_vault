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

    console.log(
      `Market ${market.market} Position: ${market.position} Result: ${marketResult}...`
    );
    // Add the result to the allResults.fullHistory
    let marketIndex = allResults.fullHistory.findIndex(
      (m) => m.market === market.market
    );
    if (marketIndex > -1) {
      allResults.fullHistory[marketIndex].result = marketResult;
    } else {
      allResults.fullHistory.push(market);
    }
  }
  checkResults(allResults.fullHistory);

  // Return the roundData with results
  return roundDataWithResults;
};

const checkResults = async (fullHistory) => {
  // Loop through each market in the tradeLog and check for duplicate hashes. Remove duplicates.
  for (let i = 0; i < fullHistory.length; i++) {
    let market = fullHistory[i];
    let duplicates = fullHistory.filter(
      (m) => m.transactionHash === market.transactionHash
    );
    if (duplicates.length > 1) {
      console.log(`Duplicate hash found: ${market.transactionHash}`);
      let marketIndex = fullHistory.findIndex(
        (m) => m.transactionHash === market.transactionHash
      );
      fullHistory.splice(marketIndex, 1);
    }
  }
  console.log(`Full history length: ${fullHistory.length}`);
  allResults.fullHistory = fullHistory;
  return fullHistory;
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
  let round;
  try {
    round = +roundData.tradeLog[0].round;
  } catch (error) {
    round = 0;
  }
  let summary = {
    round: round,
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

const createMarketSummary = async (allResults) => {
  let history = allResults.fullHistory;
  // loop through each market. Evaluate each trade by currencyKey to determine summary results for total, optimism, arbitrum, bsc, and polygon.
  let marketSummary = {};
  for (let i = 0; i < history.length; i++) {
    let market = history[i];
    let marketName = market.currencyKey;
    // if market is not in marketSummary, add it
    if (!marketSummary[marketName]) {
      marketSummary[marketName] = {
        tradeLog: [],
      };
    }
    // add data to tradeLog
    marketSummary[marketName].tradeLog.push(market);
  }
  // console.log("Market Summary", marketSummary);

  // loop through each market and create summary data
  for (let market in marketSummary) {
    // console.log("Market", market);
    // console.log("Market Summary", marketSummary[market]);
    let summary = await createSummary(marketSummary[market]);
    marketSummary[market].summary = summary;
  }
  // add to allResults
  allResults.marketSummary = marketSummary;
};

const createOverallSummary = async (summaryData) => {
  let overallSummary = {
    total: {
      trades: 0,
      wins: 0,
      losses: 0,
      amountWon: 0,
      amountLost: 0,
      invested: 0,
      winPercent: 0,
      lossPercent: 0,
      profit: 0,
    },
    optimism: {
      trades: 0,
      wins: 0,
      losses: 0,
      amountWon: 0,
      amountLost: 0,
      invested: 0,
      winPercent: 0,
      lossPercent: 0,
      profit: 0,
    },
    arbitrum: {
      trades: 0,
      wins: 0,
      losses: 0,
      amountWon: 0,
      amountLost: 0,
      invested: 0,
      winPercent: 0,
      lossPercent: 0,
      profit: 0,
    },
    bsc: {
      trades: 0,
      wins: 0,
      losses: 0,
      amountWon: 0,
      amountLost: 0,
      invested: 0,
      winPercent: 0,
      lossPercent: 0,
      profit: 0,
    },
    polygon: {
      trades: 0,
      wins: 0,
      losses: 0,
      amountWon: 0,
      amountLost: 0,
      invested: 0,
      winPercent: 0,
      lossPercent: 0,
      profit: 0,
    },
  };

  for (let i = 0; i < summaryData.length; i++) {
    let summary = summaryData[i];

    // All Networks
    overallSummary.total.trades += summary.total.trades;
    overallSummary.total.wins += summary.total.wins;
    overallSummary.total.losses += summary.total.losses;
    overallSummary.total.amountWon += summary.total.amountWon;
    overallSummary.total.amountLost += summary.total.amountLost;
    overallSummary.total.invested += summary.total.invested;

    // Optimism
    overallSummary.optimism.trades += summary.optimism.trades;
    overallSummary.optimism.wins += summary.optimism.wins;
    overallSummary.optimism.losses += summary.optimism.losses;
    overallSummary.optimism.amountWon += summary.optimism.amountWon;
    overallSummary.optimism.amountLost += summary.optimism.amountLost;
    overallSummary.optimism.invested += summary.optimism.invested;

    // Arbitrum
    overallSummary.arbitrum.trades += summary.arbitrum.trades;
    overallSummary.arbitrum.wins += summary.arbitrum.wins;
    overallSummary.arbitrum.losses += summary.arbitrum.losses;
    overallSummary.arbitrum.amountWon += summary.arbitrum.amountWon;
    overallSummary.arbitrum.amountLost += summary.arbitrum.amountLost;
    overallSummary.arbitrum.invested += summary.arbitrum.invested;

    if (summary.bsc && summary.bsc.trades > 0) {
      // BSC
      overallSummary.bsc.trades += summary.bsc.trades;
      overallSummary.bsc.wins += summary.bsc.wins;
      overallSummary.bsc.losses += summary.bsc.losses;
      overallSummary.bsc.amountWon += summary.bsc.amountWon;
      overallSummary.bsc.amountLost += summary.bsc.amountLost;
      overallSummary.bsc.invested += summary.bsc.invested;
    }

    if (summary.polygon && summary.polygon.trades > 0) {
      // Polygon
      overallSummary.polygon.trades += summary.polygon.trades;
      overallSummary.polygon.wins += summary.polygon.wins;
      overallSummary.polygon.losses += summary.polygon.losses;
      overallSummary.polygon.amountWon += summary.polygon.amountWon;
      overallSummary.polygon.amountLost += summary.polygon.amountLost;
      overallSummary.polygon.invested += summary.polygon.invested;
    }
  }

  // All Networks
  overallSummary.total.winPercent =
    (overallSummary.total.wins / overallSummary.total.trades) * 100;
  overallSummary.total.lossPercent =
    (overallSummary.total.losses / overallSummary.total.trades) * 100;
  overallSummary.total.amountWon = Number(
    overallSummary.total.amountWon.toFixed(2)
  );
  overallSummary.total.amountLost = Number(
    overallSummary.total.amountLost.toFixed(2)
  );
  overallSummary.total.invested = Number(
    overallSummary.total.invested.toFixed(2)
  );
  overallSummary.total.profit = Number(
    (overallSummary.total.amountWon - overallSummary.total.amountLost).toFixed(
      2
    )
  );

  // Optimism
  overallSummary.optimism.winPercent =
    (overallSummary.optimism.wins / overallSummary.optimism.trades) * 100;
  overallSummary.optimism.lossPercent =
    (overallSummary.optimism.losses / overallSummary.optimism.trades) * 100;
  overallSummary.optimism.amountWon = Number(
    overallSummary.optimism.amountWon.toFixed(2)
  );
  overallSummary.optimism.amountLost = Number(
    overallSummary.optimism.amountLost.toFixed(2)
  );
  overallSummary.optimism.invested = Number(
    overallSummary.optimism.invested.toFixed(2)
  );
  overallSummary.optimism.profit = Number(
    (
      overallSummary.optimism.amountWon - overallSummary.optimism.amountLost
    ).toFixed(2)
  );

  // Arbitrum
  overallSummary.arbitrum.winPercent =
    (overallSummary.arbitrum.wins / overallSummary.arbitrum.trades) * 100;
  overallSummary.arbitrum.lossPercent =
    (overallSummary.arbitrum.losses / overallSummary.arbitrum.trades) * 100;
  overallSummary.arbitrum.amountWon = Number(
    overallSummary.arbitrum.amountWon.toFixed(2)
  );
  overallSummary.arbitrum.amountLost = Number(
    overallSummary.arbitrum.amountLost.toFixed(2)
  );
  overallSummary.arbitrum.invested = Number(
    overallSummary.arbitrum.invested.toFixed(2)
  );
  overallSummary.arbitrum.profit = Number(
    (
      overallSummary.arbitrum.amountWon - overallSummary.arbitrum.amountLost
    ).toFixed(2)
  );

  if (overallSummary.bsc && overallSummary.bsc.trades > 0) {
    // BSC
    overallSummary.bsc.winPercent =
      (overallSummary.bsc.wins / overallSummary.bsc.trades) * 100;
    overallSummary.bsc.lossPercent =
      (overallSummary.bsc.losses / overallSummary.bsc.trades) * 100;
    overallSummary.bsc.amountWon = Number(
      overallSummary.bsc.amountWon.toFixed(2)
    );
    overallSummary.bsc.amountLost = Number(
      overallSummary.bsc.amountLost.toFixed(2)
    );
    overallSummary.bsc.invested = Number(
      overallSummary.bsc.invested.toFixed(2)
    );
    overallSummary.bsc.profit = Number(
      (overallSummary.bsc.amountWon - overallSummary.bsc.amountLost).toFixed(2)
    );
  }
  if (overallSummary.polygon && overallSummary.polygon.trades > 0) {
    // Polygon
    overallSummary.polygon.winPercent =
      (overallSummary.polygon.wins / overallSummary.polygon.trades) * 100;
    overallSummary.polygon.lossPercent =
      (overallSummary.polygon.losses / overallSummary.polygon.trades) * 100;
    overallSummary.polygon.amountWon = Number(
      overallSummary.polygon.amountWon.toFixed(2)
    );
    overallSummary.polygon.amountLost = Number(
      overallSummary.polygon.amountLost.toFixed(2)
    );
    overallSummary.polygon.invested = Number(
      overallSummary.polygon.invested.toFixed(2)
    );
    overallSummary.polygon.profit = Number(
      (
        overallSummary.polygon.amountWon - overallSummary.polygon.amountLost
      ).toFixed(2)
    );
  }

  return overallSummary;
};

const main = async () => {
  const roundData = require("../data/archive/round_22.json");
  try {
    let roundDataWithResults = await createResults(roundData);
    let summary = await createSummary(roundDataWithResults);
    allResults.roundResults.push(summary);
    let overallSummary = await createOverallSummary(allResults.roundResults);
    allResults.overallSummary = overallSummary;
    await createMarketSummary(allResults);
    fs.writeFileSync(
      "./data/results.json",
      JSON.stringify(allResults, null, 2)
    );
  } catch (error) {
    console.log("error: ", error);
  }
};

main();

module.exports = createResults;
