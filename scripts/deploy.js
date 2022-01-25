const secondsPerDay = 86400;
const mainnetRepv2ContractAddress = "0x221657776846890989a759BA2973e427DfF5C9bB";
const abi = new ethers.utils.AbiCoder();

function sleep(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function main() {
  let blockNumber;
  const isTestnet = true;

  // const timelockDelay = secondsPerDay * 2; // 2 days
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
    const initialReputationTokenBalances = ethers.utils.parseEther("40000");
    const amountOfReputationTokenToWrap = ethers.utils.parseEther("30000");
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    console.log(`ERC20Mock()`);
    const reputationTokenMockContract = await ERC20Mock.deploy("REP", deployer.address, deployerReputationTokenBalance);
    blockNumber = (await reputationTokenMockContract.deployTransaction.wait()).blockNumber;
    console.log(" -> deployed ERC20Mock to", reputationTokenMockContract.address, "in block", blockNumber);
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

  const NonTransferableToken = await ethers.getContractFactory("NonTransferableToken");
  console.log(`NonTransferableToken()`);
  const nonTransferableTokenContract = await NonTransferableToken.deploy();
  blockNumber = (await nonTransferableTokenContract.deployTransaction.wait()).blockNumber;
  console.log(" -> deployed NonTransferableToken to", nonTransferableTokenContract.address, "in block", blockNumber);

  // Deploy Timelocks and DAO contracts.  This is a little complicated:
  // 1. Deploy timelock with admin set to uploader address.
  // 2. Deploy govalpha with timelock set to timelock address and guardian set to uploader address.
  // 3. Call timelock queueTransaction(setPendingAdmin), executeTransaction(setPendingAdmin), then govalpha.__acceptAdmin() from the uploader address. timelock admin is now govalpha.
  // 4a. For the guardian dao, call govalpha __abdicate() to set the guardian address to 0.
  // 4b. For the augur dao, call the new function (on AugurDAO) changeGuardian(guardianDaoTimelockAddress) to set the guardian address to the guardian dao timelock's address.

  const Timelock = await ethers.getContractFactory("Timelock");
  console.log(`Timelock(${deployer.address}, ${timelockDelay})`);
  const guardianDaoTimelockContract = await Timelock.deploy(deployer.address, timelockDelay);
  blockNumber = (await guardianDaoTimelockContract.deployTransaction.wait()).blockNumber;
  console.log(" -> deployed Timelock (GuardianDAO) to", guardianDaoTimelockContract.address, "in block", blockNumber);
  const GuardianDAO = await ethers.getContractFactory("GuardianDAO");
  console.log(`GuardianDAO(${guardianDaoTimelockContract.address}, ${nonTransferableTokenContract.address}, ${deployer.address})`);
  const guardianDaoContract = await GuardianDAO.deploy(
    guardianDaoTimelockContract.address,
    nonTransferableTokenContract.address,
    deployer.address
  );
  blockNumber = (await guardianDaoContract.deployTransaction.wait()).blockNumber;
  console.log(" -> deployed GuardianDAO to", guardianDaoContract.address, "in block", blockNumber);
  blockNumber = await ethers.provider.getBlockNumber();
  let blockTimestamp = (await ethers.provider.getBlock(blockNumber)).timestamp;
  let eta = blockTimestamp + timelockDelay + timelockEtaBuffer;
  const receipt = await (await guardianDaoTimelockContract.queueTransaction(
    guardianDaoTimelockContract.address,
    0,
    "setPendingAdmin(address)",
    abi.encode(["address"], [guardianDaoContract.address]),
    eta
  )).wait();
  console.log("Queued GuardianDAO.setPendingAdmin transaction, waiting", timelockDelay + timelockEtaBuffer + secondsPerBlock, "seconds...");
  await sleep(timelockDelay + timelockEtaBuffer + secondsPerBlock);
  await (await guardianDaoTimelockContract.executeTransaction(
    guardianDaoTimelockContract.address,
    0,
    "setPendingAdmin(address)",
    abi.encode(["address"], [guardianDaoContract.address]),
    eta
  )).wait();
  await (await guardianDaoContract.__acceptAdmin()).wait();
  await (await guardianDaoContract.__abdicate()).wait();

  console.log(`Timelock(${deployer.address}, ${timelockDelay})`);
  const augurDaoTimelockContract = await Timelock.deploy(deployer.address, timelockDelay);
  blockNumber = (await augurDaoTimelockContract.deployTransaction.wait()).blockNumber;
  console.log(" -> deployed Timelock (AugurDAO) to", augurDaoTimelockContract.address, "in block", blockNumber);
  const AugurDAO = await ethers.getContractFactory("AugurDAO");
  console.log(`AugurDAO(${augurDaoTimelockContract.address}, ${wrappedReputationTokenContract.address}, ${deployer.address}, ${nonTransferableTokenContract.address})`);
  const augurDaoContract = await AugurDAO.deploy(
    augurDaoTimelockContract.address,
    wrappedReputationTokenContract.address,
    deployer.address,
    nonTransferableTokenContract.address
  );
  blockNumber = (await augurDaoContract.deployTransaction.wait()).blockNumber;
  console.log(" -> deployed AugurDAO to", augurDaoContract.address, "in block", blockNumber);
  blockNumber = await ethers.provider.getBlockNumber();
  blockTimestamp = (await ethers.provider.getBlock(blockNumber)).timestamp;
  eta = blockTimestamp + timelockDelay + timelockEtaBuffer;
  await (await augurDaoTimelockContract.queueTransaction(
    augurDaoTimelockContract.address,
    0,
    "setPendingAdmin(address)",
    abi.encode(["address"], [augurDaoContract.address]),
    eta
  )).wait();
  console.log("Queued AugurDAO.setPendingAdmin transaction, waiting", timelockDelay + timelockEtaBuffer + secondsPerBlock, "seconds...");
  await sleep(timelockDelay + timelockEtaBuffer + secondsPerBlock);
  await (await augurDaoTimelockContract.executeTransaction(
    augurDaoTimelockContract.address,
    0,
    "setPendingAdmin(address)",
    abi.encode(["address"], [augurDaoContract.address]),
    eta
  )).wait();
  await (await augurDaoContract.__acceptAdmin()).wait();
  await (await augurDaoContract.changeGuardian(guardianDaoTimelockContract.address)).wait();

  // set up and fund a vesting wallet for gradual release of funds into augur dao
  const vestingStartTimestamp = Math.floor((new Date()).getTime() / 1000); // now
  const vestingDurationSeconds = secondsPerDay * 365; // 1 year
  const VestingWallet = await ethers.getContractFactory("VestingWallet");
  console.log(`VestingWallet(${augurDaoTimelockContract.address}, ${vestingStartTimestamp}, ${vestingDurationSeconds})`);
  vestingWalletContract = await VestingWallet.deploy(
    augurDaoTimelockContract.address,
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
