pragma solidity 0.4.25;


/**
 * @title Any function decorated with the modifier this contract provides
 * deactivates after a specified setup period.
 */
contract LimitedSetup {
    uint setupExpiryTime;

    /**
     * @dev LimitedSetup Constructor.
     * @param setupDuration The time the setup period will last for.
     */
    constructor(uint setupDuration) public {
        setupExpiryTime = now + setupDuration;
    }

    modifier onlyDuringSetup {
        require(now < setupExpiryTime, "Can only perform this action during setup");
        _;
    }
}
