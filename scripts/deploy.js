const { parseEther, formatEther } = ethers.utils;
const abi = new ethers.utils.AbiCoder();

function sleep(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function main() {
  let blockNumber;
  const isTestnet = true;
  let contracts = {
    ReputationToken: null,
    WrappedReputationToken: null,
    AugurDAO: null,
    AugurDAOTimelock: null,
    GuardianDAO: null,
    GuardianDAOTimelock: null,
    VestingWallet: null,
  };
  const config = {
    AugurDAO: {
      quorumVotes: parseEther("40000"), // minimum # of votes required for a vote to succeed
      proposalThreshold: parseEther("10000"), // minimum # of votes required to propose
      proposalMaxOperations: 10, // # actions allowed per proposal
      votingDelay: 1, // # blocks delayed before voting commences after proposal is proposed
      votingPeriod: 23040, // duration of voting on proposal, in # blocks (~4 days)
    },
    GuardianDAO: {
      quorumVotes: parseEther("40000"), // minimum # of votes required for a vote to succeed
      proposalThreshold: parseEther("10000"), // minimum # of votes required to propose
      proposalMaxOperations: 10, // # actions allowed per proposal
      votingDelay: 1, // # blocks delayed before voting commences after proposal is proposed
      votingPeriod: 11520, // duration of voting on proposal, in # blocks (~2 days)
    },
  };
  const secondsPerDay = 86400;
  const secondsPerBlock = 15;
  // const timelockDelay = secondsPerDay * 2; // 2 days
  const timelockDelay = 180; // 3 minutes
  const timelockEtaBuffer = secondsPerBlock * 2; // ~2 blocks / 30 seconds after the delay expires

  const signers = await ethers.getSigners();
  const deployer = signers[0];

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", formatEther(await deployer.getBalance()));

  const WrappedReputationToken = await ethers.getContractFactory("WrappedReputationToken");

  // if we're on a testnet, deploy mock ERC20 contract
  if (isTestnet) {
    const deployerReputationTokenBalance = parseEther("10000000");
    const amountOfReputationTokenToWrap = parseEther("30000");
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    console.log(`ERC20Mock()`);
    contracts.ReputationToken = await ERC20Mock.deploy("REP", deployerReputationTokenBalance);
    blockNumber = (await contracts.ReputationToken.deployTransaction.wait()).blockNumber;
    console.log(" -> deployed ERC20Mock to", contracts.ReputationToken.address, "in block", blockNumber);
    console.log(`WrappedReputationToken(${contracts.ReputationToken.address})`);
    contracts.WrappedReputationToken = await WrappedReputationToken.deploy(contracts.ReputationToken.address);
    blockNumber = (await contracts.WrappedReputationToken.deployTransaction.wait()).blockNumber;
    console.log(" -> deployed WrappedReputationToken to", contracts.WrappedReputationToken.address, "in block", blockNumber);
    await (await contracts.ReputationToken.approve(contracts.WrappedReputationToken.address, amountOfReputationTokenToWrap)).wait();
    await (await contracts.WrappedReputationToken.depositFor(deployer.address, amountOfReputationTokenToWrap)).wait();
    await (await contracts.WrappedReputationToken.delegate(deployer.address)).wait();
    console.log("votes:", formatEther(await contracts.WrappedReputationToken.getCurrentVotes(deployer.address)));
  }

  // if we're on mainnet, use the actual REPv2 contract
  else {
    contracts.ReputationToken = { address: "0x221657776846890989a759BA2973e427DfF5C9bB" };
    console.log(`Deploying WrappedReputationToken(${contracts.ReputationToken.address})...`);
    contracts.WrappedReputationToken = await WrappedReputationToken.deploy(contracts.ReputationToken.address);
    blockNumber = (await contracts.WrappedReputationToken.deployTransaction.wait()).blockNumber;
    console.log(" -> deployed WrappedReputationToken to", contracts.WrappedReputationToken.address, "in block", blockNumber);
  }

  const NonTransferableToken = await ethers.getContractFactory("NonTransferableToken");
  console.log(`NonTransferableToken()`);
  contracts.NonTransferableToken = await NonTransferableToken.deploy();
  blockNumber = (await contracts.NonTransferableToken.deployTransaction.wait()).blockNumber;
  console.log(" -> deployed NonTransferableToken to", contracts.NonTransferableToken.address, "in block", blockNumber);

  // Deploy Timelocks and DAO contracts.  This is a little complicated:
  // 1. Deploy timelock with admin set to uploader address.
  // 2. Deploy govalpha with timelock set to timelock address and guardian set to uploader address.
  // 3. Call timelock queueTransaction(setPendingAdmin), executeTransaction(setPendingAdmin), then govalpha.__acceptAdmin() from the uploader address. timelock admin is now govalpha.
  // 4a. For the guardian dao, call govalpha __abdicate() to set the guardian address to 0.
  // 4b. For the augur dao, call the new function (on AugurDAO) changeGuardian(guardianDaoTimelockAddress) to set the guardian address to the guardian dao timelock's address.

  const Timelock = await ethers.getContractFactory("Timelock");
  console.log(`Timelock(${deployer.address}, ${timelockDelay})`);
  contracts.GuardianDAOTimelock = await Timelock.deploy(deployer.address, timelockDelay);
  blockNumber = (await contracts.GuardianDAOTimelock.deployTransaction.wait()).blockNumber;
  console.log(" -> deployed Timelock (GuardianDAO) to", contracts.GuardianDAOTimelock.address, "in block", blockNumber);
  const GuardianDAO = await ethers.getContractFactory("GovernorAlpha");
  console.log(`GuardianDAO(${contracts.GuardianDAOTimelock.address}, ${contracts.NonTransferableToken.address}, ${deployer.address})`);
  contracts.GuardianDAO = await GuardianDAO.deploy(
    contracts.GuardianDAOTimelock.address,
    contracts.NonTransferableToken.address,
    deployer.address,
    config.GuardianDAO.quorumVotes,
    config.GuardianDAO.proposalThreshold,
    config.GuardianDAO.proposalMaxOperations,
    config.GuardianDAO.votingDelay,
    config.GuardianDAO.votingPeriod
  );
  blockNumber = (await contracts.GuardianDAO.deployTransaction.wait()).blockNumber;
  console.log(" -> deployed GuardianDAO to", contracts.GuardianDAO.address, "in block", blockNumber);
  blockNumber = await ethers.provider.getBlockNumber();
  let blockTimestamp = (await ethers.provider.getBlock(blockNumber)).timestamp;
  let eta = blockTimestamp + timelockDelay + timelockEtaBuffer;
  await (await contracts.GuardianDAOTimelock.queueTransaction(
    contracts.GuardianDAOTimelock.address,
    0,
    "setPendingAdmin(address)",
    abi.encode(["address"], [contracts.GuardianDAO.address]),
    eta
  )).wait();
  console.log("Queued GuardianDAO.setPendingAdmin transaction, waiting", timelockDelay + timelockEtaBuffer + secondsPerBlock, "seconds...");
  await sleep(timelockDelay + timelockEtaBuffer + secondsPerBlock);
  await (await contracts.GuardianDAOTimelock.executeTransaction(
    contracts.GuardianDAOTimelock.address,
    0,
    "setPendingAdmin(address)",
    abi.encode(["address"], [contracts.GuardianDAO.address]),
    eta
  )).wait();
  await (await contracts.GuardianDAO.__acceptAdmin()).wait();
  await (await contracts.GuardianDAO.__abdicate()).wait();

  console.log(`Timelock(${deployer.address}, ${timelockDelay})`);
  contracts.AugurDAOTimelock = await Timelock.deploy(deployer.address, timelockDelay);
  blockNumber = (await contracts.AugurDAOTimelock.deployTransaction.wait()).blockNumber;
  console.log(" -> deployed Timelock (AugurDAO) to", contracts.AugurDAOTimelock.address, "in block", blockNumber);
  const AugurDAO = await ethers.getContractFactory("AugurDAO");
  console.log(`AugurDAO(${contracts.AugurDAOTimelock.address}, ${contracts.WrappedReputationToken.address}, ${deployer.address}, ${contracts.NonTransferableToken.address})`);
  contracts.AugurDAO = await AugurDAO.deploy(
    contracts.AugurDAOTimelock.address,
    contracts.WrappedReputationToken.address,
    deployer.address,
    config.AugurDAO.quorumVotes,
    config.AugurDAO.proposalThreshold,
    config.AugurDAO.proposalMaxOperations,
    config.AugurDAO.votingDelay,
    config.AugurDAO.votingPeriod,
    contracts.NonTransferableToken.address
  );
  blockNumber = (await contracts.AugurDAO.deployTransaction.wait()).blockNumber;
  console.log(" -> deployed AugurDAO to", contracts.AugurDAO.address, "in block", blockNumber);
  blockNumber = await ethers.provider.getBlockNumber();
  blockTimestamp = (await ethers.provider.getBlock(blockNumber)).timestamp;
  eta = blockTimestamp + timelockDelay + timelockEtaBuffer;
  await (await contracts.AugurDAOTimelock.queueTransaction(
    contracts.AugurDAOTimelock.address,
    0,
    "setPendingAdmin(address)",
    abi.encode(["address"], [contracts.AugurDAO.address]),
    eta
  )).wait();
  console.log("Queued AugurDAO.setPendingAdmin transaction, waiting", timelockDelay + timelockEtaBuffer + secondsPerBlock, "seconds...");
  await sleep(timelockDelay + timelockEtaBuffer + secondsPerBlock);
  await (await contracts.AugurDAOTimelock.executeTransaction(
    contracts.AugurDAOTimelock.address,
    0,
    "setPendingAdmin(address)",
    abi.encode(["address"], [contracts.AugurDAO.address]),
    eta
  )).wait();
  await (await contracts.AugurDAO.__acceptAdmin()).wait();
  await (await contracts.AugurDAO.changeGuardian(contracts.GuardianDAOTimelock.address)).wait();

  // set up and fund a vesting wallet for gradual release of funds into augur dao
  const vestingStartTimestamp = Math.floor((new Date()).getTime() / 1000); // now
  const vestingDurationSeconds = secondsPerDay * 365; // 1 year
  const VestingWallet = await ethers.getContractFactory("VestingWallet");
  console.log(`VestingWallet(${contracts.AugurDAOTimelock.address}, ${vestingStartTimestamp}, ${vestingDurationSeconds})`);
  contracts.VestingWallet = await VestingWallet.deploy(
    contracts.AugurDAOTimelock.address,
    vestingStartTimestamp,
    vestingDurationSeconds
  );
  blockNumber = (await contracts.VestingWallet.deployTransaction.wait()).blockNumber;
  console.log(" -> deployed VestingWallet to", contracts.VestingWallet.address, "in block", blockNumber);

  console.log("Deployment complete.");
  console.log("Account balance:", formatEther(await deployer.getBalance()));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
