# Augur DAO

Augur DAO is a GovernorAlpha contract that is "guarded" by a guardian DAO.

## Contracts

#### AugurDAO

The AugurDAO contract is a modified version of [Compound's](https://github.com/compound-finance/compound-protocol) [GovernorAlpha contract](https://github.com/compound-finance/compound-protocol/blob/master/contracts/Governance/GovernorAlpha.sol).  AugurDAO has extra functions to interact with a second "guardian" DAO.  The guardian DAO is a GovernorAlpha contract, unmodified except for changes to constants.

The guardian DAO uses a non-transferable token for voting, which can be minted and burned by the Augur DAO.  The guardian DAO "guards" the Augur DAO in the sense that it can:

1. Vote to cancel proposals on Augur DAO.
2. Vote to change the governance token of the Augur DAO.  This is intended to be used to update the Reputation Token wrapper address in the event of an Augur universe fork.

#### WrappedReputationToken

Wraps a Augur Reputation Token (or another ERC20 token) so that it has the functionality expected by AugurDAO.

#### NonTransferableToken

A non-transferable ERC20 token intended for use as a governance token for AugurDAO.  The NonTransferableToken contract implements special `mint` and `burn` functions that can only be called by the `canMintAndBurn` address, which is set during initialization.  In the context of AugurDAO, `canMintAndBurn` should be the address of the AugurDAO contract.

#### GovernorAlpha, Timelock, SafeMath

These are essentially unmodified contracts from [Compound](https://github.com/compound-finance/compound-protocol/blob/master/contracts).  The only changes are to constants on the GovernorAlpha contract.

## Tests

Tests are in the test/ directory and can be run using `npm test`.
