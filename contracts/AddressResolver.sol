pragma solidity 0.4.25;

import "./Owned.sol";
import "./interfaces/IMixinResolver.sol";


contract AddressResolver is Owned {
    mapping(bytes32 => address) public repository;

    constructor(address _owner) public Owned(_owner) {}

    function getAddress(bytes32 name) external view returns (address) {
        return repository[name];
    }

    function importAddresses(bytes32[] names, address[] destinations, bytes32[] prepopulate) external onlyOwner {
        require(names.length == destinations.length, "Input lengths must match");

        for (uint i = 0; i < names.length; i++) {
            repository[names[i]] = destinations[i];
        }

        for (i = 0; i < prepopulate.length; i++) {
            IMixinResolver hasResolver = IMixinResolver(repository[prepopulate[i]]);
            hasResolver.populateLocalLookup(names);
        }
    }

    // Qu: what about for all the synths? They will need to all be invoked and told to refresh themselves
    // maybe a function here to do that?'
    function prepopulate(address[] addresses) external onlyOwner {
        // for each addy
        //  cast to IMixinResolver
        //  get the list of addresses
    }
}
