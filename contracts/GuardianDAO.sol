// SPDX-License-Identifier: MIT
pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./compound/GovernorAlpha.sol";

/**
 * @title Guardian DAO
 * @notice The "guardian" DAO for the Augur DAO.  Guardian DAO uses a non-transferable token for voting, which can be
 * minted and burned by the Augur DAO.  The guardian DAO "guards" the Augur DAO in the sense that it can:
 *   1. Vote to cancel proposals on Augur DAO.
 *   2. Vote to change the governance token of the Augur DAO.  This is intended to be used to update the Reputation
 *      Token wrapper address in the event of an Augur universe fork.
 * @dev Just good old GovernorAlpha with a few constants changed!
 */
contract GuardianDAO is GovernorAlpha {

    string public constant name = "Guardian DAO";

    function quorumVotes() public pure returns (uint) { return 40000e18; } // 40,000 NTT
    function proposalThreshold() public pure returns (uint) { return 10000e18; } // 10,000 NTT
    function votingPeriod() public pure returns (uint) { return 17280; } // ~3 days

    /**
     * @param timelock_ Address of the Timelock contract responsible for proposal queueing and execution.
     * @param nonTransferableTokenContract_ Address of the Comp-compatible NonTransferableToken contract.
     * @param guardian_ Address of the guardian.  Initially this is generally just the uploader's address.
     */
    constructor(address timelock_, address nonTransferableTokenContract_, address guardian_)
        GovernorAlpha(timelock_, nonTransferableTokenContract_, guardian_)
        public
    {}
}
