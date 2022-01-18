pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./compound/GovernorAlpha.sol";
import "./INonTransferableToken.sol";

/**
 * @title Augur DAO
 * @notice Augur DAO is a modified GovernorAlpha contract that is "guarded" by a guardian DAO.  The guardian DAO uses a
 * non-transferable token for voting, which can be minted and burned by the Augur DAO.  The guardian DAO "guards" the
 * Augur DAO in the sense that it can:
 *   1. Vote to cancel proposals on Augur DAO.
 *   2. Vote to change the governance token of the Augur DAO.  This is intended to be used to update the Reputation
 *      Token wrapper address in the event of an Augur universe fork.
 * @dev AugurDAO is a modified version of GovernorAlpha that has extra functions to interact with a second "guardian"
 * DAO.  The guardian DAO is intended to be an unmodified GovernorAlpha contract.
 */
contract AugurDAO is GovernorAlpha {

    string public constant name = "Augur DAO";

    /**
     * @dev The governance token of the guardian DAO.
     */
    INonTransferableToken public guardianGovernanceToken;

    /**
     * @dev Indicates that the guardian address has been changed.
     */
    bool private isGuardianChanged;

    /**
     * @param timelock_ Address of the Timelock contract responsible for proposal queueing and execution.
     * @param wrappedReputationContract_ Address of the Comp-compatible WrappedReputationToken contract.
     * @param guardian_ Address of the guardian.  Initially this is generally just the uploader's address.
     * @param guardianGovernanceToken_ Address of the guardian DAO's governance token, which is a non-transferable
     * token with mint and burn functions.
     */
    constructor(address timelock_, address wrappedReputationContract_, address guardian_, address guardianGovernanceToken_)
        GovernorAlpha(timelock_, wrappedReputationContract_, guardian_)
        public
    {
        guardianGovernanceToken = INonTransferableToken(guardianGovernanceToken_);
    }

    /**
     * @notice This contract can receive Ether.
     */
    function() external payable {}

    /**
     * @return uint256 The duration of voting on a proposal, in blocks.
     */
    function votingPeriod() public pure returns (uint256) {
        return 23040; // ~4 days in blocks (assuming 15s blocks)
    }

    /**
     * @notice The guardian can assign a new guardian for the Augur DAO.  This can only be done once, and is intended
     * to be used to set the guardian to the guardian DAO.
     * @param newGuardian The address of the new guardian, which should be the address of the guardian DAO.
     */
    function changeGuardian(address newGuardian) public {
        require(!isGuardianChanged, "AugurDAO::changeGuardian: Guardian can only be changed once");
        require(msg.sender == guardian, "AugurDAO::changeGuardian: Guardian can only be changed by the guardian");
        isGuardianChanged = true;
        guardian = newGuardian;
    }

    /**
     * @notice The guardian can change the governance token (i.e., Augur Reputation Token) used by Augur DAO, for
     * example in case of an Augur universe fork.
     * @param newGovernanceToken The address of the new governance token, e.g. the new WrappedReputationToken
     * contract address associated with the ReputationToken of the correct Augur universe.
     */
    function changeGovernanceToken(address newGovernanceToken) public {
        require(msg.sender == guardian, "AugurDAO::changeGovernanceToken: The governance token can only be changed by the guardian");
        comp = CompInterface(newGovernanceToken);
    }

    /**
     * @notice Augur DAO can mint the guardian DAO's governance tokens.
     * @param to The address that will receive the minted guardian DAO governance tokens.
     * @param amount The amount of guardian DAO governance tokens to mint.
     */
    function mintGuardianGovernanceToken(address to, uint256 amount) public {
        guardianGovernanceToken.mint(to, amount);
    }

    /**
     * @notice Augur DAO can burn the guardian DAO's governance tokens.
     * @param account The address that will lose guardian DAO governance tokens.
     * @param amount The amount of guardian DAO governance tokens to burn.
     */
    function burnGuardianGovernanceToken(address account, uint256 amount) public {
        guardianGovernanceToken.burn(account, amount);
    }
}
