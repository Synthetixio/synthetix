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

Havven token contract. Havvens are transferrable ERC20 tokens,
and also give their holders the following privileges.
An owner of havvens is entitled to a share in the fees levied on
nomin transactions, and additionally may participate in nomin
confiscation votes.

After a fee period terminates, the duration and fees collected for that
period are computed, and the next period begins.
Thus an account may only withdraw the fees owed to them for the previous
period, and may only do so once per period.
Any unclaimed fees roll over into the common pot for the next period.

The fee entitlement of a havven holder is proportional to their average
havven balance over the last fee period. This is computed by measuring the
area under the graph of a user's balance over time, and then when fees are
distributed, dividing through by the duration of the fee period.

We need only update fee entitlement on transfer when the havven balances of the sender
and recipient are modified. This is for efficiency, and adds an implicit friction to
trading in the havven market. A havven holder pays for his own recomputation whenever
he wants to change his position, which saves the foundation having to maintain a pot
dedicated to resourcing this.

A hypothetical user's balance history over one fee period, pictorially:

      s ____
       |    |
       |    |___ p
       |____|___|___ __ _  _
       f    t   n

Here, the balance was s between times f and t, at which time a transfer
occurred, updating the balance to p, until n, when the present transfer occurs.
When a new transfer occurs at time n, the balance being p,
we must:

  - Add the area p * (n - t) to the total area recorded so far
  - Update the last transfer time to p

So if this graph represents the entire current fee period,
the average havvens held so far is ((t-f)*s + (n-t)*p) / (n-f).
The complementary computations must be performed for both sender and
recipient.

Note that a transfer keeps global supply of havvens invariant.
The sum of all balances is constant, and unmodified by any transfer.
So the sum of all balances multiplied by the duration of a fee period is also
constant, and this is equivalent to the sum of the area of every user's
time/balance graph. Dividing through by that duration yields back the total
havven supply. So, at the end of a fee period, we really do yield a user's
average share in the havven supply over that period.

A slight wrinkle is introduced if we consider the time r when the fee period
rolls over. Then the previous fee period k-1 is before r, and the current fee
period k is afterwards. If the last transfer took place before r,
but the latest transfer occurred afterwards:

k-1       |        k
      s __|_
       |  | |
       |  | |____ p
       |__|_|____|___ __ _  _
          |
       f  | t    n
          r

In this situation the area (r-f)*s contributes to fee period k-1, while
the area (t-r)*s contributes to fee period k. We will implicitly consider a
zero-value transfer to have occurred at time r. Their fee entitlement for the
previous period will be finalised at the time of their first transfer during the
current fee period, or when they query or withdraw their fee entitlement.

In the implementation, the duration of different fee periods may be slightly irregular,
as the check that they have rolled over occurs only when state-changing havven
operations are performed.

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


import "contracts/ERC20Token.sol";
import "contracts/Owned.sol";
import "contracts/EtherNomin.sol";
import "contracts/Court.sol";


