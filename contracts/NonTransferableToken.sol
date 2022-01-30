// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20VotesComp.sol";

/**
 * @title Non-Transferable Token
 * @notice A non-transferable ERC20 token intended for use as a governance token for GuardianDAO.
 * @dev This contract implements special mint and burn functions that can only be called by the canMintAndBurn address,
 * which is set during initialization.  In the context of GuardianDAO, canMintAndBurn should be the address of the
 * AugurDAO contract.
 */
contract NonTransferableToken is ERC20, ERC20Permit, ERC20VotesComp, Initializable {

    /**
     * @dev The address that is allowed to mint and burn Non-Transferable Tokens.  In the context of AugurDAO, this
     * should be set during initialization to the AugurDAO contract address.
     */
    address public canMintAndBurn;

    constructor()
        ERC20("NonTransferableToken", "NTT")
        ERC20Permit("NonTransferableToken")
    {}

    /**
     * @param canMintAndBurn_ The address that is allowed to mint and burn Non-Transferable Tokens.  In the context of
     * AugurDAO, this should be the AugurDAO contract address.
     */
    function initialize(address canMintAndBurn_) public initializer {
        canMintAndBurn = canMintAndBurn_;
    }

    /**
     * @notice Makes this token non-transferable.
     * @dev Requires that either the from or to address for transfers be set to 0, so that only transfers from the 0
     * address (i.e., minting and burning) are allowed.
     */
    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override(ERC20) {
        require(from == address(0) || to == address(0), "_beforeTokenTransfer: NonTransferableToken is non-transferable");
        super._beforeTokenTransfer(from, to, amount);
    }

    /**
     * @dev Mints non-transferable tokens.  Only can be called by the canMintAndBurn address.
     */
    function mint(address to_, uint256 amount_) external {
        require(msg.sender == canMintAndBurn, "mint: Only the canMintAndBurn address can mint tokens");
        _mint(to_, amount_);
    }

    /**
     * @dev Burns non-transferable tokens.  Only can be called by the canMintAndBurn address.
     */
    function burn(address account_, uint256 amount_) external {
        require(msg.sender == canMintAndBurn, "burn: Only the canMintAndBurn address can burn tokens");
        _burn(account_, amount_);
    }

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
