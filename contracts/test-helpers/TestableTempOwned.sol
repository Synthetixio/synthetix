pragma solidity ^0.5.16;

import "../TempOwned.sol";

contract TestableTempOwned is TempOwned {
    uint public testValue;

    constructor(address _tempOwner, uint _tempOwnerEOL) public TempOwned(_tempOwner, _tempOwnerEOL) {}

    function setTestValue(uint _testValue) external onlyTemporaryOwner {
        testValue = _testValue;
    }
}
