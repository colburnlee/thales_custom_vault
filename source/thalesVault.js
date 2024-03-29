require("dotenv").config();
const constants = require("../constants.js");
const ethers = require("ethers");
const w3utils = require("web3-utils");
const Vault = require("../contracts/Vault.js");
const ThalesAMM = require("../contracts/ThalesAMM.js");
// const PositionalMarketDataContract = require("../contracts/PositionalMarketData.js");
const marketschecker = require("./marketschecker.js");
const fs = require("fs");
const data = require("../data.json");
// Pull in local data - priceUpperLimit, priceLowerLimit, skewImpactLimit
const priceUpperLimit = Number(data.priceUpperLimit) / 1e18;
const priceLowerLimit = Number(data.priceLowerLimit) / 1e18;
const skewImpactLimit = Number(data.skewImpactLimit) / 1e18;

///////////////// Main function ///////////////////////
const processVault = async (auth, networkId) => {
  // Get the current vault round information from Optimism
  const { round, roundEndTime, closingDate } = await setOptimismVariables();
  // ensure data.json is up to date

  if (round > data.latestRound) {
    // If the round is greater than the round in data.json, re-initialize data.json and return
    console.log("New round. Re-initializing data.json");
    setLocalVariables(round);
    return;
  }

  // Test trades for each market
  await evaluateMarkets(
    priceLowerLimit,
    priceUpperLimit,
    skewImpactLimit,
    round,
    closingDate,
    networkId
  );
  fs.writeFileSync("data.json", JSON.stringify(data, null, 2));
};
///////////////// End of Main function ///////////////////////

const setNetworkVariables = async (networkId = "10") => {
  if (networkId == "10") {
    const wallet = new ethers.Wallet(
      constants.privateKey,
      constants.etherprovider
    );
    const thalesAMMContract = new ethers.Contract(
      process.env.THALES_AMM_CONTRACT,
      ThalesAMM.thalesAMMContract.abi,
      wallet
    );
    const positionalContractAddress =
      process.env.POSITIONAL_MARKET_DATA_CONTRACT;
    const PositionalMarketDataContract = require("../contracts/PositionalMarketData.js");
    const gasPrice = await constants.etherprovider.getGasPrice();
    const allocation = BigInt(data.networkAllocation["optimism"]);
    const remainingAllocation = await setBalanceVariables(
      allocation,
      "optimism"
    );
    return {
      wallet,
      thalesAMMContract,
      positionalContractAddress,
      PositionalMarketDataContract,
      gasPrice,
      allocation,
      remainingAllocation,
    };
  } else if (networkId == "56") {
    const wallet = new ethers.Wallet(
      constants.privateKey,
      constants.bscProvider
    );
    const thalesAMMContract = new ethers.Contract(
      process.env.BSC_THALES_AMM_CONTRACT,
      ThalesAMM.thalesAMMContract.abi,
      wallet
    );
    const positionalContractAddress =
      process.env.BSC_POSITIONAL_MARKET_DATA_CONTRACT;
    const PositionalMarketDataContract = require("../contracts/ArbitrumPositionalMarketData.js");
    const gasPrice = await constants.bscProvider.getGasPrice();
    const allocation = BigInt(data.networkAllocation["bsc"]);
    const remainingAllocation = await setBalanceVariables(allocation, "bsc");
    return {
      wallet,
      thalesAMMContract,
      positionalContractAddress,
      PositionalMarketDataContract,
      gasPrice,
      allocation,
      remainingAllocation,
    };
  } else if (networkId == "42161") {
    const wallet = new ethers.Wallet(
      constants.privateKey,
      constants.arbitrumProvider
    );
    const thalesAMMContract = new ethers.Contract(
      process.env.ARBITRUM_THALES_AMM_CONTRACT,
      ThalesAMM.thalesAMMContract.abi,
      wallet
    );
    const positionalContractAddress =
      process.env.ARBITRUM_POSITIONAL_MARKET_DATA_CONTRACT;
    const PositionalMarketDataContract = require("../contracts/ArbitrumPositionalMarketData.js");
    const gasPrice = await constants.arbitrumProvider.getGasPrice();
    const allocation = BigInt(data.networkAllocation["arbitrum"]);
    const remainingAllocation = await setBalanceVariables(
      allocation,
      "arbitrum"
    );
    return {
      wallet,
      thalesAMMContract,
      positionalContractAddress,
      PositionalMarketDataContract,
      gasPrice,
      allocation,
      remainingAllocation,
    };
  } else if (networkId == "137") {
    const wallet = new ethers.Wallet(
      constants.privateKey,
      constants.polygonProvider
    );
    const thalesAMMContract = new ethers.Contract(
      process.env.POLYGON_THALES_AMM_CONTRACT,
      ThalesAMM.thalesAMMContract.abi,
      wallet
    );
    const positionalContractAddress =
      process.env.POLYGON_POSITIONAL_MARKET_DATA_CONTRACT;
    const PositionalMarketDataContract = require("../contracts/ArbitrumPositionalMarketData.js");
    const gasPrice = await constants.polygonProvider.getGasPrice();
    const allocation = BigInt(data.networkAllocation["polygon"]);
    const remainingAllocation = await setBalanceVariables(
      allocation,
      "polygon"
    );
    return {
      wallet,
      thalesAMMContract,
      positionalContractAddress,
      PositionalMarketDataContract,
      gasPrice,
      allocation,
      remainingAllocation,
    };
  } else {
    throw new Error("Network ID not recognized");
  }
};

