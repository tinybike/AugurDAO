const secondsPerDay = 86400;
const mainnetRepv2ContractAddress = "0x221657776846890989a759BA2973e427DfF5C9bB";
const abi = new ethers.utils.AbiCoder();

function sleep(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function main() {
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
    await reputationTokenMockContract.deployed();
    console.log(" -> deployed ERC20Mock to", reputationTokenMockContract.address);
    console.log(`WrappedReputationToken(${reputationTokenMockContract.address})`);
    wrappedReputationTokenContract = await WrappedReputationToken.deploy(reputationTokenMockContract.address);
    await wrappedReputationTokenContract.deployed();
    console.log(" -> deployed WrappedReputationToken to", wrappedReputationTokenContract.address);
    await (await reputationTokenMockContract.approve(wrappedReputationTokenContract.address, amountOfReputationTokenToWrap)).wait();
    await (await wrappedReputationTokenContract.depositFor(deployer.address, amountOfReputationTokenToWrap)).wait();
  }

  // if we're on mainnet, use the actual REPv2 contract
  else {
    console.log(`Deploying WrappedReputationToken(${mainnetRepv2ContractAddress})...`);
    wrappedReputationTokenContract = await WrappedReputationToken.deploy(mainnetRepv2ContractAddress);
    await wrappedReputationTokenContract.deployed();
    console.log(" -> deployed WrappedReputationToken to", wrappedReputationTokenContract.address);
  }

  const NonTransferableToken = await ethers.getContractFactory("NonTransferableToken");
  console.log(`NonTransferableToken()`);
  const nonTransferableTokenContract = await NonTransferableToken.deploy();
  await nonTransferableTokenContract.deployed();
  console.log(" -> deployed NonTransferableToken to", nonTransferableTokenContract.address);

  // Deploy Timelocks and DAO contracts.  This is a little complicated:
  // 1. Deploy timelock with admin set to uploader address.
  // 2. Deploy govalpha with timelock set to timelock address and guardian set to uploader address.
  // 3. Call timelock queueTransaction(setPendingAdmin), executeTransaction(setPendingAdmin), then govalpha.__acceptAdmin() from the uploader address. timelock admin is now govalpha.
  // 4a. For the guardian dao, call govalpha __abdicate() to set the guardian address to 0.
  // 4b. For the augur dao, call the new function (on AugurDAO) changeGuardian(guardianDaoTimelockAddress) to set the guardian address to the guardian dao timelock's address.

  const Timelock = await ethers.getContractFactory("Timelock");
  console.log(`Timelock(${deployer.address}, ${timelockDelay})`);
  const guardianDaoTimelockContract = await Timelock.deploy(deployer.address, timelockDelay);
  await guardianDaoTimelockContract.deployed();
  console.log(" -> deployed Timelock (GuardianDAO) to", guardianDaoTimelockContract.address);
  const GuardianDAO = await ethers.getContractFactory("GuardianDAO");
  console.log(`GuardianDAO(${guardianDaoTimelockContract.address}, ${nonTransferableTokenContract.address}, ${deployer.address})`);
  const guardianDaoContract = await GuardianDAO.deploy(
    guardianDaoTimelockContract.address,
    nonTransferableTokenContract.address,
    deployer.address
  );
  await guardianDaoContract.deployed();
  console.log(" -> deployed GuardianDAO to", guardianDaoContract.address);
  let blockNumber = await ethers.provider.getBlockNumber();
  let blockTimestamp = (await ethers.provider.getBlock(blockNumber)).timestamp;
  let eta = blockTimestamp + timelockDelay + timelockEtaBuffer;
  console.log("queue transaction:",
    guardianDaoTimelockContract.address,
    0,
    "setPendingAdmin(address)",
    abi.encode(["address"], [guardianDaoContract.address]),
    eta
  );
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
  await augurDaoTimelockContract.deployed();
  console.log(" -> deployed Timelock (AugurDAO) to", augurDaoTimelockContract.address);
  const AugurDAO = await ethers.getContractFactory("AugurDAO");
  console.log(`AugurDAO(${augurDaoTimelockContract.address}, ${wrappedReputationTokenContract.address}, ${deployer.address}, ${nonTransferableTokenContract.address})`);
  const augurDaoContract = await AugurDAO.deploy(
    augurDaoTimelockContract.address,
    wrappedReputationTokenContract.address,
    deployer.address,
    nonTransferableTokenContract.address
  );
  await augurDaoContract.deployed();
  console.log(" -> deployed AugurDAO to", augurDaoContract.address);
  blockNumber = await ethers.provider.getBlockNumber();
  blockTimestamp = (await ethers.provider.getBlock(blockNumber)).timestamp;
  eta = blockTimestamp + timelockDelay + timelockEtaBuffer;
  console.log("queue transaction:",
    augurDaoTimelockContract.address,
    0,
    "setPendingAdmin(address)",
    abi.encode(["address"], [augurDaoContract.address]),
    eta
  );
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
  await vestingWalletContract.deployed();
  console.log(" -> deployed VestingWallet to", guardianDaoTimelockContract.address);

  console.log("Deployment complete.");
  console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
