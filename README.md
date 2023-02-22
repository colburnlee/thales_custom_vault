# vault-bots

This repository contains bots that are used to execute trades on Vault contracts for Thales and OvertimeMarkets. It is a side project that is not maintained by Thales team. My goal is to use the Thales team code as a starting point and branch out from there.

Important files:

1. `index.js` - bot which checks markets, filters markets eligible for Vault trade and then executes trades.
2. `marketschecker.js` - script that filters markets based on Vault price limits
3. `vault.js` - script that is executing trades

NOTE: PLEASE CHECK ABI FILES TO BE UP TO DATE!

## Order of execution

index.js -> doLoop() -> doMain() -> vault.js -> ...
processVault() -> await trade() -> await closeRound()

## Vault Addresses

- https://contracts.thalesmarket.io/

## .ENV file:

```
---------------------------
PRIVATE_KEY="WALLET PRIVATE KEY"
WALLET="WALLET ADDRESS"
INFURA="INFURA_KEY"
INFURA_URL="https://optimism.infura.io/v3/INFURA_KEY"
NETWORK="Optimism"
NETWORK_ID="10"

VAULT_CONTRACT="0x6c7Fd4321183b542E81Bcc7dE4DfB88F9DBca29F"
THALES_AMM_CONTRACT="0x278B5A44397c9D8E52743fEdec263c4760dc1A1A"
POSITIONAL_MARKET_DATA_CONTRACT="0x21382a033E581a2D685826449d6c9b3d6507e23C"
SPORT_POSITIONAL_MARKET_DATA_CONTRACT="0xd8Bc9D6840C701bFAd5E7cf98CAdC2ee637c0701"
TX_EXPLORER_URL="https://optimistic.etherscan.io/tx/"
DELAY_IN_MINUTES="1"

---------------------------
```

** NOTE: this properties are set is for kovan network please check next variables for MAIN **
