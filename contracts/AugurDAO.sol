// SPDX-License-Identifier: MIT
pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./compound/GovernorAlpha.sol";

contract AugurDAO is GovernorAlpha {

    string public constant name = "Augur DAO";

    uint256 private _quorumVotes;
    uint256 private _proposalThreshold;
    uint256 private _proposalMaxOperations;
    uint256 private _votingDelay;
    uint256 private _votingPeriod;

    constructor(
        address timelock_,
        address token_,
        address guardian_,
        uint256 quorumVotes_,
        uint256 proposalThreshold_,
        uint256 proposalMaxOperations_,
        uint256 votingDelay_,
        uint256 votingPeriod_
    )
        GovernorAlpha(timelock_, token_, guardian_)
        public
    {
        token = CompInterface(token_);
        _quorumVotes = quorumVotes_;
        _proposalThreshold = proposalThreshold_;
        _proposalMaxOperations = proposalMaxOperations_;
        _votingDelay = votingDelay_;
        _votingPeriod = votingPeriod_;
    }

    function quorumVotes() public view returns (uint256) {
        return _quorumVotes;
    }

    function proposalThreshold() public view returns (uint256) {
        return _proposalThreshold;
    }

    function proposalMaxOperations() public view returns (uint256) {
        return _proposalMaxOperations;
    }

    function votingDelay() public view returns (uint256) {
        return _votingDelay;
    }

    function votingPeriod() public view returns (uint256) {
        return _votingPeriod;
    }

    /**
     * @param newGovernanceToken The address of the new governance token, e.g. the new WrappedReputationToken
     * contract address associated with the ReputationToken of the correct Augur universe.
     */
    function changeGovernanceToken(address newGovernanceToken) public {
        require(msg.sender == address(timelock), "changeGovernanceToken: can only be called by timelock");
        token = CompInterface(newGovernanceToken);
    }
}
