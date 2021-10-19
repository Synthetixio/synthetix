pragma solidity ^0.8.8;

import "../Bytes32SetLib.sol";

contract TestableBytes32Set {
    using Bytes32SetLib for Bytes32SetLib.Bytes32Set;

    Bytes32SetLib.Bytes32Set internal set;

    function contains(bytes32 candidate) public view returns (bool) {
        return set.contains(candidate);
    }

    function getPage(uint index, uint pageSize) public view returns (bytes32[] memory) {
        return set.getPage(index, pageSize);
    }

    function add(bytes32 element) public {
        set.add(element);
    }

    function remove(bytes32 element) public {
        set.remove(element);
    }

    function size() public view returns (uint) {
        return set.elements.length;
    }

    function element(uint index) public view returns (bytes32) {
        return set.elements[index];
    }

    function index(bytes32 element) public view returns (uint) {
        return set.indices[element];
    }
}
