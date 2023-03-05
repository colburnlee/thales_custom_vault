require("dotenv").config();
const constants = require("../constants.js");
const ethers = require("ethers");
const w3utils = require("web3-utils");

const Vault = require("../contracts/Vault.js");
const ThalesAMM = require("../contracts/ThalesAMM.js");
const marketschecker = require("./marketschecker.js");

const data = require("../data.json");
const fs = require("fs");

const wallet = new ethers.Wallet(constants.privateKey, constants.etherprovider);
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

const positionalContractAddress = process.env.POSITIONAL_MARKET_DATA_CONTRACT;
const PositionalMarketDataContract = require("../contracts/PositionalMarketData.js");
const networkId = process.env.NETWORK_ID;

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

  console.log("Processing vault complete.");
  fs.writeFileSync("data.json", JSON.stringify(data, null, 2));
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

  let availableAllocationPerAsset;
  // check to see if market.address is in data.availableAllocationPerMarket. If it is, update availableAllocationPerAsset, if not, use default value.
  if (data.availableAllocationPerMarket[round][market.address]) {
    availableAllocationPerAsset =
      data.availableAllocationPerMarket[round][market.address] / 1e18;
  } else {
    availableAllocationPerAsset = availableAllocationForRound * 0.05;
  }
  console.log(
    `Available allocation market: $${availableAllocationPerAsset.toFixed(2)}`
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
    skewImpactLimit,
    wallet,
    positionalContractAddress,
    PositionalMarketDataContract,
    networkId
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
    let result = await amountToBuy(market, round, skewImpactLimit);

    if (result.amount > 0) {
      console.log(
        `Executing order to buy ${result.amount} ${
          market.position > 0 ? "DOWN" : "UP"
        }s ($${result.quote.toFixed(2)}) of ${market.currencyKey} at ${
          market.address
        }`
      );
      await executeTrade(market, result, round, gasp);
    } else {
      console.log(
        `No trade made for ${market.currencyKey} ${
          market.position > 0 ? "DOWN" : "UP"
        } at ${market.address}`
      );
    }
  }
}

async function executeTrade(market, result, round, gasp) {
  // market { address: '0xc1af77a1efea7326df378af9195306f0a3094f51', position: 1, currencyKey: 'LINK', price: 0.8111760272895937 }
  //result { amount: '494', quote: 406.5630697385673, position: 1 }
  // slippage: "5000000000000000"

  if (result.amount > 0) {
    try {
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

      if (tradedInRoundAlready) {
        console.log(
          `Market already traded in round with same position. Skipping until I fix the log issue`
        );
        return;
      }

      // Execute trade
      let tx = await thalesAMMContract.buyFromAMM(
        market.address,
        market.position,
        w3utils.toWei(result.amount.toString()),
        w3utils.toWei(result.quote.toString()),
        "2500000000000000",
        { gasLimit: 10000000, gasPrice: gasp.add(gasp.div(5)) }
      );
      let reciept = await tx.wait();
      let transactionHash = reciept.transactionHash;
      console.log(`Transaction hash: ${transactionHash}`);
      // Create a log of the trade
      let tradeLog = {
        market: market.address,
        position: market.position,
        amount: result.amount,
        quote: result.quote,
        transactionHash: transactionHash,
      };
      data.tradeLog.push(tradeLog);
      // Log the details of the trade (quantity, price, market address, etc.) and save to data

      // if the round hasnt been created yet, create it
      if (!data.tradedInRoundAlready[round]) {
        console.log("tradedInRoundAlready is empty");
        data.tradedInRoundAlready[round] = [];
      }
      if (!data.tradingMarketPositionPerRound[round]) {
        console.log("tradingMarketPositionPerRound is empty");
        data.tradingMarketPositionPerRound[round] = {};
      }
      if (!data.availableAllocationPerMarket[round]) {
        console.log("availableAllocationPerMarket is empty");
        data.availableAllocationPerMarket[round] = {};
      }

      // if the market hasnt been created yet, create it
      if (!data.tradedInRoundAlready[round].includes(market.address)) {
        data.tradedInRoundAlready[round].push(market.address);
        console.log(`Pushed ${market.address} to tradedInRoundAlready`);
      }
      if (!data.tradingMarketPositionPerRound[round][market.address]) {
        data.tradingMarketPositionPerRound[round][market.address] =
          market.position.toString();
        console.log(
          `Pushed ${market.position} to tradingMarketPositionPerRound`
        );
      }
      if (data.availableAllocationPerMarket[round][market.address]) {
        let priorAllowance = BigInt(
          data.availableAllocationPerMarket[round][market.address]
        );
        let newAllowance = priorAllowance - BigInt(w3utils.toWei(result.quote));
        data.availableAllocationPerMarket[round][market.address] =
          newAllowance.toString();
        console.log(
          `Pushed ${
            newAllowance / BigInt(1e18)
          } to availableAllocationPerMarket`
        );
      } else if (!data.availableAllocationPerMarket[round][market.address]) {
        let newAllowance =
          BigInt(data.tradingAllocation) / BigInt(20) -
          BigInt(w3utils.toWei(result.quote));
        data.availableAllocationPerMarket[round][market.address] =
          newAllowance.toString();
        console.log(
          `Pushed ${
            newAllowance / BigInt(1e18)
          } to availableAllocationPerMarket`
        );
      }
    } catch (e) {
      console.log(e);
      data.errorLog.push(e);
    }
  }
}

module.exports = {
  processVault,
};
