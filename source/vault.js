require("dotenv").config();

const constants = require("../constants.js");
const ethers = require("ethers");
const w3utils = require("web3-utils");
const wallet = new ethers.Wallet(constants.privateKey, constants.etherprovider);

const Vault = require("../contracts/Vault.js");
const ThalesAMM = require("../contracts/ThalesAMM.js");
const marketschecker = require("./marketschecker.js");

const data = require("../data.json");
const fs = require("fs");

const thalesAMMContract = new ethers.Contract(
  process.env.THALES_AMM_CONTRACT,
  ThalesAMM.thalesAMMContract.abi,
  wallet
);

const VaultContract = new ethers.Contract(
  process.env.AMM_VAULT_CONTRACT,
  Vault.vaultContract.abi,
  wallet
);

// Test trade function ON
async function processVault(auth) {
  console.log("Processing local data...");
  const priceUpperLimit = Number(data.priceUpperLimit) / 1e18;
  const priceLowerLimit = Number(data.priceLowerLimit) / 1e18;
  const skewImpactLimit = Number(data.skewImpactLimit) / 1e18;

  console.log("Processing vault...");
  let gasp = await constants.etherprovider.getGasPrice();
  const round = await VaultContract.round();
  const roundEndTime = (await VaultContract.getCurrentRoundEnd()).toString();
  let closingDate = new Date(roundEndTime * 1000.0).getTime();

  console.log(
    `Vault Information... Round: ${round}, Price Upper Limit: ${priceUpperLimit}, Price Lower Limit: ${priceLowerLimit}, Skew Impact Limit: ${skewImpactLimit}  `
  );

  await testTrade(
    priceLowerLimit,
    priceUpperLimit,
    skewImpactLimit,
    round,
    closingDate,
    gasp
  );
}

