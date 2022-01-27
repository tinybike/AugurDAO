// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "../augur/IV2ReputationToken.sol";
import "../augur/IUniverse.sol";

contract UniverseMock {

    IV2ReputationToken private reputationToken;
    address public childUniverse;

    constructor() {}

    function setReputationToken(address _reputationToken) public {
        reputationToken = IV2ReputationToken(_reputationToken);
    }

    function setChildUniverse(address _childUniverse) public {
        childUniverse = _childUniverse;
    }

    function getReputationToken() public view returns (IV2ReputationToken) {
        return reputationToken;
    }

    function createChildUniverse(uint256[] memory /* _parentPayoutNumerators */) public view returns (IUniverse) {
        return IUniverse(childUniverse);
    }
}
