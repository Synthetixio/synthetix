pragma solidity 0.4.25;

import "./Owned.sol";
import "./AddressResolver.sol";


contract MixinResolver is Owned {
    AddressResolver public resolver;

    mapping(bytes32 => address) private addressCache;

    bytes32[] public resolverAddressesRequired;

    uint public constant MAX_ADDRESSES_FROM_RESOLVER = 24;

    constructor(address _owner, address _resolver, bytes32[24] _addressesToCache) public Owned(_owner) {
        for (uint i = 0; i < _addressesToCache.length; i++) {
            if (_addressesToCache[i] != bytes32(0)) {
                resolverAddressesRequired.push(_addressesToCache[i]);
            }
        }
        // Can't call setResolver() here due to truffle:migrate limitation on the msg.sender
        internalSetResolver(AddressResolver(_resolver));
    }

    /* ========== SETTERS ========== */

    function setResolver(AddressResolver _resolver) public onlyOwner {
        internalSetResolver(_resolver);
    }

    /* ========== VIEWS ========== */

    function requireAndGetAddress(bytes32 name, string reason) internal view returns (address) {
        address _foundAddress = addressCache[name];
        require(_foundAddress != address(0), reason);
        return _foundAddress;
    }

    // Note: this could be made external in a utility contract if addressCache was made public
    // (used for deployment)
    function isResolverCached(AddressResolver _resolver) external view returns (bool) {
        if (resolver != _resolver) {
            return false;
        }

        // otherwise, check everything
        for (uint i = 0; i < resolverAddressesRequired.length; i++) {
            bytes32 name = resolverAddressesRequired[i];
            // false if our cache is invalid or if the resolver doesn't have the required address
            if (resolver.getAddress(name) != addressCache[name] || addressCache[name] == address(0)) {
                return false;
            }
        }

        return true;
    }

    // Note: can be made external into a utility contract (used for deployment)
    function getResolverAddresses() external view returns (bytes32[MAX_ADDRESSES_FROM_RESOLVER] addresses) {
        for (uint i = 0; i < resolverAddressesRequired.length; i++) {
            addresses[i] = resolverAddressesRequired[i];
        }
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function updateAddressCache(bytes32 name) internal {
        resolverAddressesRequired.push(name);
        require(resolverAddressesRequired.length < MAX_ADDRESSES_FROM_RESOLVER, "Max resolver cache size met");
        addressCache[name] = resolver.getAddress(name);
    }

    function internalSetResolver(AddressResolver _resolver) internal {
        resolver = _resolver;

        for (uint i = 0; i < resolverAddressesRequired.length; i++) {
            bytes32 name = resolverAddressesRequired[i];
            addressCache[name] = resolver.getAddress(name);
            // TODO - when cache explicitly, must check like below
            // addressCache[name] = resolver.requireAndGetAddress(name, "Resolver missing target");
        }
    }
}
