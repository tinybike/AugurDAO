// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20VotesComp.sol";

contract NonTransferableToken is ERC20, ERC20Permit, ERC20VotesComp, Initializable {

    address public canMintAndBurn;

    constructor()
        ERC20("NonTransferableToken", "NTT")
        ERC20Permit("NonTransferableToken")
    {}

    function initialize(address canMintAndBurn_) public virtual initializer {
        canMintAndBurn = canMintAndBurn_;
    }

    function _afterTokenTransfer(address from, address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._afterTokenTransfer(from, to, amount);
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount)
        internal
        override(ERC20)
    {
        require(from == address(0) || to == address(0), "NonTransferableToken::_beforeTokenTransfer: NonTransferableToken is non-transferable");
        super._beforeTokenTransfer(from, to, amount);
    }

    function mint(address to, uint256 amount)
        external
    {
        require(msg.sender == canMintAndBurn, "NonTransferableToken::mint: Only governor address can mint tokens");
        _mint(to, amount);
    }

    function burn(address account, uint256 amount)
        external
    {
        require(msg.sender == canMintAndBurn, "NonTransferableToken::burn: Only governor address can burn tokens");
        _burn(account, amount);
    }

    function _mint(address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._mint(to, amount);
    }

    function _burn(address account, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._burn(account, amount);
    }
}
