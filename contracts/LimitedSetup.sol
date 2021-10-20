pragma solidity ^0.8.9;

// https://docs.synthetix.io/contracts/source/contracts/limitedsetup
abstract contract LimitedSetup {
    uint public setupExpiryTime;

    /**
     * @dev LimitedSetup Constructor.
     * @param setupDuration The time the setup period will last for.
     */
    constructor(uint setupDuration) {
        setupExpiryTime = block.timestamp + setupDuration;
    }

    modifier onlyDuringSetup {
        require(block.timestamp < setupExpiryTime, "Can only perform this action during setup");
        _;
    }
}
