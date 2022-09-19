pragma solidity ^0.5.16;

import "../AddressSetLib.sol";

contract TestableAddressSet {
    using AddressSetLib for AddressSetLib.AddressSet;

    AddressSetLib.AddressSet internal set;

    function contains(address candidate) public view returns (bool) {
        return set.contains(candidate);
    }

    function getPage(uint index, uint pageSize) public view returns (address[] memory) {
        return set.getPage(index, pageSize);
    }

    function add(address element) public {
        set.add(element);
    }

    function remove(address element) public {
        set.remove(element);
    }

    function size() public view returns (uint) {
        return set.elements.length;
    }

    function element(uint index) public view returns (address) {
        return set.elements[index];
    }

    function index(address element) public view returns (uint) {
        return set.indices[element];
    }
}