contract Havven is ERC20Token, Owned {

    /* ========== STATE VARIABLES ========== */

    // Sums of balances*duration in the current fee period.
    // range: decimals; units: havven-seconds
    mapping(address => uint) currentBalanceSum;

    // Average account balances in the last completed fee period. This is proportional
    // to that account's last period fee entitlement.
    // (i.e. currentBalanceSum for the previous period divided through by duration)
    // range: decimals; units: havvens
    mapping(address => uint) public lastAverageBalance;

    // The average account balances in the period before the last completed fee period.
    // This is used as a person's weight in a confiscation vote, so it implies that
    // the vote duration must be no longer than the fee period in order to guarantee that 
    // no portion of a fee period used for determining vote weights falls within the
    // duration of a vote it contributes to.
    mapping(address => uint) public penultimateAverageBalance;

    // The time an account last made a transfer.
    // range: naturals
    mapping(address => uint) lastTransferTimestamp;

    mapping(address => bool) hasWithdrawnLastPeriodFees;

    // The time the current fee period began.
    uint public feePeriodStartTime;
    // Fee periods will roll over in no shorter a time than this.
    uint public targetFeePeriodDurationSeconds = 1 weeks;
    // And may not be set to be shorter than 1 day.
    uint constant minFeePeriodDurationSeconds = 1 days;
    // The actual measured duration of the last fee period (decimal seconds).
    uint lastFeePeriodDuration = 1;

    // The quantity of nomins that were in the fee pot at the time
    // of the last fee rollover (feePeriodStartTime).
    uint public lastFeesCollected;

    // A given account's vote in some confiscation action.
    // This requires the default value of the Vote enum to correspond to an abstention.
    // If an account's vote is not an abstention, it may not transfer funds.
    mapping(address => Court.Vote) public vote;
    // The vote a user last participated in.
    mapping(address => address) public voteTarget;

    EtherNomin public nomin;
    Court public court;


    /* ========== CONSTRUCTOR ========== */

    function Havven(address _owner)
        ERC20Token("Havven", "HAV",
                   1e8 * UNIT, // initial supply is one hundred million tokens
                   this)
        Owned(_owner)
        public
    {
        feePeriodStartTime = now;
    }


    /* ========== SETTERS ========== */

    function setNomin(EtherNomin _nomin) 
        public
        onlyOwner
    {
        nomin = _nomin;
    }

    function setCourt(Court _court) 
        public
        onlyOwner
    {
        court = _court;
    }

    function setTargetFeePeriodDuration(uint duration)
        public
        postCheckFeePeriodRollover
        onlyOwner
    {
        require(duration >= minFeePeriodDurationSeconds);
        targetFeePeriodDurationSeconds = duration;
        FeePeriodDurationUpdated(duration);
    }


    /* ========== VIEW FUNCTIONS ========== */

    function hasVoted(address account)
        public
        view
        returns (bool)
    {
        return vote[account] != Court.Vote.Abstention;
    }


    /* ========== MUTATIVE FUNCTIONS ========== */

    /* Allow the owner of this contract to endow any address with havvens
     * from the initial supply. */
    function endow(address account, uint value)
        public
        onlyOwner
        returns (bool)
    {
        return this.transfer(account, value);
    }

    /* Override ERC20 transfer function in order to perform
     * fee entitlement recomputation whenever balances are updated.
     */
    function transfer(address _to, uint _value)
        public
        postCheckFeePeriodRollover
        returns (bool)
    {
        uint senderPreBalance = balanceOf[msg.sender];
        uint recipientPreBalance = balanceOf[_to];

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
        uint senderPreBalance = balanceOf[_from];
        uint recipientPreBalance = balanceOf[_to];

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
    function adjustFeeEntitlement(address account, uint preBalance)
        internal
    {
        uint lastTransferTime = lastTransferTimestamp[account];

        // The time since the last transfer clamps at the last fee rollover time if the last transfer
        // was earlier than that.
        rolloverFee(account, lastTransferTime, preBalance);
        currentBalanceSum[account] = safeAdd(currentBalanceSum[account],
                                             safeDecMul(preBalance,
                                                        intToDec(now - lastTransferTime)));

        // Update the last time this user's balance changed.
        lastTransferTimestamp[account] = now;
    }

    /* Update the given account's previous period fee entitlement value.
     * Do nothing if the last transfer occurred since the fee period rolled over.
     * If the entitlement was updated, also update the last transfer time to be
     * at the timestamp of the rollover, so if this should do nothing if called more
     * than once during a given period.
     *
     * Consider the case where the entitlement is updated. If the last transfer
     * occurred at time t, then the starred region is added to the entitlement,
     * the last transfer timestamp is moved to r, and the fee period is
     * rolled over from k-1 to k so that the new fee period start time is at time r.
     * 
     *   k-1       |        k
     *         s __|
     *          |**|
     *          |**|
     *          |**|___ __ _  _
     *             |
     *          t  |
     *             r
     */
    function rolloverFee(address account, uint lastTransferTime, uint preBalance)
        internal
    {
        if (lastTransferTime < feePeriodStartTime) {
            uint timeToRollover = intToDec(feePeriodStartTime - lastTransferTime);
            penultimateAverageBalance[account] = lastAverageBalance[account];

            // If the user did not transfer at all in the last fee period, their average allocation is just their balance.
            if (timeToRollover >= lastFeePeriodDuration) {
                lastAverageBalance[account] = preBalance;
            } else {
                lastAverageBalance[account] = safeDecMul(safeAdd(currentBalanceSum[account],
                                                                 safeDecMul(preBalance, timeToRollover)),
                                                         lastFeePeriodDuration);
            }

            // Roll over to the next fee period.
            currentBalanceSum[account] = 0;
            hasWithdrawnLastPeriodFees[account] = false;
            lastTransferTimestamp[account] = feePeriodStartTime;
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

        // Only allow accounts to withdraw fees once per period.
        require(!hasWithdrawnLastPeriodFees[msg.sender]);

        rolloverFee(msg.sender, lastTransferTimestamp[msg.sender], balanceOf[msg.sender]);
        uint feesOwed = safeDecMul(safeDecMul(lastAverageBalance[msg.sender],
                                              lastFeesCollected),
                                   totalSupply);
        nomin.withdrawFee(msg.sender, feesOwed);
        hasWithdrawnLastPeriodFees[msg.sender] = true;
        FeesWithdrawn(msg.sender, feesOwed);
    }

    /* Indicate that the given account voted yea in a confiscation
     * action on the target account.
     * The account must not have an active vote in any action.
     */
    function setVotedYea(address account, address target)
        public
        onlyCourt
    {
        require(vote[account] == Court.Vote.Abstention);
        vote[account] = Court.Vote.Yea;
        voteTarget[account] = target;
    }

    /* Indicate that the given account voted nay in a confiscation
     * action on the target account.
     * The account must not have an active vote in any action.
     */
    function setVotedNay(address account, address target)
        public
        onlyCourt
    {
        require(vote[account] == Court.Vote.Abstention);
        vote[account] = Court.Vote.Nay;
        voteTarget[account] = target;
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
        onlyCourt
    {
        require(voteTarget[account] == target);
        vote[account] = Court.Vote.Abstention;
        voteTarget[account] = 0;
    }


    /* ========== MODIFIERS ========== */

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
        if (targetFeePeriodDurationSeconds <= duration) {
            lastFeesCollected = nomin.feePool();
            lastFeePeriodDuration = intToDec(duration);
            feePeriodStartTime = now;
        }
    }

    modifier onlyCourt
    {
        require(Court(msg.sender) == court);
        _;
    }


    /* ========== EVENTS ========== */

    event FeePeriodDurationUpdated(uint duration);

    event FeesWithdrawn(address indexed account, uint fees);

}
