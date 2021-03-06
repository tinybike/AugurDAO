// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20VotesComp.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Wrapper.sol";

/**
 * @title Wrapped Reputation Token
 * @notice Wraps a Augur Reputation Token (or another ERC20 token) to have the functionality expected by AugurDAO.
 */
contract WrappedReputationToken is ERC20, ERC20Permit, ERC20VotesComp, ERC20Wrapper {

    /**
     * @param reputationTokenToWrap_ The address of the Reputation Token that this contract will wrap.
     */
    constructor(IERC20 reputationTokenToWrap_)
        ERC20("Wrapped Reputation", "WREP")
        ERC20Permit("Wrapped Reputation")
        ERC20Wrapper(reputationTokenToWrap_)
    {}

    // The functions below are overrides required by Solidity.

    function _afterTokenTransfer(address from, address to, uint256 amount) internal override(ERC20, ERC20Votes) {
        super._afterTokenTransfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal override(ERC20, ERC20Votes) {
        super._mint(to, amount);
    }

    function _burn(address account, uint256 amount) internal override(ERC20, ERC20Votes) {
        super._burn(account, amount);
    }
}
