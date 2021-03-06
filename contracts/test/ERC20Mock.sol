// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Mock is ERC20 {
    constructor(string memory _symbol, uint256 _balance) ERC20("ERC20 Mock", _symbol) {
        _mint(msg.sender, _balance);
    }
}
