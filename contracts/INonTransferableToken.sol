// SPDX-License-Identifier: MIT
pragma solidity ^0.5.16;

interface INonTransferableToken {
    function mint(address to, uint256 amount) external;
    function burn(address account, uint256 amount) external;
}
