require("@nomiclabs/hardhat-waffle");
require("hardhat-dependency-compiler");

module.exports = {
  solidity: {
    compilers: [
      { version: "0.5.16" },
      { version: "0.8.11" },
    ],
    overrides: {
      "contracts/GovernorAlpha.sol": { version: "0.5.16" },
      "contracts/Timelock.sol": { version: "0.5.16" },
      "contracts/SafeMath.sol": { version: "0.5.16" },
      "contracts/AugurDAO.sol": { version: "0.5.16" },
    },
  },
  dependencyCompiler: {
    paths: ["@openzeppelin/contracts/finance/VestingWallet.sol"],
    keep: false,
  },
  mocha: {
    timeout: 600000,
  },
};
