pragma solidity 0.4.25;

import "./Owned.sol";
import "./AddressResolver.sol";


contract MixinResolver is Owned {
    AddressResolver public resolver;

    mapping(bytes32 => address) private quickAddressLookup;

    constructor(address _owner, address _resolver) public Owned(_owner) {
        resolver = AddressResolver(_resolver);
    }

    function setResolver(AddressResolver _resolver) public onlyOwner {
        resolver = _resolver;
    }

    function populateLocalLookup(bytes32[] names) external {
        require(msg.sender == address(resolver), "Only the resolver can invoke this");

        for (uint i = 0; i < names.length; i++) {
            quickAddressLookup[names[i]] = resolver.getAddress(names[i]);
        }
    }

    function requireAddress(bytes32 name) internal view returns (address) {
        require(quickAddressLookup[name] != address(0), "Resolver cannot find dep.");
        return quickAddressLookup[name];
    }
}
