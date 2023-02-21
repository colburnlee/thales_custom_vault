# vault-bots

Important files:

1. `index.js` - bot which checks markets, filters markets eligible for Vault trade and then executes trades.
2. `marketschecker.js` - script that filters markets based on Vault price limits
3. `vault.js` - script that is executing trades

NOTE: PLEASE CHECK ABI FILES TO BE UP TO DATE!

- Add .env file with following variables set:

```
---------------------------
PRIVATE_KEY="WALLET PRIVATE KEY"
WALLET="WALLET ADDRESS"
INFURA="INFURA_KEY"
INFURA_URL="https://optimism-kovan.infura.io/v3/INFURA_KEY"
NETWORK="NETWORK NAME"
NETWORK_ID="NETWORK ID"

VAULT_CONTRACT="0x9e8706B070Df6A30eFE980041eF5d1426C93f6be"
MANAGER_CONTRACT="0xAfBA2e76B4580Ab88c07Beb2Ca884ca733fD4dD4"
THALES_AMM_CONTRACT="0xfed727f37e921Faac22e36E0bbaA8504B45F6e3f"
TX_EXPLORER_URL="https://kovan-optimistic.etherscan.io/tx/"

SUCCESS_CHANNEL_ID="DISCORD CHANNEL ID"
ERROR_CHANNEL_ID="DISCORD CHANNEL"
VAULT_BOT="BOT ID"
VAULT_BOT_TOKEN="BOT TOKEN"

POSITIONAL_MARKET_DATA_CONTRACT="0x21382a033E581a2D685826449d6c9b3d6507e23C"
SPORT_POSITIONAL_MARKET_DATA_CONTRACT="0xd8Bc9D6840C701bFAd5E7cf98CAdC2ee637c0701"

---------------------------
```

** NOTE: this properties are set is for kovan network please check next variables for MAIN **
