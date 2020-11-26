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
    function resolverAddressesRequired() external view returns (bytes32[] memory addresses);

    /* ========== PUBLIC FUNCTIONS ========== */
    function rebuildCache() external {
        bytes32[] memory requiredAddresses = this.resolverAddressesRequired();
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

    /* ========== INTERNAL FUNCTIONS ========== */

    function requireAndGetAddress(bytes32 name) internal view returns (address) {
        address _foundAddress = addressCache[name];
        require(_foundAddress != address(0), string(abi.encodePacked("Missing ", name, " address")));
        return _foundAddress;
    }
}
