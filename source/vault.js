require("dotenv").config();

const constants = require("../constants.js");
const ethers = require("ethers");
const w3utils = require("web3-utils");
const wallet = new ethers.Wallet(constants.privateKey, constants.etherprovider);

const Vault = require("../contracts/Vault.js");
const ThalesAMM = require("../contracts/ThalesAMM.js");
const marketschecker = require("./marketschecker.js");

const { performance } = require("perf_hooks");

// const Discord = require("discord.js");
// const vaultBot = new Discord.Client();
// vaultBot.login(process.env.VAULT_BOT_TOKEN);

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
async function processVault() {
  console.log("Processing vault. Getting Gas Price...");
  let gasp = await constants.etherprovider.getGasPrice();
  console.log("Gas Price: " + gasp.toString());

  const round = await VaultContract.round();
  const roundEndTime = (await VaultContract.getCurrentRoundEnd()).toString();
  let closingDate = new Date(roundEndTime * 1000.0).getTime();

  const priceUpperLimit = (await VaultContract.priceUpperLimit()) / 1e18;
  const priceLowerLimit = (await VaultContract.priceLowerLimit()) / 1e18;

  const skewImpactLimit = (await VaultContract.skewImpactLimit()) / 1e18;

  await testTrade(
    priceLowerLimit,
    priceUpperLimit,
    skewImpactLimit,
    round,
    closingDate,
    gasp
  );
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

async function amountToBuy(market, round, skewImpactLimit) {
  console.log("Building quote. Getting min trade amount...");

  const minTradeAmount = (await VaultContract.minTradeAmount()) / 1e18;
  console.log(
    `Min trade amount: ${minTradeAmount}. Calculating max trade amount...`
  );
  let amount = 0,
    finalAmount = 0,
    quote = 0,
    finalQuote = 0,
    step = minTradeAmount;

  const maxAmount =
    (await thalesAMMContract.availableToBuyFromAMM(
      market.address,
      market.position
    )) / 1e18;
  console.log(`Max amount: ${maxAmount}. Calculating available allocation...`);

  const availableAllocationPerAsset =
    (await VaultContract.getAvailableAllocationForMarket(market.address)) /
    1e18;

  console.log(`Available allocation: ${availableAllocationPerAsset}`);

  if (maxAmount < minTradeAmount) {
    console.log("Max amount is less than min trade amount - skipping market");
    return { amount: 0, quote: 0, position: market.position };
  }
  console.log("Processing bid amount for: ", market.address);

  // while (amount < maxAmount) {
  //   finalAmount = amount;
  //   amount += step;

  //   console.log(
  //     `Determining Skew Impact for bid of: ${amount}. Address: ${
  //       market.address
  //     } Position: ${market.position} Amount: ${w3utils.toWei(
  //       amount.toString()
  //     )}`
  //   );
  let skewImpact = await buyPriceImpact(
    market.address,
    market.position,
    w3utils.toWei(amount.toString())
  );

  //   console.log(
  //     `comparing skew impact ${skewImpact} with limit ${skewImpactLimit}`
  //   );

  //   if (skewImpact >= skewImpactLimit) {
  //     console.log(
  //       `The calculated skew impact (${skewImpact}) is bigger than the limit of ${skewImpactLimit}`
  //     );
  //     break;
  //   }

  //   finalQuote = quote;
  //   quote =
  //     (await thalesAMMContract.buyFromAmmQuote(
  //       market.address,
  //       market.position,
  //       w3utils.toWei(amount.toString())
  //     )) / 1e18;

  //   if (quote >= availableAllocationPerAsset) {
  //     console.log(
  //       `The calculated quote (${quote}) is bigger than the available allocation per asset ${availableAllocationPerAsset}`
  //     );
  //     break;
  //   }
  // }

  console.log(
    `Final amount: ${finalAmount}, final quote: ${finalQuote}, position: ${
      market.position === 1 ? "DOWN" : "UP"
    }}`
  );
  return { amount: finalAmount, quote: finalQuote, position: market.position };
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
      `Processing ${market.currencyKey} market ${market.address} ...`
    );

    let tradedInRoundAlready = await VaultContract.isTradingMarketInARound(
      round,
      market.address
    );

    console.log(`Acquired by vault within round: ${tradedInRoundAlready}`);

    if (tradedInRoundAlready) {
      console.log("Market already traded in round. ");
      let tradedBeforePosition =
        await VaultContract.tradingMarketPositionPerRound(
          round,
          market.address
        );
      console.log(
        `Position: ${
          tradedBeforePosition > 0 ? "DOWN" : "UP"
        } (${tradedBeforePosition})`
      );
      if (tradedBeforePosition != market.position) {
        console.log(
          "Market already traded in round, but with different position (0=UP, 1=DOWN, 2=DRAW). Skipping ..."
        );
        continue;
      }
    }

    let result = await amountToBuy(market, round, skewImpactLimit);

    console.log("Trying to buy amount", result.amount);
    console.log("Quote", result.quote);

    console.log("Trying to trade...");
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

  console.log("Markets to trade", tradingMarkets);
}

async function buyPriceImpact(address, position, amount) {
  let skewImpact =
    (await thalesAMMContract.buyPriceImpact(
      address,
      position,
      w3utils.toWei(amount.toString())
    )) / 1e18;
  return skewImpact;
}

function binarySearch(min, max, func) {
  let mid = (min + max) / 2;
  let result = func(mid);
  if (result == 0) {
    return mid;
  } else if (result > 0) {
    return binarySearch(min, mid, func);
  } else {
    return binarySearch(mid, max, func);
  }
}

module.exports = {
  processVault,
};
