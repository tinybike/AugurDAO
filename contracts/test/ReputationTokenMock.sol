// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ReputationTokenMock is ERC20 {

    constructor(address account, uint256 balance)
        ERC20("REPv2", "REPv2")
    {
        _mint(account, balance);
    }
}
