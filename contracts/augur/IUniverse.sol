// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "./IV2ReputationToken.sol";

interface IUniverse {
    function getReputationToken() external view returns (IV2ReputationToken);
    function createChildUniverse(uint256[] calldata _parentPayoutNumerators) external returns (IUniverse);
}
