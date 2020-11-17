pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./interfaces/IAddressResolver.sol";

// Internal references
import "./interfaces/IIssuer.sol";
import "./MixinResolver.sol";


// https://docs.synthetix.io/contracts/source/contracts/addressresolver
contract AddressResolver is Owned, IAddressResolver {
    mapping(bytes32 => address) public repository;

    constructor(address _owner) public Owned(_owner) {}

    /* ========== RESTRICTED FUNCTIONS ========== */
    function importAddresses(bytes32[] calldata names, address[] calldata destinations) external onlyOwner {
        require(names.length == destinations.length, "Input lengths must match");

        // add everything first
        for (uint i = 0; i < names.length; i++) {
            repository[names[i]] = destinations[i];
        }

        // then rebuild all the caches on everything that needs it

        // NOTE: This will call rebuild twice on proxies and underlyings... need to address thi

        for (uint i = 0; i < destinations.length; i++) {
            // solhint-disable avoid-low-level-calls
            (bool success, ) = address(destinations[i]).call(abi.encodePacked(MixinResolver(0).rebuildCache.selector));
            emit AddressImported(names[i], destinations[i], success);
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
    event AddressImported(bytes32 name, address destination, bool cacheRebuilt);
}
