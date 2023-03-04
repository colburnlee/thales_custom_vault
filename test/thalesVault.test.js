require("dotenv").config();
const vault = require("../source/thalesVault");
const setOptimismVariables = vault.setOptimismVariables;

describe("Vault", () => {
  it("Can read vault variables from Safu Vault", async () => {
    expect(setOptimismVariables.gasPrice).toBe(1000000);
  });
});
