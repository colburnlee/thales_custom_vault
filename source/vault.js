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

async function processVault() {
  let gasp = await constants.etherprovider.getGasPrice();

  const round = await VaultContract.round();
  const roundEndTime = (await VaultContract.getCurrentRoundEnd()).toString();
  let closingDate = new Date(roundEndTime * 1000.0).getTime();

  const priceUpperLimit = (await VaultContract.priceUpperLimit()) / 1e18;
  const priceLowerLimit = (await VaultContract.priceLowerLimit()) / 1e18;

  const skewImpactLimit = (await VaultContract.skewImpactLimit()) / 1e18;

  await trade(
    priceLowerLimit,
    priceUpperLimit,
    skewImpactLimit,
    round,
    closingDate,
    gasp
  );

  await closeRound(closingDate);
}

async function closeRound(roundEndTime) {
  console.log("Trying to close the round");
  try {
    let now = new Date();

    if (now.getTime() > roundEndTime) {
      let canCloseRound = await VaultContract.canCloseCurrentRound();
      if (canCloseRound) {
        let tx = await VaultContract.closeRound();
        await tx.wait().then((e) => {
          console.log("Round closed");
        });
      }
    } else {
      console.log("Cannot close round yet");
    }
  } catch (e) {
    let errorBody = JSON.parse(e.error.error.body);
    console.log("Failed to close the round", errorBody.error.message);
    await sendRoundErrorMessage(errorBody.error.message);
  }
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
        // await sendTradeSuccessMessage(market, result, transactionHash);
        console.log("Trade made");
      } catch (e) {
        let errorBody = JSON.parse(e.error.error.body);
        console.log("Trade failed", errorBody);
        await sendTradeErrorMessage(market.address, errorBody.error.message);
      }
    }
  }

  console.log("Finished trading markets  ");
}

async function amountToBuy(market, round, skewImpactLimit) {
  const minTradeAmount = (await VaultContract.minTradeAmount()) / 1e18;
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

  const availableAllocationPerAsset =
    (await VaultContract.getAvailableAllocationForMarket(market.address)) /
    1e18;
  if (maxAmount < minTradeAmount) {
    return { amount: 0, quote: 0, position: market.position };
  }
  console.log("Processing market", market.address);

  while (amount < maxAmount) {
    finalAmount = amount;
    amount += step;

    let skewImpact =
      (await thalesAMMContract.buyPriceImpact(
        market.address,
        market.position,
        w3utils.toWei(amount.toString())
      )) / 1e18;

    if (skewImpact >= skewImpactLimit) break;

    finalQuote = quote;
    quote =
      (await thalesAMMContract.buyFromAmmQuote(
        market.address,
        market.position,
        w3utils.toWei(amount.toString())
      )) / 1e18;

    if (quote >= availableAllocationPerAsset) break;
  }

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

module.exports = {
  processVault,
};
