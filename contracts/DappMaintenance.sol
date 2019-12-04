pragma solidity 0.4.25;

import "./Owned.sol";

/**
 * @title DappMaintenance contract.
 * @dev When the Synthetix system is on maintenance (upgrade, release...etc) the dApps also need
 * to be put on maintenance so no transactions can be done. The DappMaintenance contract is here to keep a state of
 * the dApps which indicates if yes or no, they should be up or down.
 */
contract DappMaintenance is Owned  {
    bool public isPausedMintr = false;
    bool public isPausedSX = false;

    /**
     * @dev Constructor
     */
    constructor(address _owner)
        Owned(_owner)
        public
    {}

    function setMaintenanceModeAll(bool isPaused)
        external
        onlyOwner
    {
        isPausedMintr = isPaused;
        isPausedSX = isPaused;
        emit MintrMaintenance(isPaused);
        emit SXMaintenance(isPaused);
    }

    function setMaintenanceModeMintr(bool isPaused)
        external
        onlyOwner
    {
        isPausedMintr = isPaused;
        emit MintrMaintenance(isPausedMintr);
    }

    function setMaintenanceModeSX(bool isPaused)
        external
        onlyOwner
    {
        isPausedSX = isPaused;
        emit SXMaintenance(isPausedSX);
    }

    event MintrMaintenance(bool isPaused);
    event SXMaintenance(bool isPaused);
}
