pragma solidity ^0.5.16;

import "../TempOwned.sol";

contract TestableTempOwned is TempOwned {
    uint8 public testValue = 1;

    constructor(address _tempOwner, uint _tempOwnerEOL) public TempOwned(_tempOwner, _tempOwnerEOL) {}

    function setTestValue(uint8 _testValue) external onlyTemporaryOwner {
        testValue = _testValue;
    }
}
