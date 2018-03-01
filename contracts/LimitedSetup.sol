/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       LimitedSetup.sol
version:    0.1
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


pragma solidity ^0.4.20;


contract LimitedSetup {

    uint constructionTime;
    uint setupDuration;

    function LimitedSetup(uint _setupDuration)
        public
    {
        constructionTime = now;
        setupDuration = _setupDuration;
    }

    modifier setupFunction
    {
        require(now < constructionTime + setupDuration);
        _;
    }
}
