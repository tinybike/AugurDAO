// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../augur/IUniverse.sol";

contract ReputationTokenMock is ERC20 {

    address private universe;

    constructor(uint256 _balance, address _universe) ERC20("Reputation Mock", "REP") {
        _mint(msg.sender, _balance);
        universe = _universe;
    }

    function getUniverse() public view returns (IUniverse) {
        return IUniverse(universe);
    }

    function mint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    function migrateOutByPayout(uint256[] memory /* _payoutNumerators */, uint256 _attotokens) public returns (bool) {
        _burn(msg.sender, _attotokens);
        (bool success, bytes memory data) = universe.call(abi.encodeWithSignature("childUniverse()"));
        require(success);
        (bool success1, bytes memory data1) = bytesToAddress(data).call(abi.encodeWithSignature("getReputationToken()"));
        require(success1);
        (bool success2, bytes memory data2) = bytesToAddress(data1).call(abi.encodeWithSignature("mint(address,uint256)", msg.sender, _attotokens));
        require(success2);
        return true;
    }

    function bytesToAddress(bytes memory b) public pure returns (address addr) {
        assembly {
            addr := mload(add(b, 32))
        } 
    }
}
