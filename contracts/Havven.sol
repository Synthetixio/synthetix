/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       Havven.sol
version:    0.2
author:     Block8 Technologies, in partnership with Havven

            Anton Jurisevic

date:       2018-1-15

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
 *
 * In the implementation, the duration of different fee periods may be slightly irregular,
 * as the check that they have rolled over occurs only when state-changing havven
 * operations are performed.
 */


pragma solidity ^0.4.19;

import "ERC20FeeToken.sol";
import "CollateralisedNomin.sol";

contract Havven is ERC20FeeToken {

    /* ========== STATE VARIABLES ========== */

    mapping(address => uint) feeRights; // range: decimals; units: havven-seconds
    mapping(address => uint) lastPeriodFeeRights; // range: decimals; units: havvens (i.e. feeRights divided through by duration)
    mapping(address => uint) lastTransferTimestamps; // range: naturals

    // Whether a given account is participating in a confiscation vote.
    // 1 <=> a vote for; -1 <=> a vote against.
    // If nonzero, user may not transfer funds.
    mapping(address => int) public votes; 
    // The vote a user last participated in.
    mapping(address => address) public voteTargets;

    // The time the current fee period began.
    uint public feePeriodStartTime;
    // Fee periods will roll over in no shorter a time than this.
    uint public targetFeePeriodDuration = 1 weeks;
    // And may not be set to be shorter than 1 day.
    uint public constant minFeePeriodDuration = 1 days;
    // The actual measured duration of the last fee period.
    uing public lastFeePeriodDuration;

    // The quantity of nomins that were in the fee pot at the time
    // of the last fee rollover (feePeriodStartTime).
    uint public lastFeesCollected;

    CollateralisedNomin public nomin;


    /* ========== CONSTRUCTOR ========== */

    function Havven(address _owner, address _oracle,
                    address _beneficiary, uint _initialEtherPrice)
        ERC20FeeToken(_owner, _owner)
        public
    {
        nomin = new CollateralisedNomin(_owner, this, _oracle, _beneficiary, _initialEtherPrice);
    }


    /* ========== SETTERS ========== */

    function setTargetFeePeriodDuration(uint duration) 
        public
        postCheckFeePeriodRollover
    {
        require(duration >= minFeePeriodDuration);
        targetFeePeriodDuration = duration;
    }


    /* ========== VIEW FUNCTIONS ========== */
    
    function hasVoted(address account)
        public
        view
        returns (bool)
    {
        return votes[account] != 0;
    }


    /* ========== MUTATIVE FUNCTIONS ========== */

    /* Override ERC20 transfer function in order to perform 
     * fee entitlement recomputation whenever balances are updated.
     */
    function transfer(address _to, uint _value)
        public
        postCheckFeePeriodRollover
        returns (bool)
    {
        // Disallow transfers by accounts with an active vote.
        require(!hasVoted(msg.sender));

        uint senderPreBalance = balances[msg.sender];
        uint recipientPreBalance = balances[_to];

        // Perform the transfer: if there is a problem,
        // an exception will be thrown in super.transfer().
        super.transfer(_to, _value);

        // If there was no balance update, no need to update any fee entitlement information.
        if (_value == 0) {
            return true;
        }

        adjustFeeEntitlement(msg.sender, senderPreBalance);
        adjustFeeEntitlement(_to, recipientPreBalance);

        return true;
    }

    /* Override ERC20 transferFrom function in order to perform 
     * fee entitlement recomputation whenever balances are updated.
     */
    function transferFrom(address _from, address _to, uint _value)
        public
        postCheckFeePeriodRollover
        returns (bool)
    {
        // Disallow transfers by accounts with an active vote.
        require(!hasVoted(_from));

        uint senderPreBalance = balances[_from];
        uint recipientPreBalance = balances[_to];

        // Perform the transfer: if there is a problem,
        // an exception will be thrown in super.transferFrom().
        super.transferFrom(_from, _to, _value);

        // If there was no balance update, no need to update any fee entitlement information.
        if (_value == 0) {
            return true;
        }

        adjustFeeEntitlement(_from, senderPreBalance);
        adjustFeeEntitlement(_to, recipientPreBalance);

        return true;
    }

    /* Update the fee entitlement since the last transfer or entitlement
     * adjustment. Since this updates the last transfer timestamp, if invoked
     * consecutively, this function will do nothing after the first call.
     */
    function adjustFeeEntitlement(address account, uint finalBalance)
        internal
    {
        uint lastTransferTime = lastTransferTimestamps[account];

        // The time since the last transfer clamps at the last fee rollover time if the last transfer
        // was earlier than that.
        rolloverFee(account, lastTransferTime, finalBalance);
        feeRights[account] = safeAdd(feeRights[account], safeMul(finalBalance, intToDecimal(now - lastTransferTime)));

        // Update the last time this user's balance changed.
        lastTransferTimestamps[account] = now;
    }

    /* Update the given account's previous period fee entitlement value.
     * Do nothing if the last transfer occurred since the fee period rolled over.
     * If the entitlement was updated, also update the last transfer time to be
     * at the timestamp of the rollover, so if this should do nothing if called more
     * than once during a given period.
     */
    function rolloverFee(address account, uint lastTransferTime, uint finalBalance) 
        internal
    {
        if (lastTransferTime < feePeriodStartTime) {
            uint timeToRollover = intToDecimal(feePeriodStartTime - lastTransferTime);

            // If the user did not transfer at all in the last fee period, their average allocation is just their balance.
            if (timeToRollover >= lastFeePeriodDuration) {
                lastPeriodFeeRights[account] = finalBalance;
            } else {
                lastPeriodFeeRights[account] = safeDiv(safeAdd(feeRights[account], safeMul(balances[account], timeToRollover)), lastFeePeriodDuration);
            }

            // Update current period fee entitlement total and reset the timestamp.
            feeRights[account] = 0;
            lastTransferTimestamps[account] = feePeriodStartTime;
        }
    }

    /* Compute the last period's fee entitlement for the message sender
     * and then deposit it into their nomin account.
     */
    function withdrawFeeEntitlement()
        public
        postCheckFeePeriodRollover
    {
        // Do not deposit fees into frozen accounts.
        require(!nomin.isFrozen(msg.sender));

        rolloverFee(msg.sender, lastTransferTimestamps[msg.sender], balances[msg.sender]);
        uint feesOwed = safeDiv(safeMul(lastPeriodFeeRights[msg.sender], lastFeesCollected), supply);
        nomin.withdrawFee(msg.sender, feesOwed);
        lastPeriodFeeRights[msg.sender] = 0;
    }

    /* Indicate that the given account voted yea in a confiscation
     * action on the target account.
     * The account must not have an active vote in any action.
     */
    function setVotedFor(address account, address target)
        public
        onlyNominContract
    {
        require(voteTargets[account] == 0);
        votes[account] = 1;
        voteTargets[account] = target;
    }

    /* Indicate that the given account voted nay in a confiscation
     * action on the target account.
     * The account must not have an active vote in any action.
     */
    function setVotedAgainst(address account, address target)
        public
        onlyNominContract
    {
        require(voteTargets[account] == 0);
        votes[account] = -1;
        voteTargets[account] = target;
    }

    /* Cancel a previous vote by a given account on a target.
     * The target of the cancelled vote must be the same
     * as the target the account voted upon previously,
     * otherwise throw an exception.
     * This is in order to enforce that a user may only
     * vote upon a single action at a time.
     */
    function cancelVote(address account, address target)
        public
        onlyNominContract
    {
        require(voteTargets[account] == target);
        voteTargets[account] = 0;
        votes[account] = 0;
    }


    /* ========== MODIFIERS ========== */

    modifier onlyNominContract
    {
        require(msg.sender == address(nomin));
        _;
    }

    /* If the fee period has rolled over, then
     * save the duration of the last period and
     * the fees that were collected within it,
     * and start the new period.
     * Check after the modified function has executed
     * so that the contract state the caller saw before
     * calling the function is the actual one they
     * interact with.
     */
    modifier postCheckFeePeriodRollover
    {
        _;
        uint duration = now - feePeriodStartTime;
        if (targetFeePeriodDuration <= duration) {
            lastFeesCollected = nomin.feePool;
            lastFeePeriodDuration = duration;
            feePeriodStartTime = now;
        }
    }


    /* ========== EVENTS ========== */


}
