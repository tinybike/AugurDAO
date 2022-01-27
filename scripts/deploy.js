const { parseEther } = ethers.utils;
const abi = new ethers.utils.AbiCoder();
const mainnetRepv2ContractAddress = "0x221657776846890989a759BA2973e427DfF5C9bB";

function sleep(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function main() {
  let blockNumber;
  const isTestnet = true;

  const augurDAOConfig = {
    quorumVotes: parseEther("40000"), // minimum # of votes required for a vote to succeed
    proposalThreshold: parseEther("10000"), // minimum # of votes required to propose
    proposalMaxOperations: 10, // # actions allowed per proposal
    votingDelay: 1, // # blocks delayed before voting commences after proposal is proposed
    votingPeriod: 10, // duration of voting on proposal, in # blocks
  };

  // const timelockDelay = 86400 * 2; // 2 days
  const timelockDelay = 180; // 3 minutes
  const secondsPerBlock = 15;
  const timelockEtaBuffer = secondsPerBlock * 2; // ~2 blocks / 30 seconds after the delay expires

  const signers = await ethers.getSigners();
  const deployer = signers[0];

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()));

  const WrappedReputationToken = await ethers.getContractFactory("WrappedReputationToken");
  let wrappedReputationTokenContract;

  // if we're on a testnet, deploy mock ERC20 contract
  if (isTestnet) {
    const deployerReputationTokenBalance = ethers.utils.parseEther("10000000");
    const amountOfReputationTokenToWrap = ethers.utils.parseEther("30000");
    console.log(`UniverseMock()`);
    const universeContract = await (await ethers.getContractFactory("UniverseMock")).deploy();
    await universeContract.deployed();
    blockNumber = (await universeContract.deployTransaction.wait()).blockNumber;
    console.log(" -> deployed UniverseMock to", universeContract.address, "in block", blockNumber);
    const ReputationTokenMock = await ethers.getContractFactory("ReputationTokenMock");
    console.log(`ReputationTokenMock()`);
    const reputationTokenMockContract = await ReputationTokenMock.deploy(deployerReputationTokenBalance, universeContract.address);
    await universeContract.setReputationToken(reputationTokenMockContract.address);
    blockNumber = (await reputationTokenMockContract.deployTransaction.wait()).blockNumber;
    console.log(" -> deployed ReputationTokenMock to", reputationTokenMockContract.address, "in block", blockNumber);
    console.log(`WrappedReputationToken(${reputationTokenMockContract.address})`);
    wrappedReputationTokenContract = await WrappedReputationToken.deploy(reputationTokenMockContract.address);
    blockNumber = (await wrappedReputationTokenContract.deployTransaction.wait()).blockNumber;
    console.log(" -> deployed WrappedReputationToken to", wrappedReputationTokenContract.address, "in block", blockNumber);
    await (await reputationTokenMockContract.approve(wrappedReputationTokenContract.address, amountOfReputationTokenToWrap)).wait();
    await (await wrappedReputationTokenContract.depositFor(deployer.address, amountOfReputationTokenToWrap)).wait();
    await (await wrappedReputationTokenContract.delegate(deployer.address)).wait();
    console.log("votes: ", await wrappedReputationTokenContract.getCurrentVotes(deployer.address));
  }

  // if we're on mainnet, use the actual REPv2 contract
  else {
    console.log(`Deploying WrappedReputationToken(${mainnetRepv2ContractAddress})...`);
    wrappedReputationTokenContract = await WrappedReputationToken.deploy(mainnetRepv2ContractAddress);
    blockNumber = (await wrappedReputationTokenContract.deployTransaction.wait()).blockNumber;
    console.log(" -> deployed WrappedReputationToken to", wrappedReputationTokenContract.address, "in block", blockNumber);
  }

  // Deploy Timelocks and DAO contracts.  This is a little complicated:
  // 1. Deploy timelock with admin set to uploader address.
  // 2. Deploy govalpha with timelock set to timelock address and guardian set to uploader address.
  // 3. Call timelock queueTransaction(setPendingAdmin), executeTransaction(setPendingAdmin), then govalpha.__acceptAdmin() from the uploader address. timelock admin is now govalpha.
  // 4. Call govalpha __abdicate() to set the guardian address to 0.

  const Timelock = await ethers.getContractFactory("Timelock");
  console.log(`Timelock(${deployer.address}, ${timelockDelay})`);
  const timelockContract = await Timelock.deploy(deployer.address, timelockDelay);
  blockNumber = (await timelockContract.deployTransaction.wait()).blockNumber;
  console.log(" -> deployed Timelock to", timelockContract.address, "in block", blockNumber);
  const AugurDAO = await ethers.getContractFactory("AugurDAO");
  console.log(`AugurDAO(${timelockContract.address}, ${wrappedReputationTokenContract.address}, ${deployer.address})`);
  const augurDAOContract = await AugurDAO.deploy(
    timelockContract.address,
    wrappedReputationTokenContract.address,
    deployer.address,
    augurDAOConfig.quorumVotes,
    augurDAOConfig.proposalThreshold,
    augurDAOConfig.proposalMaxOperations,
    augurDAOConfig.votingDelay,
    augurDAOConfig.votingPeriod
  );
  blockNumber = (await augurDAOContract.deployTransaction.wait()).blockNumber;
  console.log(" -> deployed AugurDAO to", augurDAOContract.address, "in block", blockNumber);
  blockNumber = await ethers.provider.getBlockNumber();
  let blockTimestamp = (await ethers.provider.getBlock(blockNumber)).timestamp;
  let eta = blockTimestamp + timelockDelay + timelockEtaBuffer;
  const receipt = await (await timelockContract.queueTransaction(
    timelockContract.address,
    0,
    "setPendingAdmin(address)",
    abi.encode(["address"], [augurDAOContract.address]),
    eta
  )).wait();
  console.log("Queued AugurDAO.setPendingAdmin transaction, waiting", timelockDelay + timelockEtaBuffer + secondsPerBlock, "seconds...");
  await sleep(timelockDelay + timelockEtaBuffer + secondsPerBlock);
  await (await timelockContract.executeTransaction(
    timelockContract.address,
    0,
    "setPendingAdmin(address)",
    abi.encode(["address"], [augurDAOContract.address]),
    eta
  )).wait();
  await (await augurDAOContract.__acceptAdmin()).wait();
  await (await augurDAOContract.__abdicate()).wait();

  // set up and fund a vesting wallet for gradual release of funds into augur dao
  const vestingStartTimestamp = Math.floor((new Date()).getTime() / 1000); // now
  const vestingDurationSeconds = 86400 * 365; // 1 year
  const VestingWallet = await ethers.getContractFactory("VestingWallet");
  console.log(`VestingWallet(${timelockContract.address}, ${vestingStartTimestamp}, ${vestingDurationSeconds})`);
  vestingWalletContract = await VestingWallet.deploy(
    timelockContract.address,
    vestingStartTimestamp,
    vestingDurationSeconds
  );
  blockNumber = (await vestingWalletContract.deployTransaction.wait()).blockNumber;
  console.log(" -> deployed VestingWallet to", vestingWalletContract.address, "in block", blockNumber);

  console.log("Deployment complete.");
  console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
