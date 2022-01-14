const { assert, expect } = require("chai");

describe("augur dao", () => {
  let signers;
  let uploader;
  let wrappedReputationTokenContract;
  let augurDaoTimelockContract;
  let guardianDaoTimelockContract;
  let guardianDaoContract;
  let nonTransferableTokenContract;
  let augurDaoContract;
  const abi = new ethers.utils.AbiCoder();
  const timelockDelay = 86400 * 2;
  const zeroAddress = "0x0000000000000000000000000000000000000000";
  const bigOne = ethers.BigNumber.from(10).pow(18);
  const uploaderReputationTokenBalance = ethers.BigNumber.from(100000000).mul(bigOne);
  const initialReputationTokenBalances = ethers.BigNumber.from(400000).mul(bigOne);
  const amountOfReputationTokenToWrap = ethers.BigNumber.from(300000).mul(bigOne);

  const deployContractsAndSetupAccounts = async () => {
    signers = await ethers.getSigners();
    uploader = signers[0].address;

    const ReputationTokenMock = await ethers.getContractFactory("ReputationTokenMock");
    reputationTokenMockContract = await ReputationTokenMock.deploy(uploader, uploaderReputationTokenBalance);
    await reputationTokenMockContract.deployed();
    for (let i = 1; i < signers.length; i++) {
      await reputationTokenMockContract.transfer(signers[i].address, initialReputationTokenBalances);
      assert((await reputationTokenMockContract.balanceOf(signers[i].address)).eq(initialReputationTokenBalances));
    }

    const WrappedReputationToken = await ethers.getContractFactory("WrappedReputationToken");
    wrappedReputationTokenContract = await WrappedReputationToken.deploy(reputationTokenMockContract.address);
    await wrappedReputationTokenContract.deployed();
    for (let i = 0; i < signers.length; i++) {
      await reputationTokenMockContract.connect(signers[i]).approve(wrappedReputationTokenContract.address, amountOfReputationTokenToWrap);
      await wrappedReputationTokenContract.connect(signers[i]).depositFor(signers[i].address, amountOfReputationTokenToWrap);
      assert((await wrappedReputationTokenContract.balanceOf(signers[i].address)).eq(amountOfReputationTokenToWrap));
    }

    const NonTransferableToken = await ethers.getContractFactory("NonTransferableToken");
    nonTransferableTokenContract = await NonTransferableToken.deploy();
    await nonTransferableTokenContract.deployed();
    assert.equal(await nonTransferableTokenContract.canMintAndBurn(), zeroAddress);

    // Fun with timelocks!
    // 1. deploy timelock with admin set to uploader address.
    // 2. deploy govalpha with timelock set to timelock address and guardian set to uploader address.
    // 3. call timelock queueTransaction(setPendingAdmin), executeTransaction(setPendingAdmin), then govalpha.__acceptAdmin() from the uploader address. timelock admin is now govalpha.
    // 4a. for the guardian dao, call govalpha __abdicate() to set the guardian address to 0.
    // 4b. for the augur dao, call the new function (on GuardedGovernorAlpha) changeGuardian(guardianDaoTimelockAddress) to set the guardian address to the guardian dao timelock's address.

    const Timelock = await ethers.getContractFactory("Timelock");
    guardianDaoTimelockContract = await Timelock.deploy(uploader, timelockDelay);
    await guardianDaoTimelockContract.deployed();
    const GovernorAlpha = await ethers.getContractFactory("GovernorAlpha");
    guardianDaoContract = await GovernorAlpha.deploy(guardianDaoTimelockContract.address, nonTransferableTokenContract.address, uploader);
    await guardianDaoContract.deployed();
    assert.equal(await guardianDaoContract.guardian(), uploader);
    assert.equal(await guardianDaoContract.timelock(), guardianDaoTimelockContract.address);
    assert.equal(await guardianDaoContract.comp(), nonTransferableTokenContract.address);
    let blockNumber = await ethers.provider.getBlockNumber();
    let blockTimestamp = (await ethers.provider.getBlock(blockNumber)).timestamp;
    let eta = blockTimestamp + timelockDelay + 1;
    await guardianDaoTimelockContract.queueTransaction(
      guardianDaoTimelockContract.address,
      0,
      "setPendingAdmin(address)",
      abi.encode(["address"], [guardianDaoContract.address]),
      eta
    );
    await ethers.provider.send("evm_increaseTime", [timelockDelay]);
    assert.equal(await guardianDaoTimelockContract.admin(), uploader);
    await guardianDaoTimelockContract.executeTransaction(
      guardianDaoTimelockContract.address,
      0,
      "setPendingAdmin(address)",
      abi.encode(["address"], [guardianDaoContract.address]),
      eta
    );
    await guardianDaoContract.__acceptAdmin();
    assert.equal(await guardianDaoTimelockContract.admin(), guardianDaoContract.address);
    await guardianDaoContract.__abdicate();
    assert.equal(await guardianDaoContract.guardian(), zeroAddress);

    augurDaoTimelockContract = await Timelock.deploy(uploader, timelockDelay);
    await augurDaoTimelockContract.deployed();
    const GuardedGovernorAlpha = await ethers.getContractFactory("GuardedGovernorAlpha");
    augurDaoContract = await GuardedGovernorAlpha.deploy(augurDaoTimelockContract.address, wrappedReputationTokenContract.address, uploader, nonTransferableTokenContract.address);
    await augurDaoContract.deployed();
    assert.equal(await augurDaoContract.guardian(), uploader);
    assert.equal(await augurDaoContract.timelock(), augurDaoTimelockContract.address);
    assert.equal(await augurDaoContract.comp(), wrappedReputationTokenContract.address);
    assert.equal(await augurDaoContract.guardianDaoGovernanceToken(), nonTransferableTokenContract.address);
    blockNumber = await ethers.provider.getBlockNumber();
    blockTimestamp = (await ethers.provider.getBlock(blockNumber)).timestamp;
    eta = blockTimestamp + timelockDelay + 1;
    await augurDaoTimelockContract.queueTransaction(
      augurDaoTimelockContract.address,
      0,
      "setPendingAdmin(address)",
      abi.encode(["address"], [augurDaoContract.address]),
      eta
    );
    await ethers.provider.send("evm_increaseTime", [timelockDelay]);
    assert.equal(await augurDaoTimelockContract.admin(), uploader);
    await augurDaoTimelockContract.executeTransaction(
      augurDaoTimelockContract.address,
      0,
      "setPendingAdmin(address)",
      abi.encode(["address"], [augurDaoContract.address]),
      eta
    );
    await augurDaoContract.__acceptAdmin();
    assert.equal(await augurDaoTimelockContract.admin(), augurDaoContract.address);
    await augurDaoContract.changeGuardian(guardianDaoTimelockContract.address);
    assert.equal(await augurDaoTimelockContract.admin(), augurDaoContract.address);
    await nonTransferableTokenContract.initialize(augurDaoContract.address);
    assert.equal(await nonTransferableTokenContract.canMintAndBurn(), augurDaoContract.address);
  };

  const proposalState = [
    "Pending",
    "Active",
    "Canceled",
    "Defeated",
    "Succeeded",
    "Queued",
    "Expired",
    "Executed"
  ];

  it("wrap and unwrap some repv2", async () => {
    signers = await ethers.getSigners();
    uploader = signers[0].address;

    const ReputationTokenMock = await ethers.getContractFactory("ReputationTokenMock");
    reputationTokenMockContract = await ReputationTokenMock.deploy(uploader, uploaderReputationTokenBalance);
    await reputationTokenMockContract.deployed();

    const WrappedReputationToken = await ethers.getContractFactory("WrappedReputationToken");
    wrappedReputationTokenContract = await WrappedReputationToken.deploy(reputationTokenMockContract.address);
    await wrappedReputationTokenContract.deployed();

    const initialRepv2Balance = await reputationTokenMockContract.balanceOf(uploader);
    assert.equal(await wrappedReputationTokenContract.balanceOf(uploader), 0);
    await reputationTokenMockContract.approve(wrappedReputationTokenContract.address, 10);
    await wrappedReputationTokenContract.depositFor(uploader, 10);
    assert.equal(await wrappedReputationTokenContract.balanceOf(uploader), 10);
    await wrappedReputationTokenContract.withdrawTo(uploader, 4);
    assert.equal(await wrappedReputationTokenContract.balanceOf(uploader), 6);
    const finalRepv2Balance = await reputationTokenMockContract.balanceOf(uploader);
    assert.equal(initialRepv2Balance.sub(finalRepv2Balance), 6);
  });

  it("make some proposals and run through the basic dao workflow", async () => {
    await deployContractsAndSetupAccounts();

    // proposal 1: augur dao mints some governance tokens for guardian dao

    // delegate before the snapshot
    for (let i = 0; i < 4; i++) {
      assert.equal(await wrappedReputationTokenContract.delegates(signers[i].address), zeroAddress);
      assert((await wrappedReputationTokenContract.getVotes(signers[i].address)).eq(0));
      await wrappedReputationTokenContract.connect(signers[i]).delegate(signers[i].address);
      assert.equal(await wrappedReputationTokenContract.delegates(signers[i].address), signers[i].address);
      assert((await wrappedReputationTokenContract.getVotes(signers[i].address)).eq(amountOfReputationTokenToWrap));
    }

    // signer 0 makes a proposal to mint tokens to signers 1, 2, and 3
    const governanceTokensToMint = ethers.BigNumber.from(300000).mul(bigOne);
    assert((await wrappedReputationTokenContract.balanceOf(uploader)).gt(await augurDaoContract.proposalThreshold()));
    await augurDaoContract.propose(
      [augurDaoContract.address, augurDaoContract.address, augurDaoContract.address],
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
    let proposalId = await augurDaoContract.latestProposalIds(uploader);
    let proposal = await augurDaoContract.proposals(proposalId);
    assert(proposal.forVotes.eq(0));
    assert(proposal.againstVotes.eq(0));
    assert.equal(proposalState[await augurDaoContract.state(proposalId)], "Pending")
    await ethers.provider.send("evm_mine");

    // vote on the proposal
    await augurDaoContract.connect(signers[1]).castVote(proposalId, true);
    let voteReceipt = await augurDaoContract.getReceipt(proposalId, signers[1].address);
    assert.equal(voteReceipt.hasVoted, true);
    assert.equal(voteReceipt.support, true);
    assert(voteReceipt.votes.eq(amountOfReputationTokenToWrap));
    proposal = await augurDaoContract.proposals(proposalId);
    assert(proposal.forVotes.eq(amountOfReputationTokenToWrap));
    assert(proposal.againstVotes.eq(0));
    assert.equal(proposalState[await augurDaoContract.state(proposalId)], "Active");

    await augurDaoContract.connect(signers[2]).castVote(proposalId, true);
    proposal = await augurDaoContract.proposals(proposalId);
    assert(proposal.forVotes.eq(amountOfReputationTokenToWrap.mul(2)));
    assert(proposal.againstVotes.eq(0));
    assert.equal(proposalState[await augurDaoContract.state(proposalId)], "Active");

    await augurDaoContract.connect(signers[3]).castVote(proposalId, true);
    proposal = await augurDaoContract.proposals(proposalId);
    assert(proposal.forVotes.eq(amountOfReputationTokenToWrap.mul(3)));
    assert(proposal.againstVotes.eq(0));
    assert.equal(proposalState[await augurDaoContract.state(proposalId)], "Active");

    // wait for the proposal to mature...
    for (let i = 0; i < proposal.endBlock.sub(proposal.startBlock).toNumber(); i++) {
      await ethers.provider.send("evm_mine");
    }
    proposal = await augurDaoContract.proposals(proposalId);
    assert(proposal.forVotes.eq(amountOfReputationTokenToWrap.mul(3)));
    assert(proposal.againstVotes.eq(0));
    assert.equal(proposalState[await augurDaoContract.state(proposalId)], "Succeeded");

    // queue and execute the proposal
    await augurDaoContract.queue(proposalId);
    assert.equal(proposalState[await augurDaoContract.state(proposalId)], "Queued");
    await ethers.provider.send("evm_increaseTime", [timelockDelay]);
    await augurDaoContract.execute(proposalId);
    assert.equal(proposalState[await augurDaoContract.state(proposalId)], "Executed");
    for (let i = 1; i < 4; i++) {
      assert((await nonTransferableTokenContract.balanceOf(signers[i].address)).eq(governanceTokensToMint));
    }

    // non-transferable token is non-transferable
    await expect(
      nonTransferableTokenContract.connect(signers[1]).transfer(signers[2].address, 1))
    .to.be.revertedWith("NonTransferableToken::_beforeTokenTransfer: NonTransferableToken is non-transferable");
    await expect(
      nonTransferableTokenContract.mint(uploader, 1)
    ).to.be.revertedWith("NonTransferableToken::mint: Only governor address can mint tokens");
    await expect(
      nonTransferableTokenContract.burn(uploader, 1)
    ).to.be.revertedWith("NonTransferableToken::burn: Only governor address can burn tokens");


    // proposal 2: augur dao burns some guardian dao governance tokens

    // signer 0 makes a proposal on augur dao to burn some of the guardian tokens held by signers 1, 2, and 3
    const governanceTokensToBurn = ethers.BigNumber.from(10000).mul(bigOne);
    const governanceTokensRemaining = governanceTokensToMint.sub(governanceTokensToBurn);
    assert((await wrappedReputationTokenContract.balanceOf(uploader)).gt(await augurDaoContract.proposalThreshold()));
    await augurDaoContract.propose(
      [augurDaoContract.address, augurDaoContract.address, augurDaoContract.address],
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
    proposalId = await augurDaoContract.latestProposalIds(uploader);
    proposal = await augurDaoContract.proposals(proposalId);
    assert(proposal.forVotes.eq(0));
    assert(proposal.againstVotes.eq(0));
    assert.equal(proposalState[await augurDaoContract.state(proposalId)], "Pending")
    await ethers.provider.send("evm_mine");

    // vote on the proposal
    await augurDaoContract.connect(signers[1]).castVote(proposalId, true);
    voteReceipt = await augurDaoContract.getReceipt(proposalId, signers[1].address);
    assert.equal(voteReceipt.hasVoted, true);
    assert.equal(voteReceipt.support, true);
    assert(voteReceipt.votes.eq(amountOfReputationTokenToWrap));
    proposal = await augurDaoContract.proposals(proposalId);
    assert(proposal.forVotes.eq(amountOfReputationTokenToWrap));
    assert(proposal.againstVotes.eq(0));
    assert.equal(proposalState[await augurDaoContract.state(proposalId)], "Active");

    await augurDaoContract.connect(signers[2]).castVote(proposalId, true);
    proposal = await augurDaoContract.proposals(proposalId);
    assert(proposal.forVotes.eq(amountOfReputationTokenToWrap.mul(2)));
    assert(proposal.againstVotes.eq(0));
    assert.equal(proposalState[await augurDaoContract.state(proposalId)], "Active");

    await augurDaoContract.connect(signers[3]).castVote(proposalId, true);
    proposal = await augurDaoContract.proposals(proposalId);
    assert(proposal.forVotes.eq(amountOfReputationTokenToWrap.mul(3)));
    assert(proposal.againstVotes.eq(0));
    assert.equal(proposalState[await augurDaoContract.state(proposalId)], "Active");

    // wait for the proposal to mature...
    for (let i = 0; i < proposal.endBlock.sub(proposal.startBlock).toNumber(); i++) {
      await ethers.provider.send("evm_mine");
    }
    proposal = await augurDaoContract.proposals(proposalId);
    assert(proposal.forVotes.eq(amountOfReputationTokenToWrap.mul(3)));
    assert(proposal.againstVotes.eq(0));
    assert.equal(proposalState[await augurDaoContract.state(proposalId)], "Succeeded");

    // queue and execute the proposal
    await augurDaoContract.queue(proposalId);
    assert.equal(proposalState[await augurDaoContract.state(proposalId)], "Queued");
    await ethers.provider.send("evm_increaseTime", [timelockDelay]);
    await augurDaoContract.execute(proposalId);
    assert.equal(proposalState[await augurDaoContract.state(proposalId)], "Executed");
    for (let i = 1; i < 4; i++) {
      assert((await nonTransferableTokenContract.balanceOf(signers[i].address)).eq(governanceTokensRemaining));
    }


    // proposal 3: guardian dao cancels a proposal on augur dao

    // delegate before the snapshot
    for (let i = 1; i < 4; i++) {
      assert.equal(await nonTransferableTokenContract.delegates(signers[i].address), zeroAddress);
      assert((await nonTransferableTokenContract.getVotes(signers[i].address)).eq(0));
      await nonTransferableTokenContract.connect(signers[i]).delegate(signers[i].address);
      assert.equal(await nonTransferableTokenContract.delegates(signers[i].address), signers[i].address);
      assert((await nonTransferableTokenContract.getVotes(signers[i].address)).eq(governanceTokensRemaining));
    }    

    // signer 0 makes a proposal on augur dao to burn some of the guardian tokens held by signers 1, 2, and 3
    assert((await wrappedReputationTokenContract.balanceOf(uploader)).gt(await augurDaoContract.proposalThreshold()));
    await augurDaoContract.propose(
      [augurDaoContract.address, augurDaoContract.address, augurDaoContract.address],
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
    proposalId = await augurDaoContract.latestProposalIds(uploader);
    proposal = await augurDaoContract.proposals(proposalId);
    assert(proposal.forVotes.eq(0));
    assert(proposal.againstVotes.eq(0));
    assert.equal(proposalState[await augurDaoContract.state(proposalId)], "Pending")
    await ethers.provider.send("evm_mine");

    // signer 1 votes for the proposal
    await augurDaoContract.connect(signers[1]).castVote(proposalId, true);
    voteReceipt = await augurDaoContract.getReceipt(proposalId, signers[1].address);
    assert.equal(voteReceipt.hasVoted, true);
    assert.equal(voteReceipt.support, true);
    assert(voteReceipt.votes.eq(amountOfReputationTokenToWrap));
    proposal = await augurDaoContract.proposals(proposalId);
    assert(proposal.forVotes.eq(amountOfReputationTokenToWrap));
    assert(proposal.againstVotes.eq(0));
    assert.equal(proposalState[await augurDaoContract.state(proposalId)], "Active");

    // signer 2 votes against the proposal
    await augurDaoContract.connect(signers[2]).castVote(proposalId, false);
    voteReceipt = await augurDaoContract.getReceipt(proposalId, signers[2].address);
    assert.equal(voteReceipt.hasVoted, true);
    assert.equal(voteReceipt.support, false);
    assert(voteReceipt.votes.eq(amountOfReputationTokenToWrap));
    proposal = await augurDaoContract.proposals(proposalId);
    assert(proposal.forVotes.eq(amountOfReputationTokenToWrap));
    assert(proposal.againstVotes.eq(amountOfReputationTokenToWrap));
    assert.equal(proposalState[await augurDaoContract.state(proposalId)], "Active");

    // signer 3 makes a proposal to cancel the proposal through the guardian dao
    assert((await nonTransferableTokenContract.balanceOf(signers[3].address)).gt(await guardianDaoContract.proposalThreshold()));
    assert.equal(proposalState[await augurDaoContract.state(proposalId)], "Active");
    await expect(
      augurDaoContract.connect(signers[3]).cancel(proposalId)
    ).to.be.revertedWith("GovernorAlpha::cancel: proposer above threshold");
    assert.equal(proposalState[await augurDaoContract.state(proposalId)], "Active");
    await guardianDaoContract.connect(signers[3]).propose(
      [augurDaoContract.address],
      ["0"],
      ["cancel(uint256)"],
      [abi.encode(["uint256"], [proposalId])],
      "cancel a proposal on augur dao"
    );
    let cancelProposalId = await guardianDaoContract.latestProposalIds(signers[3].address);
    let cancelProposal = await guardianDaoContract.proposals(cancelProposalId);
    assert(cancelProposal.forVotes.eq(0));
    assert(cancelProposal.againstVotes.eq(0));
    assert.equal(proposalState[await guardianDaoContract.state(cancelProposalId)], "Pending")
    await ethers.provider.send("evm_mine");

    // signers 1 and 2 vote for the cancel proposal on guardian dao
    await guardianDaoContract.connect(signers[1]).castVote(cancelProposalId, true);
    cancelProposal = await guardianDaoContract.proposals(cancelProposalId);
    assert(cancelProposal.forVotes.eq(governanceTokensRemaining));
    assert(cancelProposal.againstVotes.eq(0));
    assert.equal(proposalState[await guardianDaoContract.state(cancelProposalId)], "Active");

    await guardianDaoContract.connect(signers[2]).castVote(cancelProposalId, true);
    cancelProposal = await guardianDaoContract.proposals(cancelProposalId);
    assert(cancelProposal.forVotes.eq(governanceTokensRemaining.mul(2)));
    assert(cancelProposal.againstVotes.eq(0));
    assert.equal(proposalState[await guardianDaoContract.state(cancelProposalId)], "Active");

    // wait for the proposal to mature...
    for (let i = 0; i < cancelProposal.endBlock.sub(cancelProposal.startBlock).toNumber(); i++) {
      await ethers.provider.send("evm_mine");
    }
    cancelProposal = await guardianDaoContract.proposals(cancelProposalId);
    assert(cancelProposal.forVotes.eq(governanceTokensRemaining.mul(2)));
    assert(cancelProposal.againstVotes.eq(0));
    assert.equal(proposalState[await guardianDaoContract.state(cancelProposalId)], "Succeeded");

    // queue and execute the proposal
    await guardianDaoContract.queue(cancelProposalId);
    assert.equal(proposalState[await guardianDaoContract.state(cancelProposalId)], "Queued");
    await ethers.provider.send("evm_increaseTime", [timelockDelay]);
    assert.equal(proposalState[await augurDaoContract.state(proposalId)], "Active");
    await guardianDaoContract.execute(cancelProposalId);
    assert.equal(proposalState[await guardianDaoContract.state(cancelProposalId)], "Executed");
    assert.equal(proposalState[await augurDaoContract.state(proposalId)], "Canceled");


    // proposal 4: guardian dao changes augur dao's governance token (oh no, augur has forked!)

    // signer 1 makes a proposal to change augur dao's governance token
    const newGovernanceTokenAddress = "0x00000000000000000000000000000000DeaDBeef";
    await expect(
      augurDaoContract.changeGovernanceToken(newGovernanceTokenAddress)
    ).to.be.revertedWith("GuardedGovernorAlpha::changeGovernanceToken: The governance token can only be changed by the guardian");
    assert((await nonTransferableTokenContract.balanceOf(signers[1].address)).gt(await guardianDaoContract.proposalThreshold()));
    await guardianDaoContract.connect(signers[1]).propose(
      [augurDaoContract.address],
      ["0"],
      ["changeGovernanceToken(address)"],
      [abi.encode(["address"], [newGovernanceTokenAddress])],
      "change augur dao's rep token"
    );
    proposalId = await guardianDaoContract.latestProposalIds(signers[1].address);
    proposal = await guardianDaoContract.proposals(proposalId);
    assert(proposal.forVotes.eq(0));
    assert(proposal.againstVotes.eq(0));
    assert.equal(proposalState[await guardianDaoContract.state(proposalId)], "Pending")
    await ethers.provider.send("evm_mine");

    // vote on the proposal
    await guardianDaoContract.connect(signers[1]).castVote(proposalId, true);
    proposal = await guardianDaoContract.proposals(proposalId);
    assert(proposal.forVotes.eq(governanceTokensRemaining));
    assert(proposal.againstVotes.eq(0));
    assert.equal(proposalState[await guardianDaoContract.state(proposalId)], "Active");

    await guardianDaoContract.connect(signers[2]).castVote(proposalId, true);
    proposal = await guardianDaoContract.proposals(proposalId);
    assert(proposal.forVotes.eq(governanceTokensRemaining.mul(2)));
    assert(proposal.againstVotes.eq(0));
    assert.equal(proposalState[await guardianDaoContract.state(proposalId)], "Active");

    // wait for the proposal to mature...
    for (let i = 0; i < proposal.endBlock.sub(proposal.startBlock).toNumber(); i++) {
      await ethers.provider.send("evm_mine");
    }
    proposal = await guardianDaoContract.proposals(proposalId);
    assert(proposal.forVotes.eq(governanceTokensRemaining.mul(2)));
    assert(proposal.againstVotes.eq(0));
    assert.equal(proposalState[await guardianDaoContract.state(proposalId)], "Succeeded");

    // queue and execute the proposal
    await guardianDaoContract.queue(proposalId);
    assert.equal(proposalState[await guardianDaoContract.state(proposalId)], "Queued");
    await ethers.provider.send("evm_increaseTime", [timelockDelay]);
    assert.equal(await augurDaoContract.guardian(), guardianDaoTimelockContract.address);
    assert.equal(await augurDaoContract.comp(), wrappedReputationTokenContract.address);
    await guardianDaoContract.execute(proposalId);
    assert.equal(proposalState[await guardianDaoContract.state(proposalId)], "Executed");
    for (let i = 1; i < 4; i++) {
      assert((await nonTransferableTokenContract.balanceOf(signers[i].address)).eq(governanceTokensRemaining));
    }
    assert.equal(await augurDaoContract.comp(), newGovernanceTokenAddress);
  }).timeout(100000);
});
