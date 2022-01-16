const { assert, expect } = require("chai");

describe("augur dao", () => {
  let signers;
  let uploader;
  let reputationTokenMockContract;
  let daiTokenMockContract;
  let wrappedReputationTokenContract;
  let augurDaoTimelockContract;
  let guardianDaoTimelockContract;
  let guardianDaoContract;
  let nonTransferableTokenContract;
  let augurDaoContract;
  let vestingWalletContract;
  let ERC20Mock;
  const abi = new ethers.utils.AbiCoder();
  const oneDayInSeconds = 86400;
  const timelockDelay = oneDayInSeconds * 2; // 2 days
  const zeroAddress = "0x0000000000000000000000000000000000000000";
  const uploaderReputationTokenBalance = ethers.utils.parseEther("10000000");
  const uploaderDaiTokenBalance = ethers.utils.parseEther("123456789");
  const initialReputationTokenBalances = ethers.utils.parseEther("40000");
  const amountOfReputationTokenToWrap = ethers.utils.parseEther("30000");
  const vestingStartTimestamp = Math.floor((new Date()).getTime() / 1000); // now
  const vestingDurationSeconds = oneDayInSeconds * 365; // 1 year
  const etherToVest = ethers.utils.parseEther("123");
  const reputationTokensToVest = ethers.utils.parseEther("456");
  const daiTokensToVest = ethers.utils.parseEther("789");

  const deployContractsAndSetupAccounts = async () => {
    signers = await ethers.getSigners();
    uploader = signers[0].address;

    ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    reputationTokenMockContract = await ERC20Mock.deploy("REP", uploader, uploaderReputationTokenBalance);
    await reputationTokenMockContract.deployed();
    for (let i = 1; i < signers.length; i++) {
      await reputationTokenMockContract.transfer(signers[i].address, initialReputationTokenBalances);
      assert((await reputationTokenMockContract.balanceOf(signers[i].address)).eq(initialReputationTokenBalances));
    }

    wrappedReputationTokenContract = await (await ethers.getContractFactory("WrappedReputationToken")).deploy(
      reputationTokenMockContract.address
    );
    await wrappedReputationTokenContract.deployed();
    for (let i = 0; i < signers.length; i++) {
      await reputationTokenMockContract.connect(signers[i]).approve(wrappedReputationTokenContract.address, amountOfReputationTokenToWrap);
      await wrappedReputationTokenContract.connect(signers[i]).depositFor(signers[i].address, amountOfReputationTokenToWrap);
      assert((await wrappedReputationTokenContract.balanceOf(signers[i].address)).eq(amountOfReputationTokenToWrap));
    }

    nonTransferableTokenContract = await (await ethers.getContractFactory("NonTransferableToken")).deploy();
    await nonTransferableTokenContract.deployed();
    assert.equal(await nonTransferableTokenContract.canMintAndBurn(), zeroAddress);

    // Fun with timelocks!
    // 1. deploy timelock with admin set to uploader address.
    // 2. deploy govalpha with timelock set to timelock address and guardian set to uploader address.
    // 3. call timelock queueTransaction(setPendingAdmin), executeTransaction(setPendingAdmin), then govalpha.__acceptAdmin() from the uploader address. timelock admin is now govalpha.
    // 4a. for the guardian dao, call govalpha __abdicate() to set the guardian address to 0.
    // 4b. for the augur dao, call the new function (on AugurDAO) changeGuardian(guardianDaoTimelockAddress) to set the guardian address to the guardian dao timelock's address.

    const Timelock = await ethers.getContractFactory("Timelock");
    guardianDaoTimelockContract = await Timelock.deploy(uploader, timelockDelay);
    await guardianDaoTimelockContract.deployed();
    guardianDaoContract = await (await ethers.getContractFactory("GovernorAlpha")).deploy(
      guardianDaoTimelockContract.address,
      nonTransferableTokenContract.address,
      uploader
    );
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
    augurDaoContract = await (await ethers.getContractFactory("AugurDAO")).deploy(
      augurDaoTimelockContract.address,
      wrappedReputationTokenContract.address,
      uploader,
      nonTransferableTokenContract.address
    );
    await augurDaoContract.deployed();
    assert.equal(await augurDaoContract.guardian(), uploader);
    assert.equal(await augurDaoContract.timelock(), augurDaoTimelockContract.address);
    assert.equal(await augurDaoContract.comp(), wrappedReputationTokenContract.address);
    assert.equal(await augurDaoContract.guardianGovernanceToken(), nonTransferableTokenContract.address);
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
    await expect(
      augurDaoContract.changeGuardian(uploader)
    ).to.be.revertedWith("AugurDAO::changeGuardian: Guardian can only be changed once");
    assert.equal(await augurDaoTimelockContract.admin(), augurDaoContract.address);
    await nonTransferableTokenContract.initialize(augurDaoContract.address);
    await expect(
      nonTransferableTokenContract.initialize(uploader)
    ).to.be.revertedWith("Initializable: contract is already initialized");
    assert.equal(await nonTransferableTokenContract.canMintAndBurn(), augurDaoContract.address);

    // set up a mock dai contract for use with the vesting wallet
    daiTokenMockContract = await ERC20Mock.deploy("DAI", uploader, uploaderDaiTokenBalance);
    await daiTokenMockContract.deployed();
    assert((await daiTokenMockContract.balanceOf(uploader)).eq(uploaderDaiTokenBalance));

    // set up and fund a vesting wallet for gradual release of funds into augur dao
    vestingWalletContract = await (await ethers.getContractFactory("VestingWallet")).deploy(
      augurDaoContract.address,
      vestingStartTimestamp,
      vestingDurationSeconds
    );
    await vestingWalletContract.deployed();
    assert((await vestingWalletContract.start()).eq(vestingStartTimestamp));
    assert((await vestingWalletContract.duration()).eq(vestingDurationSeconds));
    assert((await vestingWalletContract["released()"]()).eq(0));
    assert((await vestingWalletContract["released(address)"](reputationTokenMockContract.address)).eq(0));
    assert((await vestingWalletContract["released(address)"](daiTokenMockContract.address)).eq(0));
    const uploaderInitialEtherBalance = await ethers.provider.getBalance(uploader);
    const { gasUsed, effectiveGasPrice } = (await (await signers[0].sendTransaction({
      to: vestingWalletContract.address,
      value: etherToVest,
    })).wait());
    const uploaderFinalEtherBalance = await ethers.provider.getBalance(uploader);
    const expectedEtherBalanceChange = uploaderInitialEtherBalance.sub(uploaderFinalEtherBalance);
    const actualEtherBalanceChange = gasUsed.mul(effectiveGasPrice).add(etherToVest);
    assert(expectedEtherBalanceChange.eq(actualEtherBalanceChange));
    assert((await ethers.provider.getBalance(vestingWalletContract.address)).eq(etherToVest));
    await reputationTokenMockContract.transfer(vestingWalletContract.address, reputationTokensToVest);
    await daiTokenMockContract.transfer(vestingWalletContract.address, daiTokensToVest);
    assert((await reputationTokenMockContract.balanceOf(vestingWalletContract.address)).eq(reputationTokensToVest));
    assert((await reputationTokenMockContract.balanceOf(augurDaoContract.address)).eq(0));
    assert((await daiTokenMockContract.balanceOf(vestingWalletContract.address)).eq(daiTokensToVest));
    assert((await daiTokenMockContract.balanceOf(augurDaoContract.address)).eq(0));
    assert((await vestingWalletContract["released()"]()).eq(0));
    assert((await vestingWalletContract["released(address)"](reputationTokenMockContract.address)).eq(0));
    assert((await vestingWalletContract["released(address)"](daiTokenMockContract.address)).eq(0));

    // release funds after 1 day and check balances
    await ethers.provider.send("evm_increaseTime", [oneDayInSeconds]);
    assert((await vestingWalletContract["released()"]()).eq(0));
    assert((await ethers.provider.getBalance(augurDaoContract.address)).eq(0));
    await vestingWalletContract["release()"]();
    const etherReleasedAfter1Day = await vestingWalletContract["released()"]();
    assert((await ethers.provider.getBalance(augurDaoContract.address)).eq(etherReleasedAfter1Day));
    assert((await vestingWalletContract["released(address)"](reputationTokenMockContract.address)).eq(0));
    await vestingWalletContract["release(address)"](reputationTokenMockContract.address);
    const reputationTokensReleasedAfter1Day = await vestingWalletContract["released(address)"](reputationTokenMockContract.address);
    assert((await reputationTokenMockContract.balanceOf(augurDaoContract.address)).eq(reputationTokensReleasedAfter1Day));
    assert((await vestingWalletContract["released(address)"](daiTokenMockContract.address)).eq(0));
    await vestingWalletContract["release(address)"](daiTokenMockContract.address);
    const daiTokensReleasedAfter1Day = await vestingWalletContract["released(address)"](daiTokenMockContract.address);
    assert((await daiTokenMockContract.balanceOf(augurDaoContract.address)).eq(daiTokensReleasedAfter1Day));

    // after 365 days all funds should be released
    await ethers.provider.send("evm_increaseTime", [oneDayInSeconds * 364]);
    assert((await vestingWalletContract["released()"]()).eq(etherReleasedAfter1Day));
    assert((await ethers.provider.getBalance(augurDaoContract.address)).eq(etherReleasedAfter1Day));
    await vestingWalletContract["release()"]();
    const etherReleasedAfter365Days = await vestingWalletContract["released()"]();
    assert((await ethers.provider.getBalance(augurDaoContract.address)).eq(etherReleasedAfter365Days));
    assert(etherReleasedAfter365Days.eq(etherToVest));
    assert((await vestingWalletContract["released(address)"](reputationTokenMockContract.address)).eq(reputationTokensReleasedAfter1Day));
    await vestingWalletContract["release(address)"](reputationTokenMockContract.address);
    const reputationTokensReleasedAfter365Days = await vestingWalletContract["released(address)"](reputationTokenMockContract.address);
    assert(reputationTokensReleasedAfter365Days.eq(reputationTokensToVest));
    assert((await reputationTokenMockContract.balanceOf(augurDaoContract.address)).eq(reputationTokensReleasedAfter365Days));
    assert((await vestingWalletContract["released(address)"](daiTokenMockContract.address)).eq(daiTokensReleasedAfter1Day));
    await vestingWalletContract["release(address)"](daiTokenMockContract.address);
    const daiTokensReleasedAfter365Days = await vestingWalletContract["released(address)"](daiTokenMockContract.address);
    assert((await daiTokenMockContract.balanceOf(augurDaoContract.address)).eq(daiTokensReleasedAfter365Days));
    assert(daiTokensReleasedAfter365Days.eq(daiTokensToVest));
  };

  const proposalState = [
    "Pending",
    "Active",
    "Canceled",
    "Defeated",
    "Succeeded",
    "Queued",
    "Expired",
    "Executed",
  ];

  it("wrap and unwrap some reputation tokens", async () => {
    signers = await ethers.getSigners();
    uploader = signers[0].address;
    reputationTokenMockContract = await (await ethers.getContractFactory("ERC20Mock")).deploy(
      "REP",
      uploader,
      uploaderReputationTokenBalance
    );
    await reputationTokenMockContract.deployed();
    wrappedReputationTokenContract = await (await ethers.getContractFactory("WrappedReputationToken")).deploy(
      reputationTokenMockContract.address
    );
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
    const governanceTokensToMint = ethers.utils.parseEther("300000");
    assert((await wrappedReputationTokenContract.balanceOf(uploader)).gt(await augurDaoContract.proposalThreshold()));
    assert((await nonTransferableTokenContract.balanceOf(uploader)).eq(0));
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
      nonTransferableTokenContract.connect(signers[1]).transfer(signers[2].address, 1)
    ).to.be.revertedWith("NonTransferableToken::_beforeTokenTransfer: NonTransferableToken is non-transferable");
    await expect(
      nonTransferableTokenContract.mint(uploader, 1)
    ).to.be.revertedWith("NonTransferableToken::mint: Only the canMintAndBurn address can mint tokens");
    await expect(
      nonTransferableTokenContract.burn(uploader, 1)
    ).to.be.revertedWith("NonTransferableToken::burn: Only the canMintAndBurn address can burn tokens");


    // proposal 2: augur dao burns some guardian dao governance tokens

    // signer 0 makes a proposal on augur dao to burn some of the guardian tokens held by signers 1, 2, and 3
    const governanceTokensToBurn = ethers.utils.parseEther("10000");
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

    // set up the new wrapped reputation token with account 0, then fund accounts 1 and 2, then wrap
    const uploaderNewReputationTokenBalance = ethers.utils.parseEther("999999");
    const initialNewReputationTokenBalances = ethers.utils.parseEther("111111");
    const amountOfNewReputationTokenToWrap = ethers.utils.parseEther("111110");
    const newReputationTokenMockContract = await ERC20Mock.deploy("REPv3", uploader, uploaderReputationTokenBalance);
    await newReputationTokenMockContract.deployed();
    for (let i = 1; i < 3; i++) {
      await newReputationTokenMockContract.transfer(signers[i].address, initialNewReputationTokenBalances);
      assert((await newReputationTokenMockContract.balanceOf(signers[i].address)).eq(initialNewReputationTokenBalances));
    }

    const WrappedReputationToken = await ethers.getContractFactory("WrappedReputationToken");
    newWrappedReputationTokenContract = await WrappedReputationToken.deploy(newReputationTokenMockContract.address);
    await newWrappedReputationTokenContract.deployed();
    for (let i = 1; i < 3; i++) {
      await newReputationTokenMockContract.connect(signers[i]).approve(newWrappedReputationTokenContract.address, amountOfNewReputationTokenToWrap);
      await newWrappedReputationTokenContract.connect(signers[i]).depositFor(signers[i].address, amountOfNewReputationTokenToWrap);
      assert((await newWrappedReputationTokenContract.balanceOf(signers[i].address)).eq(amountOfNewReputationTokenToWrap));
    }

    // signer 1 makes a proposal to change augur dao's governance token
    const newGovernanceTokenAddress = newWrappedReputationTokenContract.address;
    await expect(
      augurDaoContract.changeGovernanceToken(newGovernanceTokenAddress)
    ).to.be.revertedWith("AugurDAO::changeGovernanceToken: The governance token can only be changed by the guardian");
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
  });
});
