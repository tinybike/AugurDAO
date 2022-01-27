const { assert, expect } = require("chai");
const { parseEther } = ethers.utils;
const abi = new ethers.utils.AbiCoder();
const SECONDS_PER_DAY = 86400
const BIG_ZERO = ethers.BigNumber.from(0);
const PROPOSAL_STATE = [
  "Pending",
  "Active",
  "Canceled",
  "Defeated",
  "Succeeded",
  "Queued",
  "Expired",
  "Executed",
];

async function wrapTokens(contracts, signers, amountToWrap) {
  for (let i = 0; i < signers.length; i++) {
    await contracts.ReputationToken.connect(signers[i]).approve(contracts.WrappedReputationToken.address, amountToWrap);
    await contracts.WrappedReputationToken.connect(signers[i]).depositFor(signers[i].address, amountToWrap);
    assert.deepEqual(await contracts.WrappedReputationToken.balanceOf(signers[i].address), amountToWrap);
  }
}

async function deployTokenContracts(contracts, signers, totalTokenSupply, tokenBalance) {
  contracts.Universe = await (await ethers.getContractFactory("UniverseMock")).deploy();
  await contracts.Universe.deployed();
  contracts.ReputationToken = await (await ethers.getContractFactory("ReputationTokenMock")).deploy(totalTokenSupply, contracts.Universe.address);
  await contracts.Universe.setReputationToken(contracts.ReputationToken.address);
  await contracts.ReputationToken.deployed();
  assert.deepEqual(await contracts.ReputationToken.balanceOf(signers[0].address), totalTokenSupply);
  assert.deepEqual(await contracts.ReputationToken.totalSupply(), totalTokenSupply);
  for (let i = 1; i < signers.length; i++) {
    await contracts.ReputationToken.transfer(signers[i].address, tokenBalance);
    assert.deepEqual(await contracts.ReputationToken.balanceOf(signers[i].address), tokenBalance);
  }
  contracts.WrappedReputationToken = await (await ethers.getContractFactory("WrappedReputationToken")).deploy(contracts.ReputationToken.address);
  await contracts.WrappedReputationToken.deployed();
  return contracts;
}

async function deployAugurDAO(contracts, signers, tokenBalance, timelockDelay, augurDAOConfig) {
  const deployer = signers[0].address;
  contracts.Timelock = await (await ethers.getContractFactory("Timelock")).deploy(deployer, timelockDelay);
  await contracts.Timelock.deployed();
  contracts.AugurDAO = await (await ethers.getContractFactory("AugurDAO")).deploy(
    contracts.Timelock.address,
    contracts.WrappedReputationToken.address,
    deployer,
    augurDAOConfig.quorumVotes,
    augurDAOConfig.proposalThreshold,
    augurDAOConfig.proposalMaxOperations,
    augurDAOConfig.votingDelay,
    augurDAOConfig.votingPeriod
  );
  await contracts.AugurDAO.deployed();
  assert.equal(await contracts.AugurDAO.guardian(), deployer);
  assert.equal(await contracts.AugurDAO.timelock(), contracts.Timelock.address);
  assert.equal(await contracts.AugurDAO.token(), contracts.WrappedReputationToken.address);
  let blockNumber = await ethers.provider.getBlockNumber();
  let blockTimestamp = (await ethers.provider.getBlock(blockNumber)).timestamp;
  let eta = blockTimestamp + timelockDelay + 1;
  await contracts.Timelock.queueTransaction(
    contracts.Timelock.address,
    0,
    "setPendingAdmin(address)",
    abi.encode(["address"], [contracts.AugurDAO.address]),
    eta
  );
  await ethers.provider.send("evm_increaseTime", [timelockDelay]);
  assert.equal(await contracts.Timelock.admin(), deployer);
  await contracts.Timelock.executeTransaction(
    contracts.Timelock.address,
    0,
    "setPendingAdmin(address)",
    abi.encode(["address"], [contracts.AugurDAO.address]),
    eta
  );
  await contracts.AugurDAO.__acceptAdmin();
  assert.equal(await contracts.Timelock.admin(), contracts.AugurDAO.address);
  await contracts.AugurDAO.__abdicate();
  assert.equal(await contracts.AugurDAO.guardian(), ethers.constants.AddressZero);
  return contracts;
}

