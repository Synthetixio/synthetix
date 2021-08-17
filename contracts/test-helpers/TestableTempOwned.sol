pragma solidity ^0.5.16;

import "../TemporarilyOwned.sol";

contract TestableTempOwned is TemporarilyOwned {
    uint public testValue;

    constructor(address _tempOwner, uint _duration) public TemporarilyOwned(_tempOwner, _duration) {}

    function setTestValue(uint _testValue) external onlyTemporaryOwner {
        testValue = _testValue;
    }
}
