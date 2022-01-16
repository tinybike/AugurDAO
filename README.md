# Augur DAO

Augur DAO is a modified version of [Governor Alpha](https://github.com/compound-finance/compound-protocol/blob/master/contracts/Governance/GovernorAlpha.sol) designed to serve as a DAO for the [Augur Project](https://augur.net).  While it is intended to use Augur's [Reputation Token](https://github.com/AugurProject/augur/blob/dev/packages/augur-core/src/contracts/reporting/ReputationToken.sol) as its governance token, any ERC20 token will work equally well.

## Contracts

### AugurDAO

The AugurDAO contract is a modified version of [Compound's](https://github.com/compound-finance/compound-protocol) GovernorAlpha contract.  AugurDAO has extra functions to interact with a second "guardian" DAO.  The guardian DAO is a GovernorAlpha contract which is unmodified except for changes to constants.

The guardian DAO uses a non-transferable token for voting, which can be minted and burned by the Augur DAO.  The guardian DAO "guards" the Augur DAO in the sense that it can:

1. Vote to cancel proposals on Augur DAO.
2. Vote to change the governance token of the Augur DAO.  This is intended to be used to update the Reputation Token wrapper address in the event of an Augur universe fork.

### WrappedReputationToken

Wraps an Augur Reputation Token (or another ERC20 token) so that it has the functionality expected by AugurDAO.

### NonTransferableToken

A non-transferable ERC20 token intended for use as a governance token for AugurDAO.  The NonTransferableToken contract implements special `mint` and `burn` functions that can only be called by the `canMintAndBurn` address, which is set during initialization.  In the context of AugurDAO, `canMintAndBurn` should be the address of the AugurDAO contract.

### GovernorAlpha, Timelock, SafeMath

These are essentially unmodified Compound contracts.  The only changes are to constants on the GovernorAlpha contract.

## Tests

Tests are in the test/ directory and can be run using `npm test`.