const setBalanceVariables = async (allocation, network) => {
  // take allocation and networkId as input. Loop through the tradelog for trades that match the networkId and subtract the amount traded (quote) from the allocation
  // return the remaining allocation
  let remainingAllocation = BigInt(allocation);
  for (let i = 0; i < data.tradeLog.length; i++) {
    if (data.tradeLog[i].network == network) {
      remainingAllocation -= BigInt(data.tradeLog[i].quote * 1e18);
    }
  }
  data.remainingAllocation[network] = remainingAllocation.toString();
  return remainingAllocation;
};

const setLocalVariables = async (vaultRound) => {
  // compare vaultRound to data.json latestRound
  // if vaultRound > data.json latestRound, update data.json latestRound
  // if vaultRound < data.json latestRound, throw error
  // if vaultRound == data.json latestRound, continue
  if (vaultRound > data.latestRound) {
    console.log("New round detected. Updating data file");
    // Save a log of the previous round to file
    fs.writeFileSync(
      `./data/archive/round_${vaultRound - 1}.json`,
      JSON.stringify(data, null, 2)
    );
    // Clear availableAllocationPerMarket, tradedInRoundAlready, tradedInRoundAlready, tradeLog, and errorLog
    data.latestRound = vaultRound.toString();
    data.availableAllocationPerMarket = {};
    data.tradedInRoundAlready = {};
    data.tradingMarketPositionPerRound = {};
    data.tradeLog = [];
    data.errorLog = [];
    data.remainingAllocation = data.networkAllocation;
  } else if (vaultRound < data.latestRound) {
    throw new Error("Vault round is less than the latest round");
  }
};

const setOptimismVariables = async () => {
  const wallet = new ethers.Wallet(
    constants.privateKey,
    constants.etherprovider
  );
  const contract = new ethers.Contract(
    process.env.AMM_VAULT_CONTRACT,
    Vault.vaultContract.abi,
    wallet
  );
  const round = await contract.round();
  const roundEndTime = (await contract.getCurrentRoundEnd()).toString();
  let closingDate = new Date(roundEndTime * 1000.0).getTime();
  console.log(
    `Vault Information... Round: ${round}, Round End Time: ${roundEndTime}, Closing Date: ${closingDate} Price Upper Limit: ${priceUpperLimit}, Price Lower Limit: ${priceLowerLimit}, Skew Impact Limit: ${skewImpactLimit}  `
  );
  return { round, roundEndTime, closingDate };
};

