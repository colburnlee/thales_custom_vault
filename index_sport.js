require("dotenv").config();

const vault = require("./source_sport/sport_vault.js");

async function doLoop() {
  while (true) {
    try {
      await doMain();
      await delay(1000 * 60 * process.env.DELAY_IN_MINUTES);
    } catch (e) {
      console.log(e);
    }
  }
}

async function doMain() {
  console.log(
    "==================== START PROCESSING VAULT ===================="
  );

  await vault.processVault();

  console.log("==================== END PROCESSING VAULT ====================");
}

doLoop();

function delay(time) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}
