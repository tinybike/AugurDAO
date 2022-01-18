// SPDX-License-Identifier: MIT
pragma solidity ^0.5.16;

import "./compound/Comp.sol";

/**
 * @title Non-Transferable Token
 * @notice A non-transferable ERC20 token intended for use as a governance token for AugurDAO's Guardian DAO.
 * @dev This contract implements special mint and burn functions that can only be called by the canMintAndBurn address,
 * which is set during initialization.  In the context of AugurDAO, canMintAndBurn should be the address of the
 * AugurDAO contract.  Includes logic from OpenZeppelin's ERC20 contract, modified for Compound's 96-bit arithmetic.
 */
contract NonTransferableToken is Comp {

    string public constant name = "Non-Transferable Token";
    string public constant symbol = "NTT";
    uint256 public totalSupply;

    /**
     * @dev The address that is allowed to mint and burn Non-Transferable Tokens.  In the context of AugurDAO, this
     * should be set during initialization to the AugurDAO contract address.
     */
    address public canMintAndBurn;

    /**
     * @dev Indicates that the canMintAndBurn address has been set.
     */
    bool private isCanMintAndBurnSet;

    constructor() Comp(address(0)) public {}

    /**
     * @param canMintAndBurn_ The address that is allowed to mint and burn Non-Transferable Tokens.  In the context of
     * AugurDAO, this should be the AugurDAO contract address.
     */
    function setCanMintAndBurn(address canMintAndBurn_) public {
        require(!isCanMintAndBurnSet, "NonTransferableToken::setCanMintAndBurn: canMintAndBurn address can only be set once");
        isCanMintAndBurnSet = true;
        canMintAndBurn = canMintAndBurn_;
    }

    /**
     * @dev Mints non-transferable tokens.  Only can be called by the canMintAndBurn address.
     */
    function mint(address to, uint256 amount) external {
        require(msg.sender == canMintAndBurn, "NonTransferableToken::mint: Only the canMintAndBurn address can mint tokens");
        _mint(to, amount);
    }

    /**
     * @dev Burns non-transferable tokens.  Only can be called by the canMintAndBurn address.
     */
    function burn(address account, uint256 amount) external {
        require(msg.sender == canMintAndBurn, "NonTransferableToken::burn: Only the canMintAndBurn address can burn tokens");
        _burn(account, amount);
    }

    /**
     * @notice Makes this token non-transferable.
     * @dev Requires that either the from or to address for transfers be set to 0, so that only transfers from the 0
     * address (i.e., minting and burning) are allowed.
     */
    function _beforeTokenTransfer(address from, address to, uint256) internal pure {
        require(from == address(0) || to == address(0), "NonTransferableToken::_beforeTokenTransfer: NonTransferableToken is non-transferable");
    }

    function transfer(address dst, uint256 rawAmount) public returns (bool) {
        _beforeTokenTransfer(msg.sender, dst, rawAmount);
        uint96 amount = safe96(rawAmount, "NonTransferableToken::transfer: amount exceeds 96 bits");
        _transferTokens(msg.sender, dst, amount);
        return true;
    }

    function _mint(address account, uint256 rawAmount) internal {
        require(account != address(0), "NonTransferableToken::_mint: mint to the zero address");
        _beforeTokenTransfer(address(0), account, rawAmount);
        uint96 amount = safe96(rawAmount, "amount exceeds 96 bits");
        totalSupply = uint256(add96(safe96(totalSupply, "amount exceeds 96 bits"), amount, "96 bit arithmetic fail"));
        balances[account] = add96(balances[account], amount, "96 bit arithmetic fail");
        emit Transfer(address(0), account, rawAmount);
    }

    function _burn(address account, uint256 rawAmount) internal {
        require(account != address(0), "NonTransferableToken::_burn: burn from the zero address");
        _beforeTokenTransfer(account, address(0), rawAmount);
        uint96 amount = safe96(rawAmount, "amount exceeds 96 bits");
        uint96 accountBalance = balances[account];
        require(accountBalance >= rawAmount, "NonTransferableToken::_burn: burn amount exceeds balance");
        balances[account] = sub96(accountBalance, amount, "96 bit arithmetic fail");
        totalSupply = uint256(sub96(safe96(totalSupply, "amount exceeds 96 bits"), amount, "96 bit arithmetic fail"));
        emit Transfer(account, address(0), rawAmount);
    }
}
