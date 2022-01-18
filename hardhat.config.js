require("@nomiclabs/hardhat-waffle");
require("hardhat-dependency-compiler");

module.exports = {
  solidity: {
    compilers: [
      { version: "0.5.16" },
      { version: "0.8.11" },
    ],
  },
  dependencyCompiler: {
    paths: ["@openzeppelin/contracts-4.4.1/finance/VestingWallet.sol"],
    keep: false,
  },
  mocha: {
    timeout: 600000,
  },
};
