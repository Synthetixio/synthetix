/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       Havven.sol
version:    0.2
author:     Block8 Technologies, in partnership with Havven

            Anton Jurisevic

date:       2018-1-16

checked:    -
approved:   -

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

Public getters and callers for all internal functions/modifiers/variables

-----------------------------------------------------------------
LICENCE INFORMATION
-----------------------------------------------------------------

Copyright (c) 2018 Havven.io

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

-----------------------------------------------------------------
RELEASE NOTES
-----------------------------------------------------------------

-----------------------------------------------------------------
Block8 Technologies is accelerating blockchain technology
by incubating meaningful next-generation businesses.
Find out more at https://www.block8.io/
-----------------------------------------------------------------
*/

pragma solidity ^0.4.19;


import "contracts/Havven.sol";



contract PublicHavven is Havven {
    // Public getters for all items in the Havven contract, used for debugging/testing
    function PublicHavven(address _owner)
        Havven(_owner)
        public
    {}

    function _currentBalanceSum(address account)
        public
        view
        returns (uint)
    {
        return currentBalanceSum[account];
    }

    function _lastTransferTimestamp(address account)
        public
        view
        returns (uint)
    {
        return lastTransferTimestamp[account];
    }

    function _hasWithdrawnLastPeriodFees(address account)
        public
        view
        returns (bool)
    {
        return hasWithdrawnLastPeriodFees[account];
    }

    function _lastFeePeriodStartTime()
        public
        view
        returns (uint)
    {
        return lastFeePeriodStartTime;
    }

    function _penultimateFeePeriodStartTime()
        public
        view
        returns (uint)
    {
        return penultimateFeePeriodStartTime;
    }

    function _minFeePeriodDurationSeconds()
        public
        view
        returns (uint)
    {
        return minFeePeriodDurationSeconds;
    }

    function _adjustFeeEntitlement(address account, uint preBalance)
        public
    {
        return adjustFeeEntitlement(account, preBalance);
    }

    function _rolloverFee(address account, uint lastTransferTime, uint preBalance)
        public
    {
        return rolloverFee(account, lastTransferTime, preBalance);
    }

    function _postCheckFeePeriodRollover()
        postCheckFeePeriodRollover
        public
    {}
}
