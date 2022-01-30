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
  contracts.ReputationToken = await (await ethers.getContractFactory("ERC20Mock")).deploy("REP", totalTokenSupply);
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

async function deployAugurDAO(contracts, signers, tokenBalance, timelockDelay, config) {
  const deployer = signers[0];
  contracts.NonTransferableToken = await (await ethers.getContractFactory("NonTransferableToken")).deploy();
  await contracts.NonTransferableToken.deployed();
  assert.equal(await contracts.NonTransferableToken.canMintAndBurn(), ethers.constants.AddressZero);

  const Timelock = await ethers.getContractFactory("Timelock");
  contracts.GuardianDAOTimelock = await Timelock.deploy(deployer.address, timelockDelay);
  await contracts.GuardianDAOTimelock.deployed();
  contracts.GuardianDAO = await (await ethers.getContractFactory("GovernorAlpha")).deploy(
    contracts.GuardianDAOTimelock.address,
    contracts.NonTransferableToken.address,
    deployer.address,
    config.GuardianDAO.quorumVotes,
    config.GuardianDAO.proposalThreshold,
    config.GuardianDAO.proposalMaxOperations,
    config.GuardianDAO.votingDelay,
    config.GuardianDAO.votingPeriod
  );
  await contracts.GuardianDAO.deployed();
  assert.equal(await contracts.GuardianDAO.guardian(), deployer.address);
  assert.equal(await contracts.GuardianDAO.timelock(), contracts.GuardianDAOTimelock.address);
  assert.equal(await contracts.GuardianDAO.token(), contracts.NonTransferableToken.address);
  let blockNumber = await ethers.provider.getBlockNumber();
  let blockTimestamp = (await ethers.provider.getBlock(blockNumber)).timestamp;
  let eta = blockTimestamp + timelockDelay + 1;
  await contracts.GuardianDAOTimelock.queueTransaction(
    contracts.GuardianDAOTimelock.address,
    0,
    "setPendingAdmin(address)",
    abi.encode(["address"], [contracts.GuardianDAO.address]),
    eta
  );
  await ethers.provider.send("evm_increaseTime", [timelockDelay]);
  assert.equal(await contracts.GuardianDAOTimelock.admin(), deployer.address);
  await contracts.GuardianDAOTimelock.executeTransaction(
    contracts.GuardianDAOTimelock.address,
    0,
    "setPendingAdmin(address)",
    abi.encode(["address"], [contracts.GuardianDAO.address]),
    eta
  );
  await contracts.GuardianDAO.__acceptAdmin();
  assert.equal(await contracts.GuardianDAOTimelock.admin(), contracts.GuardianDAO.address);
  await contracts.GuardianDAO.__abdicate();
  assert.equal(await contracts.GuardianDAO.guardian(), ethers.constants.AddressZero);

  contracts.AugurDAOTimelock = await Timelock.deploy(deployer.address, timelockDelay);
  await contracts.AugurDAOTimelock.deployed();
  contracts.AugurDAO = await (await ethers.getContractFactory("AugurDAO")).deploy(
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
  await contracts.AugurDAO.deployed();
  assert.equal(await contracts.AugurDAO.guardian(), deployer.address);
  assert.equal(await contracts.AugurDAO.timelock(), contracts.AugurDAOTimelock.address);
  assert.equal(await contracts.AugurDAO.token(), contracts.WrappedReputationToken.address);
  assert.equal(await contracts.AugurDAO.guardianGovernanceToken(), contracts.NonTransferableToken.address);
  blockNumber = await ethers.provider.getBlockNumber();
  blockTimestamp = (await ethers.provider.getBlock(blockNumber)).timestamp;
  eta = blockTimestamp + timelockDelay + 1;
  await contracts.AugurDAOTimelock.queueTransaction(
    contracts.AugurDAOTimelock.address,
    0,
    "setPendingAdmin(address)",
    abi.encode(["address"], [contracts.AugurDAO.address]),
    eta
  );
  await ethers.provider.send("evm_increaseTime", [timelockDelay]);
  assert.equal(await contracts.AugurDAOTimelock.admin(), deployer.address);
  await contracts.AugurDAOTimelock.executeTransaction(
    contracts.AugurDAOTimelock.address,
    0,
    "setPendingAdmin(address)",
    abi.encode(["address"], [contracts.AugurDAO.address]),
    eta
  );
  await contracts.AugurDAO.__acceptAdmin();
  assert.equal(await contracts.AugurDAOTimelock.admin(), contracts.AugurDAO.address);
  await contracts.AugurDAO.changeGuardian(contracts.GuardianDAOTimelock.address);
  await expect(
    contracts.AugurDAO.changeGuardian(deployer.address)
  ).to.be.revertedWith("changeGuardian: Guardian can only be changed once");
  assert.equal(await contracts.AugurDAOTimelock.admin(), contracts.AugurDAO.address);
  await contracts.NonTransferableToken.initialize(contracts.AugurDAO.address);
  await expect(
    contracts.NonTransferableToken.initialize(deployer.address)
  ).to.be.revertedWith("Initializable: contract is already initialized");
  assert.equal(await contracts.NonTransferableToken.canMintAndBurn(), contracts.AugurDAO.address);
  return contracts;
}

async function waitForProposalToMature(contract, proposal) {
  const numBlocksToWait = proposal.endBlock.sub(proposal.startBlock).toNumber();
  for (let i = 0; i < numBlocksToWait; i++) {
    await ethers.provider.send("evm_mine");
  }
  return PROPOSAL_STATE[await contract.state(proposal.id)];
}

async function isAbleToPropose(daoContract, tokenContract, address) {
  assert.equal(await daoContract.token(), tokenContract.address);
  const tokenBalance = await tokenContract.balanceOf(address);
  const proposalThreshold = await daoContract.proposalThreshold();
  return tokenBalance.gt(proposalThreshold);
}

async function delegate(contract, signer, expectedVotes) {
  assert.equal(await contract.delegates(signer.address), ethers.constants.AddressZero);
  assert.deepEqual(await contract.getCurrentVotes(signer.address), BIG_ZERO);
  await contract.connect(signer).delegate(signer.address);
  assert.equal(await contract.delegates(signer.address), signer.address);
  assert.deepEqual(await contract.getCurrentVotes(signer.address), expectedVotes);
}

async function delegateAll(contract, signers, expectedVotes) {
  for (let i = 0; i < signers.length; i++) {
    await delegate(contract, signers[i], expectedVotes);
  }
}

describe("Augur DAO", function () {
  let signers;
  let contracts = {
    ReputationToken: null,
    WrappedReputationToken: null,
    AugurDAO: null,
    AugurDAOTimelock: null,
    GuardianDAO: null,
    GuardianDAOTimelock: null,
    DaiToken: null,
    VestingWallet: null,
  };
  const timelockDelay = SECONDS_PER_DAY * 2; // 2 days
  const totalTokenSupply = parseEther("10000000000");
  const initialTokenBalance = parseEther("30000");
  const config = {
    AugurDAO: {
      quorumVotes: parseEther("40000"), // minimum # of votes required for a vote to succeed
      proposalThreshold: parseEther("10000"), // minimum # of votes required to propose
      proposalMaxOperations: 10, // # actions allowed per proposal
      votingDelay: 1, // # blocks delayed before voting commences after proposal is proposed
      votingPeriod: 100, // duration of voting on proposal, in # blocks
    },
    GuardianDAO: {
      quorumVotes: parseEther("40000"), // minimum # of votes required for a vote to succeed
      proposalThreshold: parseEther("10000"), // minimum # of votes required to propose
      proposalMaxOperations: 10, // # actions allowed per proposal
      votingDelay: 1, // # blocks delayed before voting commences after proposal is proposed
      votingPeriod: 25, // duration of voting on proposal, in # blocks
    },
  };

  beforeEach(async function () {
    signers = await ethers.getSigners();
    contracts = await deployTokenContracts(contracts, signers, totalTokenSupply, initialTokenBalance);
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

  it("make some proposals and run through the basic dao workflow", async () => {
    let proposal, proposalId, cancelProposal, cancelProposalId, events;
    await wrapTokens(contracts, signers, initialTokenBalance);
    contracts = await deployAugurDAO(contracts, signers, initialTokenBalance, timelockDelay, config);
    await delegateAll(contracts.WrappedReputationToken, signers, initialTokenBalance);

    // proposal 1: augur dao mints some governance tokens for guardian dao

    // signer 0 makes a proposal to mint tokens to signers 1, 2, and 3
    const governanceTokensToMint = ethers.utils.parseEther("300000");
    assert(await isAbleToPropose(contracts.AugurDAO, contracts.WrappedReputationToken, signers[0].address));
    assert.deepEqual(await contracts.NonTransferableToken.balanceOf(signers[0].address), BIG_ZERO);
    await contracts.AugurDAO.propose(
      [contracts.AugurDAO.address, contracts.AugurDAO.address, contracts.AugurDAO.address],
      ["0", "0", "0"],
      [
        "mintGuardianGovernanceToken(address,uint256)",
        "mintGuardianGovernanceToken(address,uint256)",
        "mintGuardianGovernanceToken(address,uint256)",
      ],
      [
        abi.encode(["address", "uint256"], [signers[1].address, governanceTokensToMint]),
        abi.encode(["address", "uint256"], [signers[2].address, governanceTokensToMint]),
        abi.encode(["address", "uint256"], [signers[3].address, governanceTokensToMint]),
      ],
      "mint some governance tokens"
    );
    proposalId = await contracts.AugurDAO.latestProposalIds(signers[0].address);
    proposal = await contracts.AugurDAO.proposals(proposalId);
    assert.equal(proposal.proposer.toString(), signers[0].address);
    assert.deepEqual(proposal.forVotes, BIG_ZERO);
    assert.deepEqual(proposal.againstVotes, BIG_ZERO);
    assert.equal(PROPOSAL_STATE[await contracts.AugurDAO.state(proposalId)], "Pending")
    await ethers.provider.send("evm_mine");

    // vote on the proposal
    await contracts.AugurDAO.connect(signers[1]).castVote(proposalId, true);
    let voteReceipt = await contracts.AugurDAO.getReceipt(proposalId, signers[1].address);
    assert.equal(voteReceipt.hasVoted, true);
    assert.equal(voteReceipt.support, true);
    assert(voteReceipt.votes.eq(initialTokenBalance));
    proposal = await contracts.AugurDAO.proposals(proposalId);
    assert(proposal.forVotes.eq(initialTokenBalance));
    assert(proposal.againstVotes.eq(0));
    assert.equal(PROPOSAL_STATE[await contracts.AugurDAO.state(proposalId)], "Active");

    await contracts.AugurDAO.connect(signers[2]).castVote(proposalId, true);
    proposal = await contracts.AugurDAO.proposals(proposalId);
    assert(proposal.forVotes.eq(initialTokenBalance.mul(2)));
    assert(proposal.againstVotes.eq(0));
    assert.equal(PROPOSAL_STATE[await contracts.AugurDAO.state(proposalId)], "Active");

    await contracts.AugurDAO.connect(signers[3]).castVote(proposalId, true);
    proposal = await contracts.AugurDAO.proposals(proposalId);
    assert(proposal.forVotes.eq(initialTokenBalance.mul(3)));
    assert(proposal.againstVotes.eq(0));
    assert.equal(PROPOSAL_STATE[await contracts.AugurDAO.state(proposalId)], "Active");

    // wait for the proposal to mature...
    assert.equal(await waitForProposalToMature(contracts.AugurDAO, proposal), "Succeeded");

    // queue and execute the proposal
    await contracts.AugurDAO.queue(proposalId);
    assert.equal(PROPOSAL_STATE[await contracts.AugurDAO.state(proposalId)], "Queued");
    await ethers.provider.send("evm_increaseTime", [timelockDelay]);
    proposal = await contracts.AugurDAO.proposals(proposalId);
    assert((await contracts.NonTransferableToken.totalSupply()).eq(0));
    await contracts.AugurDAO.execute(proposalId);
    assert.equal(PROPOSAL_STATE[await contracts.AugurDAO.state(proposalId)], "Executed");
    assert((await contracts.NonTransferableToken.totalSupply()).eq(governanceTokensToMint.mul(3)));
    for (let i = 1; i < 4; i++) {
      assert((await contracts.NonTransferableToken.balanceOf(signers[i].address)).eq(governanceTokensToMint));
    }

    // non-transferable token is non-transferable
    await expect(
      contracts.NonTransferableToken.connect(signers[1]).transfer(signers[2].address, 1)
    ).to.be.revertedWith("_beforeTokenTransfer: NonTransferableToken is non-transferable");
    await expect(
      contracts.NonTransferableToken.mint(signers[0].address, 1)
    ).to.be.revertedWith("mint: Only the canMintAndBurn address can mint tokens");
    await expect(
      contracts.NonTransferableToken.burn(signers[0].address, 1)
    ).to.be.revertedWith("burn: Only the canMintAndBurn address can burn tokens");


    // proposal 2: augur dao burns some guardian dao governance tokens

    // signer 0 makes a proposal on augur dao to burn some of the guardian tokens held by signers 1, 2, and 3
    const governanceTokensToBurn = ethers.utils.parseEther("10000");
    const governanceTokensRemaining = governanceTokensToMint.sub(governanceTokensToBurn);
    assert(await isAbleToPropose(contracts.AugurDAO, contracts.WrappedReputationToken, signers[0].address));
    await contracts.AugurDAO.propose(
      [contracts.AugurDAO.address, contracts.AugurDAO.address, contracts.AugurDAO.address],
      ["0", "0", "0"],
      [
        "burnGuardianGovernanceToken(address,uint256)",
        "burnGuardianGovernanceToken(address,uint256)",
        "burnGuardianGovernanceToken(address,uint256)",
      ],
      [
        abi.encode(["address", "uint256"], [signers[1].address, governanceTokensToBurn]),
        abi.encode(["address", "uint256"], [signers[2].address, governanceTokensToBurn]),
        abi.encode(["address", "uint256"], [signers[3].address, governanceTokensToBurn]),
      ],
      "burn some governance tokens"
    );
    proposalId = await contracts.AugurDAO.latestProposalIds(signers[0].address);
    proposal = await contracts.AugurDAO.proposals(proposalId);
    assert(proposal.forVotes.eq(0));
    assert(proposal.againstVotes.eq(0));
    assert.equal(PROPOSAL_STATE[await contracts.AugurDAO.state(proposalId)], "Pending")
    await ethers.provider.send("evm_mine");

    // vote on the proposal
    await contracts.AugurDAO.connect(signers[1]).castVote(proposalId, true);
    voteReceipt = await contracts.AugurDAO.getReceipt(proposalId, signers[1].address);
    assert.equal(voteReceipt.hasVoted, true);
    assert.equal(voteReceipt.support, true);
    assert(voteReceipt.votes.eq(initialTokenBalance));
    proposal = await contracts.AugurDAO.proposals(proposalId);
    assert(proposal.forVotes.eq(initialTokenBalance));
    assert(proposal.againstVotes.eq(0));
    assert.equal(PROPOSAL_STATE[await contracts.AugurDAO.state(proposalId)], "Active");

    await contracts.AugurDAO.connect(signers[2]).castVote(proposalId, true);
    proposal = await contracts.AugurDAO.proposals(proposalId);
    assert(proposal.forVotes.eq(initialTokenBalance.mul(2)));
    assert(proposal.againstVotes.eq(0));
    assert.equal(PROPOSAL_STATE[await contracts.AugurDAO.state(proposalId)], "Active");

    await contracts.AugurDAO.connect(signers[3]).castVote(proposalId, true);
    proposal = await contracts.AugurDAO.proposals(proposalId);
    assert(proposal.forVotes.eq(initialTokenBalance.mul(3)));
    assert(proposal.againstVotes.eq(0));
    assert.equal(PROPOSAL_STATE[await contracts.AugurDAO.state(proposalId)], "Active");

    // wait for the proposal to mature...
    assert.equal(await waitForProposalToMature(contracts.AugurDAO, proposal), "Succeeded");

    // queue and execute the proposal
    await contracts.AugurDAO.queue(proposalId);
    assert.equal(PROPOSAL_STATE[await contracts.AugurDAO.state(proposalId)], "Queued");
    await ethers.provider.send("evm_increaseTime", [timelockDelay]);
    assert((await contracts.NonTransferableToken.totalSupply()).eq(governanceTokensToMint.mul(3)));
    await contracts.AugurDAO.execute(proposalId);
    assert.equal(PROPOSAL_STATE[await contracts.AugurDAO.state(proposalId)], "Executed");
    assert((await contracts.NonTransferableToken.totalSupply()).eq(governanceTokensRemaining.mul(3)));
    for (let i = 1; i < 4; i++) {
      assert((await contracts.NonTransferableToken.balanceOf(signers[i].address)).eq(governanceTokensRemaining));
    }


    // proposal 3: guardian dao cancels a proposal on augur dao

    await delegateAll(contracts.NonTransferableToken, signers.slice(1, 4), governanceTokensRemaining);

    // signer 0 makes a proposal on augur dao to burn some of the guardian tokens held by signers 1, 2, and 3
    assert(await isAbleToPropose(contracts.AugurDAO, contracts.WrappedReputationToken, signers[0].address));
    await contracts.AugurDAO.propose(
      [contracts.AugurDAO.address, contracts.AugurDAO.address, contracts.AugurDAO.address],
      ["0", "0", "0"],
      [
        "burnGuardianGovernanceToken(address,uint256)",
        "burnGuardianGovernanceToken(address,uint256)",
        "burnGuardianGovernanceToken(address,uint256)",
      ],
      [
        abi.encode(["address", "uint256"], [signers[1].address, governanceTokensToBurn]),
        abi.encode(["address", "uint256"], [signers[2].address, governanceTokensToBurn]),
        abi.encode(["address", "uint256"], [signers[3].address, governanceTokensToBurn]),
      ],
      "burn some governance tokens"
    );
    proposalId = await contracts.AugurDAO.latestProposalIds(signers[0].address);
    proposal = await contracts.AugurDAO.proposals(proposalId);
    assert.equal(proposal.proposer.toString(), signers[0].address);
    assert.deepEqual(proposal.forVotes, BIG_ZERO);
    assert.deepEqual(proposal.againstVotes, BIG_ZERO);
    assert.equal(PROPOSAL_STATE[await contracts.AugurDAO.state(proposalId)], "Pending")
    await ethers.provider.send("evm_mine");

    // signer 1 votes for the proposal
    await contracts.AugurDAO.connect(signers[1]).castVote(proposalId, true);
    // verify signer 1 vote
    voteReceipt = await contracts.AugurDAO.getReceipt(proposalId, signers[1].address);
    assert.equal(voteReceipt.hasVoted, true);
    assert.equal(voteReceipt.support, true);
    assert.deepEqual(voteReceipt.votes, initialTokenBalance);
    // verify vote counts
    proposal = await contracts.AugurDAO.proposals(proposalId);
    assert.deepEqual(proposal.forVotes, initialTokenBalance);
    assert.deepEqual(proposal.againstVotes, BIG_ZERO);

    // signer 2 votes against the proposal
    await contracts.AugurDAO.connect(signers[2]).castVote(proposalId, false);
    // verify signer 2 vote
    voteReceipt = await contracts.AugurDAO.getReceipt(proposalId, signers[2].address);
    assert.equal(voteReceipt.hasVoted, true);
    assert.equal(voteReceipt.support, false);
    assert.deepEqual(voteReceipt.votes, initialTokenBalance);
    // verify vote counts
    proposal = await contracts.AugurDAO.proposals(proposalId);
    assert.deepEqual(proposal.forVotes, initialTokenBalance);
    assert.deepEqual(proposal.againstVotes, initialTokenBalance);

    // signer 3 makes a proposal to cancel the proposal through the guardian dao
    assert(await isAbleToPropose(contracts.GuardianDAO, contracts.NonTransferableToken, signers[3].address));
    assert.equal(PROPOSAL_STATE[await contracts.AugurDAO.state(proposalId)], "Active");
    await expect(
      contracts.AugurDAO.connect(signers[3]).cancel(proposalId)
    ).to.be.revertedWith("GovernorAlpha::cancel: proposer above threshold");
    assert.equal(PROPOSAL_STATE[await contracts.AugurDAO.state(proposalId)], "Active");
    await contracts.GuardianDAO.connect(signers[3]).propose(
      [contracts.AugurDAO.address],
      ["0"],
      ["cancel(uint256)"],
      [abi.encode(["uint256"], [proposalId])],
      "cancel a proposal on augur dao"
    );
    cancelProposalId = await contracts.GuardianDAO.latestProposalIds(signers[3].address);
    cancelProposal = await contracts.GuardianDAO.proposals(cancelProposalId);
    assert.equal(cancelProposal.proposer.toString(), signers[3].address);
    assert.deepEqual(cancelProposal.forVotes, BIG_ZERO);
    assert.deepEqual(cancelProposal.againstVotes, BIG_ZERO);
    assert.equal(PROPOSAL_STATE[await contracts.GuardianDAO.state(cancelProposalId)], "Pending")
    await ethers.provider.send("evm_mine");

    // signer 1 votes for the cancel proposal on guardian dao
    await contracts.GuardianDAO.connect(signers[1]).castVote(cancelProposalId, true);
    // verify signer 1 vote
    voteReceipt = await contracts.GuardianDAO.getReceipt(cancelProposalId, signers[1].address);
    assert.equal(voteReceipt.hasVoted, true);
    assert.equal(voteReceipt.support, true);
    assert.deepEqual(voteReceipt.votes, governanceTokensRemaining);
    // verify vote counts
    cancelProposal = await contracts.GuardianDAO.proposals(cancelProposalId);
    assert.deepEqual(cancelProposal.forVotes, governanceTokensRemaining);
    assert.deepEqual(cancelProposal.againstVotes, BIG_ZERO);

    // signer 2 votes for the cancel proposal on guardian dao
    await contracts.GuardianDAO.connect(signers[2]).castVote(cancelProposalId, true);
    // verify signer 2 vote
    voteReceipt = await contracts.GuardianDAO.getReceipt(cancelProposalId, signers[2].address);
    assert.equal(voteReceipt.hasVoted, true);
    assert.equal(voteReceipt.support, true);
    assert.deepEqual(voteReceipt.votes, governanceTokensRemaining);
    // verify vote counts
    cancelProposal = await contracts.GuardianDAO.proposals(cancelProposalId);
    assert.deepEqual(cancelProposal.forVotes, governanceTokensRemaining.mul(2));
    assert.deepEqual(cancelProposal.againstVotes, BIG_ZERO);

    // wait for the proposal to mature...
    assert.equal(await waitForProposalToMature(contracts.GuardianDAO, cancelProposal), "Succeeded");

    // queue the proposal
    events = (await (await contracts.GuardianDAO.queue(cancelProposalId)).wait()).events;
    // verify events
    assert.equal(events[events.length - 1].event, "ProposalQueued");
    assert.deepEqual(events[events.length - 1].args.id, cancelProposalId);
    // verify proposal info
    cancelProposal = await contracts.GuardianDAO.proposals(cancelProposalId);
    proposal = await contracts.AugurDAO.proposals(proposalId);
    assert.equal(cancelProposal.canceled, false);
    assert.equal(cancelProposal.executed, false);
    assert.equal(proposal.canceled, false);
    assert.equal(proposal.executed, false);
    assert.equal(PROPOSAL_STATE[await contracts.GuardianDAO.state(cancelProposalId)], "Queued");
    assert.equal(PROPOSAL_STATE[await contracts.AugurDAO.state(proposalId)], "Active");
    await ethers.provider.send("evm_increaseTime", [timelockDelay]);

    // execute the proposal
    assert.equal(PROPOSAL_STATE[await contracts.AugurDAO.state(proposalId)], "Active");
    events = (await (await contracts.GuardianDAO.execute(cancelProposalId)).wait()).events;
    // verify events
    assert.equal(events[events.length - 1].event, "ProposalExecuted");
    assert.deepEqual(events[events.length - 1].args.id, cancelProposalId);
    // verify proposal info
    cancelProposal = await contracts.GuardianDAO.proposals(cancelProposalId);
    proposal = await contracts.AugurDAO.proposals(proposalId);
    assert.equal(cancelProposal.canceled, false);
    assert.equal(cancelProposal.executed, true);
    assert.equal(proposal.canceled, true);
    assert.equal(proposal.executed, false);
    assert.equal(PROPOSAL_STATE[await contracts.GuardianDAO.state(cancelProposalId)], "Executed");
    assert.equal(PROPOSAL_STATE[await contracts.AugurDAO.state(proposalId)], "Canceled");


    // proposal 4: guardian dao changes augur dao's governance token (oh no, augur has forked!)

    // set up the new wrapped reputation token with account 0, then fund accounts 1 and 2, then wrap
    const deployerNewReputationTokenBalance = ethers.utils.parseEther("999999");
    const initialNewReputationTokenBalances = ethers.utils.parseEther("111111");
    const amountOfNewReputationTokenToWrap = ethers.utils.parseEther("111110");
    const newReputationTokenMockContract = await (await ethers.getContractFactory("ERC20Mock")).deploy("REPv3", deployerNewReputationTokenBalance);
    await newReputationTokenMockContract.deployed();
    for (let i = 1; i < 3; i++) {
      await newReputationTokenMockContract.transfer(signers[i].address, initialNewReputationTokenBalances);
      assert((await newReputationTokenMockContract.balanceOf(signers[i].address)).eq(initialNewReputationTokenBalances));
    }
    newWrappedReputationTokenContract = await (await ethers.getContractFactory("WrappedReputationToken")).deploy(newReputationTokenMockContract.address);
    await newWrappedReputationTokenContract.deployed();
    for (let i = 1; i < 3; i++) {
      await newReputationTokenMockContract.connect(signers[i]).approve(newWrappedReputationTokenContract.address, amountOfNewReputationTokenToWrap);
      await newWrappedReputationTokenContract.connect(signers[i]).depositFor(signers[i].address, amountOfNewReputationTokenToWrap);
      assert((await newWrappedReputationTokenContract.balanceOf(signers[i].address)).eq(amountOfNewReputationTokenToWrap));
    }

    // signer 1 makes a proposal to change augur dao's governance token
    const newGovernanceTokenAddress = newWrappedReputationTokenContract.address;
    await expect(
      contracts.AugurDAO.changeGovernanceToken(newGovernanceTokenAddress)
    ).to.be.revertedWith("changeGovernanceToken: The governance token can only be changed by the guardian");
    assert(await isAbleToPropose(contracts.GuardianDAO, contracts.NonTransferableToken, signers[1].address));
    await contracts.GuardianDAO.connect(signers[1]).propose(
      [contracts.AugurDAO.address],
      ["0"],
      ["changeGovernanceToken(address)"],
      [abi.encode(["address"], [newGovernanceTokenAddress])],
      "change augur dao's rep token"
    );
    proposalId = await contracts.GuardianDAO.latestProposalIds(signers[1].address);
    proposal = await contracts.GuardianDAO.proposals(proposalId);
    assert(proposal.forVotes.eq(0));
    assert(proposal.againstVotes.eq(0));
    assert.equal(PROPOSAL_STATE[await contracts.GuardianDAO.state(proposalId)], "Pending")
    await ethers.provider.send("evm_mine");

    // vote on the proposal
    await contracts.GuardianDAO.connect(signers[1]).castVote(proposalId, true);
    proposal = await contracts.GuardianDAO.proposals(proposalId);
    assert(proposal.forVotes.eq(governanceTokensRemaining));
    assert(proposal.againstVotes.eq(0));
    assert.equal(PROPOSAL_STATE[await contracts.GuardianDAO.state(proposalId)], "Active");

    await contracts.GuardianDAO.connect(signers[2]).castVote(proposalId, true);
    proposal = await contracts.GuardianDAO.proposals(proposalId);
    assert(proposal.forVotes.eq(governanceTokensRemaining.mul(2)));
    assert(proposal.againstVotes.eq(0));
    assert.equal(PROPOSAL_STATE[await contracts.GuardianDAO.state(proposalId)], "Active");

    // wait for the proposal to mature...
    assert.equal(await waitForProposalToMature(contracts.GuardianDAO, proposal), "Succeeded");

    // queue and execute the proposal
    await contracts.GuardianDAO.queue(proposalId);
    assert.equal(PROPOSAL_STATE[await contracts.GuardianDAO.state(proposalId)], "Queued");
    await ethers.provider.send("evm_increaseTime", [timelockDelay]);
    assert.equal(await contracts.AugurDAO.guardian(), contracts.GuardianDAOTimelock.address);
    assert.equal(await contracts.AugurDAO.token(), contracts.WrappedReputationToken.address);
    await contracts.GuardianDAO.execute(proposalId);
    assert.equal(PROPOSAL_STATE[await contracts.GuardianDAO.state(proposalId)], "Executed");
    for (let i = 1; i < 4; i++) {
      assert((await contracts.NonTransferableToken.balanceOf(signers[i].address)).eq(governanceTokensRemaining));
    }
    assert.equal(await contracts.AugurDAO.token(), newGovernanceTokenAddress);
  });

  it("allow funds to vest into augur dao and do something with them", async function () {
    let proposal, events;
    const deployerInitialDaiTokenBalance = ethers.utils.parseEther("123456789");
    const vestingStartTimestamp = Math.floor((new Date()).getTime() / 1000); // now
    const vestingDurationSeconds = SECONDS_PER_DAY * 365; // 1 year
    const etherToVest = ethers.utils.parseEther("123");
    const reputationTokensToVest = ethers.utils.parseEther("456");
    const daiTokensToVest = ethers.utils.parseEther("789");
    await wrapTokens(contracts, signers, initialTokenBalance);
    contracts = await deployAugurDAO(contracts, signers, initialTokenBalance, timelockDelay, config);
    await delegateAll(contracts.WrappedReputationToken, signers, initialTokenBalance);

    // set up a mock dai contract for use with the vesting wallet
    contracts.DaiToken = await (await ethers.getContractFactory("ERC20Mock")).deploy("DAI", deployerInitialDaiTokenBalance);
    await contracts.DaiToken.deployed();
    assert.deepEqual(await contracts.DaiToken.balanceOf(signers[0].address), deployerInitialDaiTokenBalance);

    // set up and fund a vesting wallet for gradual release of funds into augur dao
    contracts.VestingWallet = await (await ethers.getContractFactory("VestingWallet")).deploy(
      contracts.AugurDAOTimelock.address,
      vestingStartTimestamp,
      vestingDurationSeconds
    );
    await contracts.VestingWallet.deployed();
    assert((await contracts.VestingWallet.start()).eq(vestingStartTimestamp));
    assert((await contracts.VestingWallet.duration()).eq(vestingDurationSeconds));
    assert((await contracts.VestingWallet["released()"]()).eq(0));
    assert((await contracts.VestingWallet["released(address)"](contracts.ReputationToken.address)).eq(0));
    assert((await contracts.VestingWallet["released(address)"](contracts.DaiToken.address)).eq(0));
    const deployerInitialEtherBalance = await ethers.provider.getBalance(signers[0].address);
    const { gasUsed, effectiveGasPrice } = (await (await signers[0].sendTransaction({
      to: contracts.VestingWallet.address,
      value: etherToVest,
    })).wait());
    const deployerFinalEtherBalance = await ethers.provider.getBalance(signers[0].address);
    const expectedEtherBalanceChange = deployerInitialEtherBalance.sub(deployerFinalEtherBalance);
    const actualEtherBalanceChange = gasUsed.mul(effectiveGasPrice).add(etherToVest);
    assert(expectedEtherBalanceChange.eq(actualEtherBalanceChange));
    assert((await ethers.provider.getBalance(contracts.VestingWallet.address)).eq(etherToVest));
    await contracts.ReputationToken.transfer(contracts.VestingWallet.address, reputationTokensToVest);
    await contracts.DaiToken.transfer(contracts.VestingWallet.address, daiTokensToVest);
    assert((await contracts.ReputationToken.balanceOf(contracts.VestingWallet.address)).eq(reputationTokensToVest));
    assert((await contracts.ReputationToken.balanceOf(contracts.AugurDAOTimelock.address)).eq(0));
    assert((await contracts.DaiToken.balanceOf(contracts.VestingWallet.address)).eq(daiTokensToVest));
    assert((await contracts.DaiToken.balanceOf(contracts.AugurDAOTimelock.address)).eq(0));
    assert((await contracts.VestingWallet["released()"]()).eq(0));
    assert((await contracts.VestingWallet["released(address)"](contracts.ReputationToken.address)).eq(0));
    assert((await contracts.VestingWallet["released(address)"](contracts.DaiToken.address)).eq(0));

    // release funds after 1 day and check balances
    await ethers.provider.send("evm_increaseTime", [SECONDS_PER_DAY]);
    assert((await contracts.VestingWallet["released()"]()).eq(0));
    assert((await ethers.provider.getBalance(contracts.AugurDAOTimelock.address)).eq(0));
    await contracts.VestingWallet["release()"]();
    const etherReleasedAfter1Day = await contracts.VestingWallet["released()"]();
    assert((await ethers.provider.getBalance(contracts.AugurDAOTimelock.address)).eq(etherReleasedAfter1Day));
    assert((await contracts.VestingWallet["released(address)"](contracts.ReputationToken.address)).eq(0));
    await contracts.VestingWallet["release(address)"](contracts.ReputationToken.address);
    const reputationTokensReleasedAfter1Day = await contracts.VestingWallet["released(address)"](contracts.ReputationToken.address);
    assert((await contracts.ReputationToken.balanceOf(contracts.AugurDAOTimelock.address)).eq(reputationTokensReleasedAfter1Day));
    assert((await contracts.VestingWallet["released(address)"](contracts.DaiToken.address)).eq(0));
    await contracts.VestingWallet["release(address)"](contracts.DaiToken.address);
    const daiTokensReleasedAfter1Day = await contracts.VestingWallet["released(address)"](contracts.DaiToken.address);
    assert((await contracts.DaiToken.balanceOf(contracts.AugurDAOTimelock.address)).eq(daiTokensReleasedAfter1Day));

    // proposal: augur dao sends some dai to signer 4 from the vesting wallet
    const daiTokensToSend = daiTokensReleasedAfter1Day.sub(ethers.utils.parseEther("1"));
    assert(await isAbleToPropose(contracts.AugurDAO, contracts.WrappedReputationToken, signers[0].address));
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
    await contracts.AugurDAO.connect(signers[1]).castVote(proposalId, true);
    await contracts.AugurDAO.connect(signers[2]).castVote(proposalId, true);
    await contracts.AugurDAO.connect(signers[3]).castVote(proposalId, true);

    // wait for the proposal to mature...
    assert.equal(await waitForProposalToMature(contracts.AugurDAO, proposal), "Succeeded");

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
    assert((await ethers.provider.getBalance(contracts.AugurDAOTimelock.address)).eq(etherReleasedAfter1Day));
    await contracts.VestingWallet["release()"]();
    const etherReleasedAfter365Days = await contracts.VestingWallet["released()"]();
    assert((await ethers.provider.getBalance(contracts.AugurDAOTimelock.address)).eq(etherReleasedAfter365Days));
    assert(etherReleasedAfter365Days.eq(etherToVest));
    assert((await contracts.VestingWallet["released(address)"](contracts.ReputationToken.address)).eq(reputationTokensReleasedAfter1Day));
    await contracts.VestingWallet["release(address)"](contracts.ReputationToken.address);
    const reputationTokensReleasedAfter365Days = await contracts.VestingWallet["released(address)"](contracts.ReputationToken.address);
    assert(reputationTokensReleasedAfter365Days.eq(reputationTokensToVest));
    assert((await contracts.ReputationToken.balanceOf(contracts.AugurDAOTimelock.address)).eq(reputationTokensReleasedAfter365Days));
    assert((await contracts.VestingWallet["released(address)"](contracts.DaiToken.address)).eq(daiTokensReleasedAfter1Day));
    await contracts.VestingWallet["release(address)"](contracts.DaiToken.address);
    const daiTokensReleasedAfter365Days = await contracts.VestingWallet["released(address)"](contracts.DaiToken.address);
    assert((await contracts.DaiToken.balanceOf(contracts.AugurDAOTimelock.address)).eq(daiTokensReleasedAfter365Days.sub(daiTokensToSend)));
    assert(daiTokensReleasedAfter365Days.eq(daiTokensToVest));
  });
});
