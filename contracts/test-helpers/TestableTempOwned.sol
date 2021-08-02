pragma solidity ^0.5.16;

import "../TempOwned.sol";

contract TestableTempOwned is TempOwned {
    uint private meaningOfLife = 42;

    constructor(address _tempOwner, uint _tempOwnerEOL) public TempOwned(_tempOwner, _tempOwnerEOL) {}

    function getMeaningOfLife() external view onlyTemporaryOwner returns (uint) {
        return meaningOfLife;
    }

    function getSomeNumber() external pure returns (uint) {
        return 13;
    }

    function getNow() external view returns (uint) {
        return now;
    }

    function getDebugData()
        external
        view
        returns (
            uint,
            uint,
            uint
        )
    {
        return (meaningOfLife, now, tempOwnerEOL);
    }
}
