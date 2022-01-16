require("@nomiclabs/hardhat-waffle");

module.exports = {
  solidity: {
    compilers: [{
      version: "0.5.16",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
      },
    }, {
      version: "0.8.11",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
      },
    }],
    overrides: {
      "contracts/GovernorAlpha.sol": { version: "0.5.16" },
      "contracts/Timelock.sol": { version: "0.5.16" },
      "contracts/SafeMath.sol": { version: "0.5.16" },
      "contracts/AugurDAO.sol": { version: "0.5.16" },
      "contracts/WrappedReputationToken.sol": { version: "0.8.11" },
      "contracts/NonTransferableToken.sol": { version: "0.8.11" },
      "contracts/test/ReputationTokenMock.sol": { version: "0.8.11" },
    },
  },
};