async function waitForProposalToMature(contracts, proposal) {
  const numBlocksToWait = proposal.endBlock.sub(proposal.startBlock).toNumber();
  for (let i = 0; i < numBlocksToWait; i++) {
    await ethers.provider.send("evm_mine");
  }
  return PROPOSAL_STATE[await contracts.AugurDAO.state(proposal.id)];
}

async function isAbleToPropose(contracts, signer) {
  const tokenBalance = await contracts.WrappedReputationToken.balanceOf(signer.address);
  const proposalThreshold = await contracts.AugurDAO.proposalThreshold();
  return tokenBalance.gt(proposalThreshold);
}

async function delegate(contracts, signer, expectedVotes) {
  assert.equal(await contracts.WrappedReputationToken.delegates(signer.address), ethers.constants.AddressZero);
  assert.deepEqual(await contracts.WrappedReputationToken.getCurrentVotes(signer.address), BIG_ZERO);
  await contracts.WrappedReputationToken.connect(signer).delegate(signer.address);
  assert.equal(await contracts.WrappedReputationToken.delegates(signer.address), signer.address);
  assert.deepEqual(await contracts.WrappedReputationToken.getCurrentVotes(signer.address), expectedVotes);
}

async function delegateAll(contracts, signers, expectedVotes) {
  for (let i = 0; i < signers.length; i++) {
    await delegate(contracts, signers[i], expectedVotes);
  }
}

async function castVotes(contracts, proposalId, signers, votes) {
  assert.equal(signers.length, votes.length);
  for (let i = 0; i < votes.length; i++) {
    await contracts.AugurDAO.connect(signers[i]).castVote(proposalId, votes[i]);
  }
}