const evaluateMarkets = async (
  priceLowerLimit,
  priceUpperLimit,
  skewImpactLimit,
  round,
  roundEndTime,
  networkId
) => {
  // Set the network variables based on the networkId. Will pass to marketschecker
  const {
    wallet,
    thalesAMMContract,
    positionalContractAddress,
    PositionalMarketDataContract,
    gasPrice: gasp,
    allocation,
    remainingAllocation,
  } = await setNetworkVariables(networkId);

  if (remainingAllocation <= BigInt(5 * 1e18)) {
    console.log(
      ` Remaining trading allocation ($${
        remainingAllocation / BigInt(1e18)
      }) Not enough allocation to trade on ${
        networkId == "42161"
          ? "arbitrum"
          : networkId == "56"
          ? "bsc"
          : networkId == "137"
          ? "polygon"
          : "optimism"
      }`
    );
    return;
  }

  let tradingMarkets = await marketschecker.processMarkets(
    priceLowerLimit,
    priceUpperLimit,
    roundEndTime,
    skewImpactLimit,
    wallet,
    positionalContractAddress,
    PositionalMarketDataContract,
    networkId
  );

  console.log(
    ` Total ${
      networkId == "42161"
        ? "arbitrum"
        : networkId == "56"
        ? "bsc"
        : networkId == "137"
        ? "polygon"
        : "optimism"
    } allocation: $${allocation / BigInt(1e18)} Remaining Allocation: $${
      remainingAllocation / BigInt(1e18)
    }`
  );

  for (const key in tradingMarkets) {
    let market = tradingMarkets[key];
    console.log(
      `--------------------Processing ${market.currencyKey} ${
        market.position > 0 ? "DOWN" : "UP"
      } at ${market.address}-------------------`
    );

    // Check if this market has already been traded in this round. Returns true or false.
    let tradedInRoundAlready;
    let tradedBeforePosition;
    for (const key in data.tradedInRoundAlready[round]) {
      if (market.address == data.tradedInRoundAlready[round][key]) {
        tradedInRoundAlready = true;
        tradedBeforePosition =
          data.tradingMarketPositionPerRound[round][market.address];
        console.log(
          `Previous Position: ${
            tradedBeforePosition > 0 ? "DOWN" : "UP"
          } (${tradedBeforePosition})`
        );
        if (tradedBeforePosition != market.position) {
          console.log(
            "Market already traded in round, but with different position. Skipping"
          );
          continue;
        }
      } else {
        tradedInRoundAlready = false;
      }
    }

    // Evaluate the amount to buy according to Skew Impact. Returns an object with amount, quote and position.
    let result = await amountToBuy(
      market,
      round,
      skewImpactLimit,
      thalesAMMContract,
      networkId,
      allocation
    );

    if (result.amount > 0) {
      console.log(
        `Executing order to buy ${result.amount} ${
          market.position > 0 ? "DOWN" : "UP"
        }s ($${result.quote.toFixed(2)}) of ${market.currencyKey} at ${
          market.address
        }`
      );
      await executeTrade(
        market,
        result,
        round,
        gasp,
        thalesAMMContract,
        networkId
      );
    } else {
      console.log(
        `No trade made for ${market.currencyKey} ${
          market.position > 0 ? "DOWN" : "UP"
        } at ${market.address}`
      );
    }
  }
};

