// SPDX-License-Identifier: MIT
pragma solidity ^0.5.16;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./compound/Comp.sol";

/**
 * @title Wrapped Reputation Token
 * @notice Wraps an Augur Reputation Token (or another ERC20 token) to have the functionality expected by AugurDAO.
 * @dev Includes logic from OpenZeppelin's ERC20 and ERC20Wrapper contracts, modified for Compound's 96-bit arithmetic.
 */
contract WrappedReputationToken is Comp {

    string public constant name = "Wrapped Reputation";
    string public constant symbol = "wREPv2";
    IERC20 public underlying;
    uint256 public totalSupply;

    constructor(IERC20 reputationTokenToWrap_) Comp(address(0)) public {
        underlying = reputationTokenToWrap_;
    }

    function depositFor(address account, uint256 amount) public returns (bool) {
        SafeERC20.safeTransferFrom(underlying, msg.sender, address(this), amount);
        _mint(account, amount);
        return true;
    }

    function withdrawTo(address account, uint256 amount) public returns (bool) {
        _burn(msg.sender, amount);
        SafeERC20.safeTransfer(underlying, account, amount);
        return true;
    }

    function _mint(address account, uint256 rawAmount) internal {
        require(account != address(0), "WrappedReputationToken::_mint: mint to the zero address");
        uint96 amount = safe96(rawAmount, "amount exceeds 96 bits");
        totalSupply = uint256(add96(safe96(totalSupply, "amount exceeds 96 bits"), amount, "96 bit arithmetic fail"));
        balances[account] = add96(balances[account], amount, "96 bit arithmetic fail");
        emit Transfer(address(0), account, rawAmount);
    }

    function _burn(address account, uint256 rawAmount) internal {
        require(account != address(0), "WrappedReputationToken::_burn: burn from the zero address");
        uint96 amount = safe96(rawAmount, "amount exceeds 96 bits");
        uint96 accountBalance = balances[account];
        require(accountBalance >= rawAmount, "WrappedReputationToken::_burn: burn amount exceeds balance");
        balances[account] = sub96(accountBalance, amount, "96 bit arithmetic fail");
        totalSupply -= rawAmount;
        totalSupply = uint256(sub96(safe96(totalSupply, "amount exceeds 96 bits"), amount, "96 bit arithmetic fail"));
        emit Transfer(account, address(0), rawAmount);
    }

    function _recover(address account) internal returns (uint256) {
        uint256 value = underlying.balanceOf(address(this)) - totalSupply;
        _mint(account, value);
        return value;
    }
}
