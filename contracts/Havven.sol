/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       Havven.sol
version:    0.1
author:     Block8 Technologies, in partnership with Havven

            Anton Jurisevic

date:       2018-1-3

checked:    Samuel Brooks
approved:   Samuel Brooks

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

Havven backing token contract scaffold.

-----------------------------------------------------------------
LICENCE INFORMATION
-----------------------------------------------------------------

Copyright (c) 2017 Havven.io

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

This is evidently just a skeleton, but this contract will
need to refer to, and be referenced by, the nomin contract
in order to facilitate fee and fund-freezing functionality.

-----------------------------------------------------------------
Block8 Technologies is accelerating blockchain technology
by incubating meaningful next-generation businesses.
Find out more at https://www.block8.io/
-----------------------------------------------------------------
*/

pragma solidity ^0.4.19;

import "ERC20FeeToken.sol";
import "CollateralisedNomin.sol";

contract Havven is ERC20FeeToken {

    mapping(address => uint) feeRights; // range: decimals; units: havven-seconds
    mapping(address => uint) lastPeriodFeeRights; // range: decimals; units: havvens (i.e. feeRights divided through by duration)
    mapping(address => uint) lastTransferTimestamps; // range: naturals

    // Whether a given account is participating in a confiscation vote.
    // If true, user may not transfer funds.
    mapping(address => bool) isVoting; 

    uint feePeriodStartTime;
    uint feePeriodDuration = 1 weeks;
    uint lastFeesCollected;

    CollateralisedNomin public nomin;

    function Havven(address _owner, address _oracle,
                    address _beneficiary, uint _initialEtherPrice)
        ERC20FeeToken(_owner, _owner)
        public
    {
        nomin = CollateralisedNomin(_owner, this, _oracle, _beneficiary, _initialEtherPrice);
    }

    modifier onlyNominContract
    {
        require(msg.sender == nomin);
        _;
    }

    // Send _value amount of tokens to address _to
    function transfer(address _to, uint _value)
        public
        returns (bool)
    {
        uint senderPreBalance = balances[msg.sender];
        uint recipientPreBalance = balances[_to];

        // Perform the transfer, and fail early if there was a problem, in order to save gas.
        require(super.transfer(_to, _value));

        // If there was no balance update, no need to update any fee entitlement information.
        if (_value == 0) {
            return true;
        }

        adjustFeeEntitlement(msg.sender, senderPreBalance));
        adjustFeeEntitlement(_to, recipientPreBalance));

        return true;
    }

    function adjustFeeEntitlement(address account, uint finalBalance)
        internal
    {
        /* The fee entitlement of a havven holder is their average havven balance over
         * the last fee period. This is computed by measuring the area under the graph of
         * a user's balance over time, and then when fees are distributed,
         * dividing through by the duration of the fee period.
         * 
         * We need only update fee entitlement on transfer when the havven balances of the sender
         * and recipient are modified. This is for efficiency, and adds an implicit friction to
         * trading in the havven market. A havven holder pays for his own recomputation whenever
         * he wants to change his position, which saves the foundation having to maintain a pot
         * dedicated to resourcing this.
         *
         * A hypothetical user's balance history over one fee period, pictorially:
         *
         * s ___
         *  |   |
         *  |   |___ p
         *  |___|___|___ __ _  _ 
         *  f   t   n
         *
         * Here, the balance was s between times f and t, at which time a transfer
         * occurred, updating the balance to p, until n, when the present transfer occurs.
         *
         * When a new transfer occurs, at time n, when the balance was at p,
         * we must:
         *   - Add the area p * (n - t) to the total area recorded so far
         *   - Update the last transfer time to p
         * So in the case that this graph represents the entire current fee period,
         * the average havvens held so far is ((t-f)*s + (n-t)*p) / (n-f).
         * The complementary computations must be performed for both sender and
         * recipient.
         * 
         * Note that, fees extracted notwithstanding, a transfer keeps global supply
         * of havvens invariant. The sum of all balances is constant, and unmodified
         * by a transfer. So the sum of all balances multiplied by the duration of
         * a fee period is also constant, and this is equivalent to the sum of 
         * the area of every user's time/balance graph. Dividing through by that duration
         * yields back the total havven supply. So, at the end of a fee period, we really
         * do yield a user's average share in the havven supply over that period.
         *
         * A slight wrinkle is introduced if we consider the time r when the fee period
         * rolls over. If the last transfer was before r, but the current transfer is afterwards:
         *  
         * s __|_
         *  |    |
         *  |  | |____ p
         *  |____|____|___ __ _  _
         *     |      
         *  f  r t    n
         * 
         * In this situation the area (r-f)*s contributes to the previous fee period, while
         * the area (t-r)*s contributes to the current one. We will implicitly consider a
         * zero-value transfer to have occurred at time r. Their fee entitlement for the
         * previous period will be finalised at the time of their first transfer during the
         * current fee period, or when they query or withdraw their fee entitlement.
         */

        uint lastTransferTime = lastTransferTimestamps[account];

        // The time since the last transfer clamps at the last fee rollover time if the last transfer
        // was earlier than that.
        rolloverFee(account, lastTransferTime, finalBalance);
        feeRights[account] = safeAdd(feeRights[account], safeMul(finalBalance, intToDecimal(now - lastTransferTime)))

        // Update the last time this user's balance changed.
        lastTransferTimestamps[account] = now;
    }

    function rolloverFee(address account, uint lastTransferTime, uint finalBalance) 
        internal
    {
        /* Update the given account's previous period fee entitlement value.
         * Do nothing if the last transfer occurred since the fee period rolled over.
         * If the entitlement was updated, also update the last transfer time to be
         * at the timestamp of the rollover, so if this should do nothing if called more
         * than once during a given period.
         */
        if (lastTransferTime < feePeriodStartTime) {
            uint timeToRollover = intToDecimal(feePeriodStartTime - lastTransferTime);

            // If the user did not transfer at all in the last fee period, their average allocation is just their balance.
            if (timeToRollover >= feePeriodDuration) {
                lastPeriodFeeRights[account] = finalBalance;
            } else {
                lastPeriodFeeRights[account] = safeDiv(safeAdd(feeRights[account], safeMul(balances[account], timeToRollover)), feePeriodDuration);
            }

            // Update current period fee entitlement total and reset the timestamp.
            feeRights[account] = 0;
            lastTransferTimestamps[account] = feePeriodStartTime;
        }
    }

    function withdrawFeeEntitlement()
        public
    {
        rolloverFee(msg.sender, lastTransferTimestamps[msg.sender], balances[msg.sender]);
        uint feesOwed = safeDiv(safeMul(lastPeriodFeeRights[msg.sender], lastFeesCollected), supply);
        nomin.withdrawFee(msg.sender, feesOwed);
        lastPeriodFeeRights[msg.sender] = 0;
    }

    function setVoted(address account)
        public
        onlyNominContract
    {
        isVoting[account] = true;
    }

    function unsetVoted(address account)
        public
        onlyNominContract
    {
        isVoting[account] = false;
    }

    function hasVoted(address account)
        public
        returns (bool)
    {
        return isVoting[account];
    }

}
