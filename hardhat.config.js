require("@nomiclabs/hardhat-waffle");
require("hardhat-dependency-compiler");

const placeholder = "0000000000000000000000000000000000000000000000000000000000000000";

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || placeholder;
const RINKEBY_PRIVATE_KEY = process.env.RINKEBY_PRIVATE_KEY || placeholder;
const KOVAN_PRIVATE_KEY = process.env.KOVAN_PRIVATE_KEY || placeholder;
const ROPSTEN_PRIVATE_KEY = process.env.ROPSTEN_PRIVATE_KEY || placeholder;
const GOERLI_PRIVATE_KEY = process.env.GOERLI_PRIVATE_KEY || placeholder;
const MAINNET_PRIVATE_KEY = process.env.MAINNET_PRIVATE_KEY || placeholder;

// npx hardhat run scripts/deploy.js --network rinkeby
module.exports = {
  networks: {
    hardhat: {
      // forking: {
      //   url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_API_KEY}`,
      // },
    },
    rinkeby: {
      url: `https://eth-rinkeby.alchemyapi.io/v2/${ALCHEMY_API_KEY}`,
      accounts: [RINKEBY_PRIVATE_KEY],
    },
    kovan: {
      url: `https://eth-kovan.alchemyapi.io/v2/${ALCHEMY_API_KEY}`,
      accounts: [KOVAN_PRIVATE_KEY],
    },
    ropsten: {
      url: `https://eth-ropsten.alchemyapi.io/v2/${ALCHEMY_API_KEY}`,
      accounts: [ROPSTEN_PRIVATE_KEY],
    },
    goerli: {
      url: `https://eth-goerli.alchemyapi.io/v2/${ALCHEMY_API_KEY}`,
      accounts: [GOERLI_PRIVATE_KEY],
    },
    mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_API_KEY}`,
      accounts: [MAINNET_PRIVATE_KEY],
    },
  },
  solidity: {
    compilers: [
      { version: "0.5.16" },
      { version: "0.8.11" },
    ],
  },
  dependencyCompiler: {
    paths: ["@openzeppelin/contracts/finance/VestingWallet.sol"],
    keep: false,
  },
  mocha: {
    timeout: 600000,
  },
};
