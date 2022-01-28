// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IUniverse.sol";

interface IV2ReputationToken {
    function totalSupply() external view returns (uint256);
    function balanceOf(address owner) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);    
    function migrateOutByPayout(uint256[] calldata _payoutNumerators, uint256 _attotokens) external returns (bool);
    function migrateIn(address _reporter, uint256 _attotokens) external returns (bool);
    function trustedReportingParticipantTransfer(address _source, address _destination, uint256 _attotokens) external returns (bool);
    function trustedMarketTransfer(address _source, address _destination, uint256 _attotokens) external returns (bool);
    function trustedUniverseTransfer(address _source, address _destination, uint256 _attotokens) external returns (bool);
    function trustedDisputeWindowTransfer(address _source, address _destination, uint256 _attotokens) external returns (bool);
    function getUniverse() external view returns (IUniverse);
    function getTotalMigrated() external view returns (uint256);
    function getTotalTheoreticalSupply() external view returns (uint256);
    function getLegacyRepToken() external view returns (IERC20);
    function mintForReportingParticipant(uint256 _amountMigrated) external returns (bool);
    function parentUniverse() external returns (IUniverse);
    function burnForMarket(uint256 _amountToBurn) external returns (bool);
    function mintForWarpSync(uint256 _amountToMint, address _target) external returns (bool);
}
