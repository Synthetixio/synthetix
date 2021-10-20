pragma solidity ^0.5.16;

// Inheritance
import "./OwnedUpgradeable.sol";
import "./interfaces/IAddressResolver.sol";

// Internal references
import "./interfaces/IIssuer.sol";
import "./MixinResolver.sol";

import "./open-zeppelin/proxy/utils/Initializable.sol";

// https://docs.synthetix.io/contracts/source/contracts/addressresolver
contract AddressResolverUpgradeable is Initializable, OwnedUpgradeable, IAddressResolver {
    mapping(bytes32 => address) public repository;

    // constructor(address _owner) public initializer {
    //     OwnedUpgradeable.initialize(_owner);
    // }

    function initialize(address _owner) internal initializer {
        OwnedUpgradeable.__Owned_init(_owner);
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function importAddresses(bytes32[] calldata names, address[] calldata destinations) external onlyOwner {
        require(names.length == destinations.length, "Input lengths must match");

        for (uint i = 0; i < names.length; i++) {
            bytes32 name = names[i];
            address destination = destinations[i];
            repository[name] = destination;
            emit AddressImported(name, destination);
        }
    }

    /* ========= PUBLIC FUNCTIONS ========== */

    function rebuildCaches(MixinResolver[] calldata destinations) external {
        for (uint i = 0; i < destinations.length; i++) {
            destinations[i].rebuildCache();
        }
    }

    /* ========== VIEWS ========== */

    function areAddressesImported(bytes32[] calldata names, address[] calldata destinations) external view returns (bool) {
        for (uint i = 0; i < names.length; i++) {
            if (repository[names[i]] != destinations[i]) {
                return false;
            }
        }
        return true;
    }

    function getAddress(bytes32 name) external view returns (address) {
        return repository[name];
    }

    function requireAndGetAddress(bytes32 name, string calldata reason) external view returns (address) {
        address _foundAddress = repository[name];
        require(_foundAddress != address(0), reason);
        return _foundAddress;
    }

    function getSynth(bytes32 key) external view returns (address) {
        IIssuer issuer = IIssuer(repository["Issuer"]);
        require(address(issuer) != address(0), "Cannot find Issuer address");
        return address(issuer.synths(key));
    }

    /* ========== EVENTS ========== */

    event AddressImported(bytes32 name, address destination);
}
