pragma solidity 0.4.25;

import "./Owned.sol";


contract DappMaintenance is Owned {
    bool public isPausedMintr = false;
    bool public isPausedSX = false;

    constructor(address _owner) public Owned(_owner) {}

    function setMaintenanceModeAll(bool isPaused) external onlyOwner {
        isPausedMintr = isPaused;
        isPausedSX = isPaused;
        emit MintrMaintenance(isPaused);
        emit SXMaintenance(isPaused);
    }

    function setMaintenanceModeMintr(bool isPaused) external onlyOwner {
        isPausedMintr = isPaused;
        emit MintrMaintenance(isPausedMintr);
    }

    function setMaintenanceModeSX(bool isPaused) external onlyOwner {
        isPausedSX = isPaused;
        emit SXMaintenance(isPausedSX);
    }

    event MintrMaintenance(bool isPaused);
    event SXMaintenance(bool isPaused);
}
