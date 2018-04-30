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


contract LimitedSetup {

    uint setupExpiryTime;

    function LimitedSetup(uint setupDuration)
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