describe("Augur DAO", function () {
  let signers;
  let contracts = {
    ReputationToken: null,
    WrappedReputationToken: null,
    AugurDAO: null,
    Timelock: null,
    DaiToken: null,
    VestingWallet: null,
  };
  const timelockDelay = SECONDS_PER_DAY * 2; // 2 days
  const totalTokenSupply = parseEther("10000000000");
  const initialTokenBalance = parseEther("30000");
  const augurDAOConfig = {
    quorumVotes: parseEther("40000"), // minimum # of votes required for a vote to succeed
    proposalThreshold: parseEther("10000"), // minimum # of votes required to propose
    proposalMaxOperations: 10, // # actions allowed per proposal
    votingDelay: 1, // # blocks delayed before voting commences after proposal is proposed
    votingPeriod: 10, // duration of voting on proposal, in # blocks
  };

  beforeEach(async function () {
    signers = await ethers.getSigners();
    contracts = await deployTokenContracts(contracts, signers, totalTokenSupply, initialTokenBalance);
  });

  it("wrapped rep migration", async function () {
    const migrator = signers[1];
    const payoutNumerators = [10000, 0, 0];
    await wrapTokens(contracts, signers, initialTokenBalance);
    assert.deepEqual(await contracts.WrappedReputationToken.balanceOf(migrator.address), initialTokenBalance);
    const childUniverseContract = await (await ethers.getContractFactory("UniverseMock")).deploy();
    await childUniverseContract.deployed();
    const childReputationTokenContract = await (await ethers.getContractFactory("ReputationTokenMock")).deploy(totalTokenSupply, childUniverseContract.address);
    await childReputationTokenContract.deployed();
    await contracts.Universe.setChildUniverse(childUniverseContract.address);
    await childUniverseContract.setReputationToken(childReputationTokenContract.address);
    assert.equal(contracts.Universe.address, await contracts.ReputationToken.getUniverse());
    assert.equal(childUniverseContract.address, await contracts.Universe.childUniverse());
    assert.equal(contracts.ReputationToken.address, await contracts.Universe.getReputationToken());
    assert.equal(childReputationTokenContract.address, await childUniverseContract.getReputationToken());
    const events = (await (await contracts.WrappedReputationToken.connect(migrator).migrate(payoutNumerators, initialTokenBalance)).wait()).events;
    // verify events
    // burn from wrapper
    assert.equal(events[0].event, "Transfer");
    assert.equal(events[0].args.from, contracts.WrappedReputationToken.address);
    assert.equal(events[0].args.to, ethers.constants.AddressZero);
    // mint to wrapper
    assert.equal(events[1].event, "Transfer");
    assert.equal(events[1].args.from, ethers.constants.AddressZero);
    assert.equal(events[1].args.to, contracts.WrappedReputationToken.address);
    // transfer new universe rep to user
    assert.equal(events[2].event, "Transfer");
    assert.equal(events[2].args.from, contracts.WrappedReputationToken.address);
    assert.equal(events[2].args.to, migrator.address);
    // verify balances
    assert.deepEqual(await contracts.WrappedReputationToken.balanceOf(migrator.address), initialTokenBalance);
    assert.deepEqual(await childReputationTokenContract.balanceOf(migrator.address), initialTokenBalance);
  });

  it("wrap and unwrap some reputation tokens", async function () {
    const deployer = signers[0].address;
    const deployerInitialTokenBalance = await contracts.ReputationToken.balanceOf(deployer);
    assert.deepEqual(await contracts.WrappedReputationToken.balanceOf(deployer), BIG_ZERO);
    await contracts.ReputationToken.approve(contracts.WrappedReputationToken.address, 10);
    assert.deepEqual(await contracts.WrappedReputationToken.totalSupply(), BIG_ZERO);
    await contracts.WrappedReputationToken.depositFor(deployer, 10);
    assert.deepEqual(await contracts.WrappedReputationToken.totalSupply(), ethers.BigNumber.from(10));
    assert.deepEqual(await contracts.WrappedReputationToken.balanceOf(deployer), ethers.BigNumber.from(10));
    await contracts.WrappedReputationToken.withdrawTo(deployer, 4);
    assert.deepEqual(await contracts.WrappedReputationToken.totalSupply(), ethers.BigNumber.from(6));
    assert.deepEqual(await contracts.WrappedReputationToken.balanceOf(deployer), ethers.BigNumber.from(6));
    const finalTokenBalance = await contracts.ReputationToken.balanceOf(deployer);
    assert.deepEqual(deployerInitialTokenBalance.sub(finalTokenBalance), ethers.BigNumber.from(6));
  });

  it("proposal to change governance token", async function () {
    let proposal, events;
    await wrapTokens(contracts, signers, initialTokenBalance);
    contracts = await deployAugurDAO(contracts, signers, initialTokenBalance, timelockDelay, augurDAOConfig);
    await delegateAll(contracts, signers, initialTokenBalance);

    // set up the new wrapped reputation token with account 0, fund accounts 1 and 2, then wrap
    const newReputationTokenTotalSupply = ethers.utils.parseEther("999999");
    const initialNewReputationTokenBalances = ethers.utils.parseEther("111111");
    const amountOfNewReputationTokenToWrap = ethers.utils.parseEther("111110");
    const newReputationTokenMockContract = await (await ethers.getContractFactory("ERC20Mock")).deploy("REPv3", newReputationTokenTotalSupply);
    await newReputationTokenMockContract.deployed();
    for (let i = 1; i < 3; i++) {
      await newReputationTokenMockContract.transfer(signers[i].address, initialNewReputationTokenBalances);
      assert.deepEqual(await newReputationTokenMockContract.balanceOf(signers[i].address), initialNewReputationTokenBalances);
    }
    newWrappedReputationTokenContract = await (await ethers.getContractFactory("WrappedReputationToken")).deploy(newReputationTokenMockContract.address);
    await newWrappedReputationTokenContract.deployed();
    for (let i = 1; i < 3; i++) {
      await newReputationTokenMockContract.connect(signers[i]).approve(newWrappedReputationTokenContract.address, amountOfNewReputationTokenToWrap);
      await newWrappedReputationTokenContract.connect(signers[i]).depositFor(signers[i].address, amountOfNewReputationTokenToWrap);
      assert.deepEqual(await newWrappedReputationTokenContract.balanceOf(signers[i].address), amountOfNewReputationTokenToWrap);
    }

    // signer 1 makes a proposal to change augur dao's governance token
    const newGovernanceTokenAddress = newWrappedReputationTokenContract.address;
    await expect(
      contracts.AugurDAO.changeGovernanceToken(newGovernanceTokenAddress)
    ).to.be.revertedWith("changeGovernanceToken: can only be called by timelock");
    assert.isTrue(await isAbleToPropose(contracts, signers[1]));
    await contracts.AugurDAO.connect(signers[1]).propose(
      [contracts.AugurDAO.address],
      ["0"],
      ["changeGovernanceToken(address)"],
      [abi.encode(["address"], [newGovernanceTokenAddress])],
      "change augur dao's rep token"
    );
    const proposalId = await contracts.AugurDAO.latestProposalIds(signers[1].address);
    proposal = await contracts.AugurDAO.proposals(proposalId);
    assert.equal(proposal.proposer.toString(), signers[1].address);
    assert.deepEqual(proposal.forVotes, BIG_ZERO);
    assert.deepEqual(proposal.againstVotes, BIG_ZERO);
    assert.equal(PROPOSAL_STATE[await contracts.AugurDAO.state(proposalId)], "Pending");
    await ethers.provider.send("evm_mine");

    // vote on the proposal
    await castVotes(contracts, proposalId, signers.slice(1, 3), [true, true]);

    // wait for the proposal to mature...
    assert.equal(await waitForProposalToMature(contracts, proposal), "Succeeded");
    
    // queue the proposal
    events = (await (await contracts.AugurDAO.queue(proposalId)).wait()).events;
    // verify events
    assert.equal(events[events.length - 1].event, "ProposalQueued");
    assert.deepEqual(events[events.length - 1].args.id, proposalId);
    // verify proposal info
    proposal = await contracts.AugurDAO.proposals(proposalId);
    assert.equal(PROPOSAL_STATE[await contracts.AugurDAO.state(proposalId)], "Queued");
    assert.equal(proposal.canceled, false);
    assert.equal(proposal.executed, false);
    await ethers.provider.send("evm_increaseTime", [timelockDelay]);
    // verify token address
    assert.equal(await contracts.AugurDAO.token(), contracts.WrappedReputationToken.address);

    // execute the proposal
    events = (await (await contracts.AugurDAO.execute(proposalId)).wait()).events;
    // verify events
    assert.equal(events[events.length - 1].event, "ProposalExecuted");
    assert.deepEqual(events[events.length - 1].args.id, proposalId);
    // verify proposal info
    proposal = await contracts.AugurDAO.proposals(proposalId);
    assert.equal(PROPOSAL_STATE[await contracts.AugurDAO.state(proposalId)], "Executed");
    assert.equal(proposal.canceled, false);
    assert.equal(proposal.executed, true);
    // verify token address
    assert.equal(await contracts.AugurDAO.token(), newGovernanceTokenAddress);
  });

  it("allow funds to vest into augur dao and do something with them", async function () {
    let proposal, events;
    const uploader = signers[0].address;
    const uploaderDaiTokenBalance = ethers.utils.parseEther("123456789");
    const vestingStartTimestamp = Math.floor((new Date()).getTime() / 1000); // now
    const vestingDurationSeconds = SECONDS_PER_DAY * 365; // 1 year
    const etherToVest = ethers.utils.parseEther("123");
    const reputationTokensToVest = ethers.utils.parseEther("456");
    const daiTokensToVest = ethers.utils.parseEther("789");
    await wrapTokens(contracts, signers, initialTokenBalance);
    contracts = await deployAugurDAO(contracts, signers, initialTokenBalance, timelockDelay, augurDAOConfig);
    await delegateAll(contracts, signers, initialTokenBalance);

    // set up a mock dai contract for use with the vesting wallet
    contracts.DaiToken = await (await ethers.getContractFactory("ERC20Mock")).deploy("DAI", uploaderDaiTokenBalance);
    await contracts.DaiToken.deployed();
    assert.deepEqual(await contracts.DaiToken.balanceOf(uploader), uploaderDaiTokenBalance);

    // set up and fund a vesting wallet for gradual release of funds into augur dao
    contracts.VestingWallet = await (await ethers.getContractFactory("VestingWallet")).deploy(
      contracts.Timelock.address,
      vestingStartTimestamp,
      vestingDurationSeconds
    );
    await contracts.VestingWallet.deployed();
    assert((await contracts.VestingWallet.start()).eq(vestingStartTimestamp));
    assert((await contracts.VestingWallet.duration()).eq(vestingDurationSeconds));
    assert((await contracts.VestingWallet["released()"]()).eq(0));
    assert((await contracts.VestingWallet["released(address)"](contracts.ReputationToken.address)).eq(0));
    assert((await contracts.VestingWallet["released(address)"](contracts.DaiToken.address)).eq(0));
    const uploaderInitialEtherBalance = await ethers.provider.getBalance(uploader);
    const { gasUsed, effectiveGasPrice } = (await (await signers[0].sendTransaction({
      to: contracts.VestingWallet.address,
      value: etherToVest,
    })).wait());
    const uploaderFinalEtherBalance = await ethers.provider.getBalance(uploader);
    const expectedEtherBalanceChange = uploaderInitialEtherBalance.sub(uploaderFinalEtherBalance);
    const actualEtherBalanceChange = gasUsed.mul(effectiveGasPrice).add(etherToVest);
    assert(expectedEtherBalanceChange.eq(actualEtherBalanceChange));
    assert((await ethers.provider.getBalance(contracts.VestingWallet.address)).eq(etherToVest));
    await contracts.ReputationToken.transfer(contracts.VestingWallet.address, reputationTokensToVest);
    await contracts.DaiToken.transfer(contracts.VestingWallet.address, daiTokensToVest);
    assert((await contracts.ReputationToken.balanceOf(contracts.VestingWallet.address)).eq(reputationTokensToVest));
    assert((await contracts.ReputationToken.balanceOf(contracts.Timelock.address)).eq(0));
    assert((await contracts.DaiToken.balanceOf(contracts.VestingWallet.address)).eq(daiTokensToVest));
    assert((await contracts.DaiToken.balanceOf(contracts.Timelock.address)).eq(0));
    assert((await contracts.VestingWallet["released()"]()).eq(0));
    assert((await contracts.VestingWallet["released(address)"](contracts.ReputationToken.address)).eq(0));
    assert((await contracts.VestingWallet["released(address)"](contracts.DaiToken.address)).eq(0));

    // release funds after 1 day and check balances
    await ethers.provider.send("evm_increaseTime", [SECONDS_PER_DAY]);
    assert((await contracts.VestingWallet["released()"]()).eq(0));
    assert((await ethers.provider.getBalance(contracts.Timelock.address)).eq(0));
    await contracts.VestingWallet["release()"]();
    const etherReleasedAfter1Day = await contracts.VestingWallet["released()"]();
    assert((await ethers.provider.getBalance(contracts.Timelock.address)).eq(etherReleasedAfter1Day));
    assert((await contracts.VestingWallet["released(address)"](contracts.ReputationToken.address)).eq(0));
    await contracts.VestingWallet["release(address)"](contracts.ReputationToken.address);
    const reputationTokensReleasedAfter1Day = await contracts.VestingWallet["released(address)"](contracts.ReputationToken.address);
    assert((await contracts.ReputationToken.balanceOf(contracts.Timelock.address)).eq(reputationTokensReleasedAfter1Day));
    assert((await contracts.VestingWallet["released(address)"](contracts.DaiToken.address)).eq(0));
    await contracts.VestingWallet["release(address)"](contracts.DaiToken.address);
    const daiTokensReleasedAfter1Day = await contracts.VestingWallet["released(address)"](contracts.DaiToken.address);
    assert((await contracts.DaiToken.balanceOf(contracts.Timelock.address)).eq(daiTokensReleasedAfter1Day));

    // proposal: augur dao sends some dai to signer 4 from the vesting wallet
    const daiTokensToSend = daiTokensReleasedAfter1Day.sub(ethers.utils.parseEther("1"));
    assert.isTrue(await isAbleToPropose(contracts, signers[0]));
    await contracts.AugurDAO.propose(
      [contracts.DaiToken.address],
      ["0"],
      ["transfer(address,uint256)"],
      [abi.encode(["address", "uint256"], [signers[4].address, daiTokensToSend])],
      "send some dai from the treasury to signer 4"
    );
    const proposalId = await contracts.AugurDAO.latestProposalIds(signers[0].address);
    proposal = await contracts.AugurDAO.proposals(proposalId);
    assert.equal(proposal.proposer.toString(), signers[0].address);
    assert.deepEqual(proposal.forVotes, BIG_ZERO);
    assert.deepEqual(proposal.againstVotes, BIG_ZERO);
    assert.equal(PROPOSAL_STATE[await contracts.AugurDAO.state(proposalId)], "Pending");
    await ethers.provider.send("evm_mine");

    // vote on the proposal
    await castVotes(contracts, proposalId, signers.slice(1, 4), [true, true, true]);

    // wait for the proposal to mature...
    assert.equal(await waitForProposalToMature(contracts, proposal), "Succeeded");

    // queue the proposal
    events = (await (await contracts.AugurDAO.queue(proposalId)).wait()).events;
    // verify events
    assert.equal(events[1].event, "ProposalQueued");
    assert.deepEqual(events[1].args.id, proposalId);
    // verify proposal info
    proposal = await contracts.AugurDAO.proposals(proposalId);
    assert.equal(PROPOSAL_STATE[await contracts.AugurDAO.state(proposalId)], "Queued");
    assert.equal(proposal.canceled, false);
    assert.equal(proposal.executed, false);
    await ethers.provider.send("evm_increaseTime", [timelockDelay]);

    // execute the proposal
    assert((await contracts.DaiToken.balanceOf(signers[4].address)).eq(0));
    events = (await (await contracts.AugurDAO.execute(proposalId)).wait()).events;
    // verify events
    assert.equal(events[events.length - 1].event, "ProposalExecuted");
    assert.deepEqual(events[events.length - 1].args.id, proposalId);
    // verify proposal info
    proposal = await contracts.AugurDAO.proposals(proposalId);
    assert.equal(PROPOSAL_STATE[await contracts.AugurDAO.state(proposalId)], "Executed");
    assert.equal(proposal.canceled, false);
    assert.equal(proposal.executed, true);
    assert((await contracts.DaiToken.balanceOf(signers[4].address)).eq(daiTokensToSend));

    // after 365 days all funds should be released
    await ethers.provider.send("evm_increaseTime", [SECONDS_PER_DAY * 364]);
    assert((await contracts.VestingWallet["released()"]()).eq(etherReleasedAfter1Day));
    assert((await ethers.provider.getBalance(contracts.Timelock.address)).eq(etherReleasedAfter1Day));
    await contracts.VestingWallet["release()"]();
    const etherReleasedAfter365Days = await contracts.VestingWallet["released()"]();
    assert((await ethers.provider.getBalance(contracts.Timelock.address)).eq(etherReleasedAfter365Days));
    assert(etherReleasedAfter365Days.eq(etherToVest));
    assert((await contracts.VestingWallet["released(address)"](contracts.ReputationToken.address)).eq(reputationTokensReleasedAfter1Day));
    await contracts.VestingWallet["release(address)"](contracts.ReputationToken.address);
    const reputationTokensReleasedAfter365Days = await contracts.VestingWallet["released(address)"](contracts.ReputationToken.address);
    assert(reputationTokensReleasedAfter365Days.eq(reputationTokensToVest));
    assert((await contracts.ReputationToken.balanceOf(contracts.Timelock.address)).eq(reputationTokensReleasedAfter365Days));
    assert((await contracts.VestingWallet["released(address)"](contracts.DaiToken.address)).eq(daiTokensReleasedAfter1Day));
    await contracts.VestingWallet["release(address)"](contracts.DaiToken.address);
    const daiTokensReleasedAfter365Days = await contracts.VestingWallet["released(address)"](contracts.DaiToken.address);
    assert((await contracts.DaiToken.balanceOf(contracts.Timelock.address)).eq(daiTokensReleasedAfter365Days.sub(daiTokensToSend)));
    assert(daiTokensReleasedAfter365Days.eq(daiTokensToVest));
  });
});
