pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./GovernorAlpha.sol";

contract AugurDAO is GovernorAlpha {

    string public constant name = "Augur DAO";

    INonTransferableToken public guardianDaoGovernanceToken;

    constructor(address timelock_, address comp_, address guardian_, address guardianDaoGovernanceToken_)
        GovernorAlpha(timelock_, comp_, guardian_)
        public
    {
        guardianDaoGovernanceToken = INonTransferableToken(guardianDaoGovernanceToken_);
    }

    function votingPeriod() public pure returns (uint) {
        return 100; // for testing ONLY
    }

    function changeGuardian(address newGuardian) public {
        require(msg.sender == guardian, "AugurDAO::changeGuardian: Guardian can only be changed by the guardian");
        guardian = newGuardian;
    }

    // Guardian dao can change the governance token for this dao (e.g. in case of an augur fork)
    function changeGovernanceToken(address newGovernanceToken) public {
        require(msg.sender == guardian, "AugurDAO::changeGovernanceToken: The governance token can only be changed by the guardian");
        comp = CompInterface(newGovernanceToken);
    }

    // This dao can mint governance tokens for guardian dao
    function mintGuardianGovernanceToken(address to, uint256 amount) public {
        guardianDaoGovernanceToken.mint(to, amount);
    }

    // This dao can burn governance tokens for guardian dao
    function burnGuardianGovernanceToken(address account, uint256 amount) public {
        guardianDaoGovernanceToken.burn(account, amount);
    }
}

interface INonTransferableToken {
    function mint(address to, uint256 amount) external;
    function burn(address account, uint256 amount) external;
}
