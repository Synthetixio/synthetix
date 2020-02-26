pragma solidity 0.4.25;

import "./Owned.sol";
import "./AddressResolver.sol";


contract MixinResolver is Owned {
    AddressResolver public resolver;

    mapping(bytes32 => address) private addressCache;

    bytes32[] private resolverAddressesRequired;

    constructor(address _owner, address _resolver) public Owned(_owner) {
        // resolverAddressesRequired = _resolverAddressesRequired;
        // setResolver(AddressResolver(_resolver));
        resolver = AddressResolver(_resolver);
    }

    /* ========== SETTERS ========== */

    function setResolver(AddressResolver _resolver) public onlyOwner {
        resolver = _resolver;

        // update addressCache with the list of addresses
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

    /* ========== INTERNAL FUNCTIONS ========== */
    function initializeResolver(AddressResolver _resolver, bytes32[] _addressesToCache) internal {
        resolverAddressesRequired = _addressesToCache;
        setResolver(_resolver);
    }

    function requireAndGetAddress(bytes32 name, string reason) internal view returns (address) {
        address _foundAddress = addressCache[name];
        require(_foundAddress != address(0), reason);
        return _foundAddress;
    }
}
