const ethers = require("ethers");
require("dotenv").config();
const privateKey = process.env.PRIVATE_KEY;

// let etherprovider = new ethers.providers.AlchemyProvider(
//   process.env.NETWORK,
//   process.env.ALCHEMY
// );

// let etherprovider = new ethers.providers.JsonRpcProvider(
//   "https://rpc.ankr.com/optimism"
// );

// let etherprovider = new ethers.providers.JsonRpcProvider("https://1rpc.io/op");//https://endpoints.omniatech.io/v1/op/mainnet/public

let etherprovider = new ethers.providers.JsonRpcProvider(process.env.OMNIA_URL);
// let arbitrumProvider = new ethers.providers.JsonRpcProvider(
//   process.env.ARBITRUM_OMNIA_URL
// );

let arbitrumProvider = new ethers.providers.JsonRpcProvider(
  process.env.ARBITRUM_1RPC_URL
);

let baseUrl = process.env.BASE_URL;

module.exports = {
  privateKey,
  etherprovider,
  baseUrl,
  arbitrumProvider,
};