async function amountToBuy(
  market,
  round,
  skewImpactLimit,
  contract,
  networkId,
  allocation
) {
  let decimals = 1e18;
  if (networkId == "42161" || networkId == "137") {
    decimals = 1e6;
  }

  // Get the minimum trade amount (in UPs or DOWNs - usually 3)
  const minTradeAmount = Number(data.minTradeAmount) / 1e18;

  let finalAmount = 0,
    quote = 0;

  // Lists the maximum amount of tokens that can be bought from the AMM in a position direction (0=UP, 1=DOWN)
  const maxAmmAmount =
    (await contract.availableToBuyFromAMM(market.address, market.position)) /
    1e18;

  // Get the available allocation for this market in this round
  // const availableAllocationForRound = Number(data.tradingAllocation) / 1e18;
  const availableAllocationForRound = Number(allocation / BigInt(1e18));
  const availableAllocationForMarket = availableAllocationForRound * 0.05;

  let availableAllocationPerAsset = availableAllocationForMarket;
  // if the round hasnt been created yet, create it
  // if (!data.tradedInRoundAlready[round]) {
  //   console.log("tradedInRoundAlready is empty");

  //   // create an archive of the data up to the previous round
  //   fs.writeFileSync(
  //     `./data/archive/round_${round - 1}.json`,
  //     JSON.stringify(data, null, 2)
  //   );
  //   data.tradedInRoundAlready[round] = [];
  //   // clear errorLog and transactionLog
  //   data.errorLog = [];
  //   data.tradeLog = [];
  // }
  // if (!data.tradingMarketPositionPerRound[round]) {
  //   console.log("tradingMarketPositionPerRound is empty");
  //   data.tradingMarketPositionPerRound[round] = {};
  // }
  // if (!data.availableAllocationPerMarket[round]) {
  //   console.log("availableAllocationPerMarket is empty");
  //   data.availableAllocationPerMarket[round] = {};
  // }
  // check to see if market.address is in data.availableAllocationPerMarket. If it is, update availableAllocationPerAsset, if not, use default value.
  for (let i = 0; i < data.tradeLog.length; i++) {
    if (data.tradeLog[i].market == market.address) {
      let previousQuote = +data.tradeLog[i].quote;
      availableAllocationPerAsset =
        availableAllocationForMarket - previousQuote;
      break;
    }
  }

  // if (data.availableAllocationPerMarket[round][market.address]) {
  //   availableAllocationPerAsset =
  //     data.availableAllocationPerMarket[round][market.address] / 1e18;
  // } else {
  //   availableAllocationPerAsset = availableAllocationForMarket;
  // }
  console.log(
    `Available allocation for market: $${availableAllocationPerAsset.toFixed(
      2
    )}`
  );
  const maxAllocationAmount = availableAllocationPerAsset / market.price; // this is a cieling value, as it would a trade with zero slippage
  let amount = Math.round(maxAllocationAmount);
  if (
    maxAmmAmount < minTradeAmount ||
    amount < minTradeAmount ||
    maxAmmAmount == 0
  ) {
    return { amount: 0, quote: 0, position: market.position };
  }
  while (amount < maxAmmAmount) {
    let skewImpact =
      (await contract.buyPriceImpact(
        market.address,
        market.position,
        w3utils.toWei(amount.toString())
      )) / 1e18;
    console.log(
      `Simulated puchase impact for ${amount} ${market.currencyKey} ${
        market.position > 0 ? "DOWN" : "UP"
      }s = Skew Impact: ${
        skewImpact <= 0 ? skewImpact.toFixed(5) : skewImpact.toFixed(5)
      } Skew Impact Limit: ${skewImpactLimit}`
    );
    if (skewImpact <= skewImpactLimit) break;
    amount = Math.floor(amount * 0.95);
    if (amount <= minTradeAmount) {
      console.log(`Amount to buy is too small.`);
      return { amount: 0, quote: 0, position: market.position };
    }
  }

  // Get the quote for the amount of tokens to buy. If the quote is over the max allocation, then reduce the amount to buy
  quote =
    (await contract.buyFromAmmQuote(
      market.address,
      market.position,
      w3utils.toWei(amount.toString())
    )) / decimals;
  console.log(
    `${amount} ${market.currencyKey} ${
      market.position > 0 ? "DOWN" : "UP"
    } Quote: Price: $${quote.toFixed(
      2
    )} Max Allocation: $${availableAllocationPerAsset.toFixed(2)}`
  );
  while (quote > availableAllocationPerAsset) {
    console.log(
      `Quoted price ($${quote.toFixed(
        2
      )}) is too high. Reducing quantity from ${amount} to ${Math.floor(
        amount * 0.99
      )}`
    );
    amount = Math.floor(amount * 0.99);
    if (amount <= minTradeAmount) {
      console.log(`Amount to buy is too small.`);
      return { amount: 0, quote: 0, position: market.position };
    }
    quote =
      (await contract.buyFromAmmQuote(
        market.address,
        market.position,
        w3utils.toWei(amount.toString())
      )) / decimals;
    console.log(
      `New quote: $${quote.toFixed(2)} for ${amount} ${market.currencyKey} ${
        market.position > 0 ? "DOWN" : "UP"
      }`
    );
  }
  finalAmount = amount.toFixed(0);

  finalQuote =
    (await contract.buyFromAmmQuote(
      market.address,
      market.position,
      w3utils.toWei(finalAmount.toString())
    )) / decimals;
  console.log(
    `Quoted Price: $${finalQuote.toFixed(
      2
    )} Max Allocation: $${availableAllocationPerAsset.toFixed(
      2
    )}. Amount to buy: ${finalAmount}`
  );

  // console.log(`Amount: ${finalAmount} Quote: ${finalQuote}`);
  return { amount: finalAmount, quote: finalQuote, position: market.position };
}

