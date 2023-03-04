require("dotenv").config();
const fs = require("fs").promises;
const path = require("path");
const process = require("process");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");

const vault = require("./source/vault.js");
const artbitrumVault = require("./source/arbitrumVault.js");
const bscVault = require("./source/bscVault.js");

// If modifying these scopes, delete token.json.
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call Google Sheets APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }

  return client;
}

async function doLoop() {
  const auth = await authorize();
  while (true) {
    try {
      await doMain(auth);
      await delay(1000 * 60 * +process.env.DELAY_IN_MINUTES);
    } catch (e) {
      console.log(e);
    }
  }
}

async function doMain(auth) {
  console.log(
    "==================== START PROCESSING OP VAULT ===================="
  );
  await vault.processVault(auth);
  console.log(
    "==================== END PROCESSING OP VAULT ===================="
  );
  // console.log(
  //   "==================== START PROCESSING ARBITRUM VAULT ===================="
  // );
  //   await artbitrumVault.processVault(auth);
  //   console.log(
  //     "==================== END PROCESSING ARBITRUM VAULT ===================="
  //   );
  //   console.log(
  //     "==================== START PROCESSING BSC VAULT ===================="
  //   );
  //   await bscVault.processVault(auth);
  //   console.log(
  //     "==================== END PROCESSING BSC VAULT ===================="
  //   );
}

doLoop();

function delay(time) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}
