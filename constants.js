const ethers = require("ethers");
require("dotenv").config();
const privateKey = process.env.PRIVATE_KEY;

console.log("Using Infura");
let etherprovider = new ethers.providers.InfuraProvider(
  process.env.NETWORK,
  process.env.INFURA
);

let baseUrl = process.env.BASE_URL;

module.exports = {
  privateKey,
  etherprovider,
  baseUrl,
};