async function executeTrade(market, result, round, gasp, contract, networkId) {
  // market { address: '0xc1af77a1efea7326df378af9195306f0a3094f51', position: 1, currencyKey: 'LINK', price: 0.8111760272895937 }
  //result { amount: '494', quote: 406.5630697385673, position: 1 }
  // slippage: "5000000000000000"

  let network =
    networkId == "42161"
      ? "arbitrum"
      : networkId == "56"
      ? "bsc"
      : networkId == "137"
      ? "polygon"
      : "optimism";

  if (result.amount > 0) {
    try {
      // Check if this market has already been traded in this round. Returns true or false.
      let tradedInRoundAlready;
      let tradedBeforePosition;
      for (let i = 0; i < data.tradeLog.length; i++) {
        if (market.address == data.tradeLog[i].market) {
          tradedInRoundAlready = true;
          tradedBeforePosition = data.tradeLog[i].position == "UP" ? 0 : 1;
          console.log(
            `Previous Position: ${
              tradedBeforePosition > 0 ? "DOWN" : "UP"
            } (${tradedBeforePosition})`
          );
          if (tradedBeforePosition != market.position) {
            console.log(
              "Market already traded in round, but with different position. Skipping"
            );
            return;
          }
        } else {
          tradedInRoundAlready = false;
        }
      }

      if (tradedInRoundAlready) {
        console.log(
          `Market already traded in round with same position. Skipping until I fix the log issue`
        );
        return;
      }

      // console.log(`Executing trade for ${market.currencyKey}...`);
      // return;

      // Execute trade
      let tx = await contract.buyFromAMM(
        market.address,
        result.position.toString(),
        w3utils.toWei(result.amount.toString()),
        w3utils.toWei(result.quote.toString()),
        "2500000000000000",
        { gasLimit: "10000000", gasPrice: gasp.add(gasp.div(5)).toString() }
      );
      let reciept = await tx.wait();
      let transactionHash = reciept.transactionHash;
      console.log(`Transaction hash: ${transactionHash}`);
      let timestamp = new Date().toLocaleString("en-US");
      // Create a log of the trade
      let tradeLog = {
        network: network,
        round: round.toString(),
        currencyKey: market.currencyKey,
        market: market.address,
        position: result.position > 0 ? "DOWN" : "UP",
        amount: result.amount,
        quote: result.quote.toString(),
        timestamp: timestamp,
        transactionHash: transactionHash,
      };
      data.tradeLog.push(tradeLog);
      // Log the details of the trade (quantity, price, market address, etc.) and save to data

      // if the market hasnt been created yet, create it
      // if (!data.tradedInRoundAlready[round][market.address]) {
      //   data.tradedInRoundAlready[round].push(market.address);
      //   console.log(`Pushed ${market.address} to tradedInRoundAlready`);
      // }

      // if (!data.tradingMarketPositionPerRound[round][market.address]) {
      //   data.tradingMarketPositionPerRound[round][market.address] =
      //     result.position.toString();
      //   console.log(
      //     `Pushed ${result.position} (${
      //       result.position > 0 ? "DOWN" : "UP"
      //     }) to tradingMarketPositionPerRound`
      //   );
      // }
      // let quotedAmount = result.quote.toFixed(0); // prevents precision errors when converting to BigInt
      // if (data.availableAllocationPerMarket[round][market.address]) {
      //   let priorAllowance = BigInt(
      //     data.availableAllocationPerMarket[round][market.address]
      //   );
      //   let newAllowance = priorAllowance - BigInt(quotedAmount) * BigInt(1e18);
      //   data.availableAllocationPerMarket[round][market.address] =
      //     newAllowance.toString();
      //   console.log(
      //     `Pushed ${
      //       newAllowance / BigInt(1e18)
      //     } to availableAllocationPerMarket`
      //   );
      // } else if (!data.availableAllocationPerMarket[round][market.address]) {
      //   let newAllowance =
      //     BigInt(data.tradingAllocation) / BigInt(20) -
      //     BigInt(quotedAmount) * BigInt(1e18);
      //   data.availableAllocationPerMarket[round][market.address] =
      //     newAllowance.toString();
      //   console.log(
      //     `Pushed ${
      //       newAllowance * BigInt(1e18)
      //     } to availableAllocationPerMarket`
      //   );
      // }
    } catch (e) {
      let error = e.reason ? e.reason : e.message;
      let timestamp = new Date().toLocaleString("en-US");
      let errorMessage = {
        network: network,
        round: round.toString(),
        currencyKey: market.currencyKey,
        market: market.address,
        position: market.position > 0 ? "DOWN" : "UP",
        amount: result.amount,
        quote: result.quote.toString(),
        error: error,
        timestamp: timestamp,
      };
      console.log(error);
      data.errorLog.push(errorMessage);
    }
  }
}

module.exports = {
  processVault,
  setOptimismVariables,
  evaluateMarkets,
  amountToBuy,
  executeTrade,
};