async function amountToBuy(market, round, skewImpactLimit) {
  // Get the minimum trade amount (in UPs or DOWNs - usually 3)
  const minTradeAmount = Number(data.minTradeAmount) / 1e18;
  let finalAmount = 0,
    quote = 0,
    step = 10;
  // step = minTradeAmount;
  // finalQuote = 0

  // Lists the maximum amount of tokens that can be bought from the AMM in a position direction (0=UP, 1=DOWN)
  const maxAmmAmount =
    (await thalesAMMContract.availableToBuyFromAMM(
      market.address,
      market.position
    )) / 1e18;

  // Get the available allocation for this market in this round
  const availableAllocationForRound = Number(data.tradingAllocation) / 1e18;

  console.log(
    `Available allocation for this round: $${availableAllocationForRound.toFixed(
      2
    )}`
  );
  let availableAllocationPerAsset;
  // check to see if market.address is in data.availableAllocationPerMarket. If it is, update availableAllocationPerAsset, if not, use default value.
  if (data.availableAllocationPerMarket[round][market.address]) {
    availableAllocationPerAsset =
      data.availableAllocationPerMarket[round][market.address] / 1e18;
  } else {
    availableAllocationPerAsset = availableAllocationForRound * 0.05;
  }
  console.log(
    `Available allocation for this (${
      market.currencyKey
    }) market: $${availableAllocationPerAsset.toFixed(2)}`
  );
  const maxAllocationAmount = availableAllocationPerAsset / market.price; // this is a cieling value, as it would a trade with zero slippage
  let amount = Math.round(maxAllocationAmount);
  if (
    maxAmmAmount < minTradeAmount ||
    amount < minTradeAmount ||
    maxAmmAmount == 0
  ) {
    console.log("Not enough liquidity to trade this market");
    return { amount: 0, quote: 0, position: market.position };
  }
  while (amount < maxAmmAmount) {
    let skewImpact =
      (await thalesAMMContract.buyPriceImpact(
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
    amount =
      Math.floor(amount * 0.95) < minTradeAmount
        ? minTradeAmount
        : Math.floor(amount * 0.95);
  }

  // Get the quote for the amount of tokens to buy. If the quote is over the max allocation, then reduce the amount to buy
  quote =
    (await thalesAMMContract.buyFromAmmQuote(
      market.address,
      market.position,
      w3utils.toWei(amount.toString())
    )) / 1e18;
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
    amount =
      Math.floor(amount * 0.99) < minTradeAmount
        ? minTradeAmount
        : Math.floor(amount * 0.99);
    quote =
      (await thalesAMMContract.buyFromAmmQuote(
        market.address,
        market.position,
        w3utils.toWei(amount.toString())
      )) / 1e18;
    console.log(
      `New quote: $${quote.toFixed(2)} for ${amount} ${market.currencyKey} ${
        market.position > 0 ? "DOWN" : "UP"
      }`
    );
  }
  finalAmount = amount.toFixed(0);

  finalQuote =
    (await thalesAMMContract.buyFromAmmQuote(
      market.address,
      market.position,
      w3utils.toWei(finalAmount.toString())
    )) / 1e18;
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

async function testTrade(
  priceLowerLimit,
  priceUpperLimit,
  skewImpactLimit,
  round,
  roundEndTime,
  gasp
) {
  let tradingMarkets = await marketschecker.processMarkets(
    priceLowerLimit,
    priceUpperLimit,
    roundEndTime,
    skewImpactLimit
  );

  for (const key in tradingMarkets) {
    let market = tradingMarkets[key];
    console.log(
      `--------------------Processing ${market.currencyKey} ${
        market.position > 0 ? "DOWN" : "UP"
      } at ${market.address}-------------------`
    );

    // Check if this market has already been traded in this round. Returns true or false.
    // let tradedInRoundAlready = await VaultContract.isTradingMarketInARound(
    //   round,
    //   market.address
    // );
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
    let result = await amountToBuy(market, round, skewImpactLimit);

    if (result.amount > 0) {
      console.log(
        `Executing order to buy ${result.amount} ${
          market.position > 0 ? "DOWN" : "UP"
        }s ($${result.quote.toFixed(2)}) of ${market.currencyKey} at ${
          market.address
        }`
      );
      executeTrade(market, result, round, gasp);
    } else {
      console.log(
        `No trade made for ${market.currencyKey} ${
          market.position > 0 ? "DOWN" : "UP"
        } at ${market.address}`
      );
    }
    // if (result.amount > 0) {
    //   try {
    //     let tx = await VaultContract.trade(
    //       market.address,
    //       w3utils.toWei(result.amount.toString()),
    //       result.position,
    //       {
    //         gasLimit: 10000000,
    //         gasPrice: gasp.add(gasp.div(5)),
    //       }
    //     );
    //     let receipt = await tx.wait();
    //     let transactionHash = receipt.transactionHash;
    //     console.log("Transaction hash", transactionHash);
    //     // await sendTradeSuccessMessage(market, result, transactionHash);
    //     console.log("Trade made");
    //   } catch (e) {
    //     let errorBody = JSON.parse(e.error.error.body);
    //     console.log("Trade failed", errorBody);
    //     // await sendTradeErrorMessage(market.address, errorBody.error.message);
    //   }
    // }
  }
}

// TODO: Create a Solidity contract to interact with a personal vault contract.
function executeTrade(market, result, round, gasp) {
  // market { address: '0xc1af77a1efea7326df378af9195306f0a3094f51', position: 1, currencyKey: 'LINK', price: 0.8111760272895937 }
  //result { amount: '494', quote: 406.5630697385673, position: 1 }

  const formattedAmount = w3utils.toWei(result.amount.toString());
  const formattedQuote = BigInt(w3utils.toWei(result.quote.toString()));
  // VaultContract.trade(
  //   market.address,
  //   formattedAmount,
  //   market.position,
  //   {
  //     gasLimit: 10000000,
  //     gasPrice: gasp.add(gasp.div(5)),
  //   }
  // )
  //   .then((tx) => {
  //     tx.wait().then((receipt) => {
  //       let transactionHash = receipt.transactionHash;
  //       console.log("Transaction hash", transactionHash);
  console.log("Trade made");
  // Log the details of the trade (quantity, price, market address, etc.) and save to data

  data.tradingMarketPositionPerRound[round][market.address] = market.position;
  let newAllowance;
  // if availableAllocationPerMarket has a balance, subtract the amount traded from it.
  let availableAllocationPerMarket =
    BigInt(data.tradingAllocation) / BigInt(20);
  if (data.availableAllocationPerMarket[round][market.address]) {
    console.log("Market has already been traded in this round.");
    let priorAllowance = BigInt(
      data.availableAllocationPerMarket[round][market.address]
    );
    newAllowance = priorAllowance - BigInt(formattedQuote);
    // update the newAllowance to replace the old one in the data object
    data.availableAllocationPerMarket[round][market.address] =
      newAllowance.toString();
  } else {
    console.log("Market has not been traded in this round yet.");
    // If not, set it to tradingAllocation - amount quoted.
    data.tradedInRoundAlready[round].push(market.address);
    newAllowance = availableAllocationPerMarket - BigInt(formattedQuote);
    data.availableAllocationPerMarket[round][market.address] =
      newAllowance.toString();
  }
  console.log(
    `New allowance for ${market.address} is ${newAllowance} ($${
      newAllowance / BigInt(1e18)
    })`
  );
  // save the data to the file
  fs.writeFileSync(
    "./data.json",
    JSON.stringify(data, null, 2),
    "utf-8",
    (err) => {
      if (err) throw err;
    }
  );
  console.log("Data written to file");

  //   });
  // })
  // .catch((e) => {
  //   let errorBody = JSON.parse(e.error.error.body);
  //   console.log("Trade failed", errorBody);
  //   sendTradeErrorMessage(market.address, errorBody.error.message);
  // });
}

async function trade(
  priceLowerLimit,
  priceUpperLimit,
  skewImpactLimit,
  round,
  roundEndTime,
  gasp
) {
  let tradingMarkets = await marketschecker.processMarkets(
    priceLowerLimit,
    priceUpperLimit,
    roundEndTime,
    skewImpactLimit
  );

  for (const key in tradingMarkets) {
    let market = tradingMarkets[key];

    let tradedInRoundAlready = await VaultContract.isTradingMarketInARound(
      round,
      market.address
    );
    if (tradedInRoundAlready) {
      let tradedBeforePosition =
        await VaultContract.tradingMarketPositionPerRound(
          round,
          market.address
        );
      if (tradedBeforePosition != market.position) {
        continue;
      }
    }

    let result = await amountToBuy(market, round, skewImpactLimit);

    console.log("Trying to buy amount", result.amount);
    console.log("Quote", result.quote);

    if (result.amount > 0) {
      try {
        let tx = await VaultContract.trade(
          market.address,
          w3utils.toWei(result.amount.toString()),
          result.position,
          {
            gasLimit: 10000000,
            gasPrice: gasp.add(gasp.div(5)),
          }
        );
        let receipt = await tx.wait();
        let transactionHash = receipt.transactionHash;
        console.log("Transaction hash", transactionHash);
        // await sendTradeSuccessMessage(market, result, transactionHash);
        console.log("Trade made");
      } catch (e) {
        let errorBody = JSON.parse(e.error.error.body);
        console.log("Trade failed", errorBody);
        // await sendTradeErrorMessage(market.address, errorBody.error.message);
      }
    }
  }

  console.log("Finished trading markets  ");
}

async function sendTradeSuccessMessage(market, result, transactionHash) {
  var message = new Discord.MessageEmbed()
    .addFields(
      {
        name: ":coin: Vault trade made :coin:",
        value: "\u200b",
      },
      {
        name: `${
          market.position == 1
            ? ":chart_with_downwards_trend:"
            : ":chart_with_upwards_trend:"
        } Bought`,
        value: `${result.amount} ${
          market.position == 1 ? "DOWN" : "UP"
        } options`,
      },
      {
        name: ":dollar: Amount spent",
        value: `${parseFloat(result.quote).toFixed(4)} sUSD`,
      },
      {
        name: ":bank: Market",
        value: market.address,
      },
      {
        name: ":receipt: Transaction",
        value: `[View on block explorer](${process.env.TX_EXPLORER_URL}${transactionHash})`,
      }
    )
    .setColor("#00ffb3");
  let vaultInfo = await vaultBot.channels.fetch(process.env.SUCCESS_CHANNEL_ID);
  vaultInfo.send(message);
}

async function sendTradeErrorMessage(address, message) {
  var message = new Discord.MessageEmbed()
    .addFields(
      {
        name: ":exclamation: Vault trade error :exclamation:",
        value: "\u200b",
      },
      {
        name: "Market",
        value: address,
      },
      {
        name: "Message",
        value: message,
      }
    )
    .setColor("#a83232");
  let vaultInfo = await vaultBot.channels.fetch(process.env.ERROR_CHANNEL_ID);
  vaultInfo.send(message);
}

async function sendRoundErrorMessage(message) {
  var message = new Discord.MessageEmbed()
    .addFields(
      {
        name: ":exclamation: Close round error :exclamation:",
        value: "\u200b",
      },
      {
        name: "Message",
        value: message,
      }
    )
    .setColor("#a83232");
  let vaultInfo = await vaultBot.channels.fetch(process.env.ERROR_CHANNEL_ID);
  vaultInfo.send(message);
}

function getAsset(currencyKey) {
  if (currencyKey == "ETH") {
    return Asset.ETH;
  } else if (currencyKey == "BTC") {
    return Asset.BTC;
  } else {
    return Asset.Other;
  }
}

function delay(time) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

async function buyPriceImpact(address, position, amount) {
  let skewImpact = await thalesAMMContract.buyPriceImpact(
    address,
    position,
    w3utils.toWei(amount.toString())
  );
  return skewImpact / 1e18;
}

module.exports = {
  processVault,
};
