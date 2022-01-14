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
      version: "0.8.2",
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
      "contracts/AugurDAO.sol": { version: "0.5.16" },
      "contracts/WrappedReputationToken.sol": { version: "0.8.2" },
      "contracts/NonTransferableToken.sol": { version: "0.8.2" },
      "contracts/test/ReputationTokenMock.sol": { version: "0.8.2" },
    },
  },
};
