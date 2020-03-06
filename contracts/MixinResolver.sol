pragma solidity ^0.5.16;

import "./Owned.sol";
import "./AddressResolver.sol";


contract MixinResolver is Owned {
    AddressResolver public resolver;

    constructor(address _owner, address _resolver) public Owned() {
        require(_owner != address(0), "Owner address cannot be 0");
        owner = _owner;
        emit OwnerChanged(address(0), _owner);
        resolver = AddressResolver(_resolver);
    }

    /* ========== SETTERS ========== */

    function setResolver(AddressResolver _resolver) public /*onlyOwner*/ {
        resolver = _resolver;
    }
}
