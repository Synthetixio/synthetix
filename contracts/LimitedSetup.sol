/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       LimitedSetup.sol
version:    1.0
author:     Anton Jurisevic

date:       2018-2-13

checked:    -
approved:   -

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

A contract with a limited setup period. Any function modified
with the setup modifier will cease to work after the
conclusion of the configurable-length post-construction setup period.

-----------------------------------------------------------------
*/


pragma solidity 0.4.23;

/**
 * @title Any function decorated with the modifier this contract provides
 * deactivates after a specified setup period.
 */
contract LimitedSetup {

    uint setupExpiryTime;

    /**
     * @dev Constructor.
     * @param setupDuration The time the setup period will last for.
     */
    constructor(uint setupDuration)
        public
    {
        setupExpiryTime = now + setupDuration;
    }

    modifier setupFunction
    {
        require(now < setupExpiryTime);
        _;
    }
}
