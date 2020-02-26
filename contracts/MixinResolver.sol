pragma solidity 0.4.25;

import "./Owned.sol";
import "./AddressResolver.sol";


contract MixinResolver is Owned {
    AddressResolver public resolver;

    mapping(bytes32 => address) private addressCache;

    bytes32[] private resolverAddressesRequired;

    constructor(address _owner, address _resolver, bytes32[12] _addressesToCache) public Owned(_owner) {
        for (uint i = 0; i < _addressesToCache.length; i++) {
            resolverAddressesRequired.push(_addressesToCache[i]);
        }
        setResolver(AddressResolver(_resolver));
    }

    /* ========== SETTERS ========== */

    function setResolver(AddressResolver _resolver) public onlyOwner {
        resolver = _resolver;

        for (uint i = 0; i < resolverAddressesRequired.length; i++) {
            bytes32 name = resolverAddressesRequired[i];
            addressCache[name] = resolver.getAddress(name);
        }
    }

    /* ========== VIEWS ========== */

    function isResolverCached(AddressResolver _resolver) external view returns (bool) {
        if (resolver != _resolver) {
            return false;
        }

        // otherwise, check everything
        for (uint i = 0; i < resolverAddressesRequired.length; i++) {
            bytes32 name = resolverAddressesRequired[i];
            if (resolver.getAddress(name) != addressCache[name]) {
                return false;
            }
        }

        return true;
    }

    function requireAndGetAddress(bytes32 name, string reason) internal view returns (address) {
        address _foundAddress = addressCache[name];
        require(_foundAddress != address(0), reason);
        return _foundAddress;
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function updateAddressCache(bytes32 name) internal {
        resolverAddressesRequired.push(name);
        // update addressCache with the list of addresses
        addressCache[name] = resolver.getAddress(name);
    }
}
