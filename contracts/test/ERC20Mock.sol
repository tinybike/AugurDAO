// SPDX-License-Identifier: MIT
pragma solidity ^0.5.16;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Mock is ERC20 {

    string public constant name = "ERC20 Mock";
    string public symbol;
    uint8 public constant decimals = 18;

    constructor(string memory symbol_, address account_, uint256 balance_) public {
        symbol = symbol_;
        _mint(account_, balance_);
    }
}
