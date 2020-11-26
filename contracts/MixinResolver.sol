pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";

// Internal references
import "./AddressResolver.sol";
import "./ReadProxy.sol";


// https://docs.synthetix.io/contracts/source/contracts/mixinresolver
contract MixinResolver {
    AddressResolver public resolver;

    mapping(bytes32 => address) private addressCache;

    constructor(address _resolver) internal {
        resolver = AddressResolver(_resolver);
    }

    /* ========== ABSTRACT FUNCTIONS ========== */

    // Note: this function is public in order for it to be overridden and invoked via super in subclasses
    function resolverAddressesRequired() public view returns (bytes32[] memory addresses);

    /* ========== PUBLIC FUNCTIONS ========== */

    function rebuildCache() external {
        bytes32[] memory requiredAddresses = resolverAddressesRequired();
        // The resolver must call this function whenver it updates its state
        for (uint i = 0; i < requiredAddresses.length; i++) {
            bytes32 name = requiredAddresses[i];
            // Note: can only be invoked once the resolver has all the targets needed added
            addressCache[name] = resolver.requireAndGetAddress(
                name,
                string(abi.encodePacked("Resolver missing target: ", name))
            );
        }
    }

    /* ========== VIEWS ========== */

    function isResolverCached() external view returns (bool) {
        bytes32[] memory requiredAddresses = resolverAddressesRequired();
        for (uint i = 0; i < requiredAddresses.length; i++) {
            bytes32 name = requiredAddresses[i];
            // false if our cache is invalid or if the resolver doesn't have the required address
            if (resolver.getAddress(name) != addressCache[name] || addressCache[name] == address(0)) {
                return false;
            }
        }

        return true;
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function requireAndGetAddress(bytes32 name) internal view returns (address) {
        address _foundAddress = addressCache[name];
        require(_foundAddress != address(0), string(abi.encodePacked("Missing ", name, " address")));
        return _foundAddress;
    }
}
