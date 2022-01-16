// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Mock is ERC20 {

    constructor(string memory symbol_, address account_, uint256 balance_)
        ERC20("ERC20 Mock", symbol_)
    {
        _mint(account_, balance_);
    }
}
