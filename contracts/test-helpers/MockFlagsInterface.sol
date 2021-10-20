pragma solidity ^0.8.9;

interface FlagsInterface {
    function getFlag(address) external view returns (bool);

    function getFlags(address[] calldata) external view returns (bool[] memory);
}

contract MockFlagsInterface is FlagsInterface {
    mapping(address => bool) public flags;

    constructor() {}

    function getFlag(address aggregator) external view returns (bool) {
        return flags[aggregator];
    }

    function getFlags(address[] calldata aggregators) external view returns (bool[] memory results) {
        results = new bool[](aggregators.length);

        for (uint i = 0; i < aggregators.length; i++) {
            results[i] = flags[aggregators[i]];
        }
    }

    function flagAggregator(address aggregator) external {
        flags[aggregator] = true;
    }

    function unflagAggregator(address aggregator) external {
        flags[aggregator] = false;
    }
}
