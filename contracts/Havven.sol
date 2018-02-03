/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       Havven.sol
version:    0.2
author:     Anton Jurisevic

date:       2018-1-16

checked:    Mike Spain
approved:   Samuel Brooks

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
    mapping(address => uint) public currentBalanceSum;

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
    mapping(address => uint) public lastTransferTimestamp;

    // The time the current fee period began.
    uint public feePeriodStartTime = 3;
    // The actual start of the last fee period (seconds).
    // This, and the penultimate fee period can be initially set to any value
    //   0 < val < now, as everyone's individual lastTransferTime will be 0
    //   and as such, their lastAvgBal/penultimateAvgBal will be set to that value
    //   apart from the contract, which will have totalSupply
    uint lastFeePeriodStartTime = 2;
    // The actual start of the penultimate fee period (seconds).
    uint penultimateFeePeriodStartTime = 1;

    // Fee periods will roll over in no shorter a time than this.
    uint public targetFeePeriodDurationSeconds = 4 weeks;
    // And may not be set to be shorter than a day.
    uint constant minFeePeriodDurationSeconds = 1 days;
    // And may not be set to be longer than six months.
    uint constant maxFeePeriodDurationSeconds = 26 weeks;

    // The quantity of nomins that were in the fee pot at the time
    // of the last fee rollover (feePeriodStartTime).
    uint public lastFeesCollected;

    mapping(address => bool) public hasWithdrawnLastPeriodFees;

    EtherNomin public nomin;


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

    function setTargetFeePeriodDuration(uint duration)
        public
        postCheckFeePeriodRollover
        onlyOwner
    {
        require(minFeePeriodDurationSeconds <= duration &&
                duration <= maxFeePeriodDurationSeconds);
        targetFeePeriodDurationSeconds = duration;
        FeePeriodDurationUpdated(duration);
    }


    /* ========== MUTATIVE FUNCTIONS ========== */

    /* Allow the owner of this contract to endow any address with havvens
     * from the initial supply. Since the entire initial supply resides
     * in the havven contract, this disallows the foundation from withdrawing
     * fees on undistributed balances. This function can also be used
     * to retrieve any havvens sent to the Havven contract itself. */
    function endow(address account, uint value)
        public
        onlyOwner
        returns (bool)
    {
        // Use "this" in order that the havven account is the sender.
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

        // Zero-value transfers still update fee entitlement information,
        // and may roll over the fee period.
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

        // Zero-value transfers still update fee entitlement information,
        // and may roll over the fee period.
        adjustFeeEntitlement(_from, senderPreBalance);
        adjustFeeEntitlement(_to, recipientPreBalance);

        return true;
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

        // check the period has rolled over first
        rolloverFee(msg.sender, lastTransferTimestamp[msg.sender], balanceOf[msg.sender]);

        // Only allow accounts to withdraw fees once per period.
        require(!hasWithdrawnLastPeriodFees[msg.sender]);

        uint feesOwed = safeDecDiv(safeDecMul(lastAverageBalance[msg.sender],
                                              lastFeesCollected),
                                   totalSupply);
        nomin.withdrawFee(msg.sender, feesOwed);
        hasWithdrawnLastPeriodFees[msg.sender] = true;
        FeesWithdrawn(msg.sender, feesOwed);
    }

    /* Update the fee entitlement since the last transfer or entitlement
     * adjustment. Since this updates the last transfer timestamp, if invoked
     * consecutively, this function will do nothing after the first call.
     */
    function adjustFeeEntitlement(address account, uint preBalance)
        internal
    {
        // The time since the last transfer clamps at the last fee rollover time if the last transfer
        // was earlier than that.
        rolloverFee(account, lastTransferTimestamp[account], preBalance);

        currentBalanceSum[account] = safeAdd(
            currentBalanceSum[account],
            safeMul(preBalance, now - lastTransferTimestamp[account])
        );

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
        if (lastTransferTime <= feePeriodStartTime) {
            if (lastTransferTime <= lastFeePeriodStartTime) {
                if (lastTransferTime <= penultimateFeePeriodStartTime) {
                    // transfer was before penultimate period
                    penultimateAverageBalance[account] = preBalance;
                } else {

                    penultimateAverageBalance[account] = safeDiv(
                        safeAdd(currentBalanceSum[account], safeMul(preBalance, (lastFeePeriodStartTime - lastTransferTime))),
                        (lastFeePeriodStartTime - penultimateFeePeriodStartTime)
                    );
                }

                // If the user did not transfer/withdraw in the last fee period
                // their average allocation is just their balance.
                lastAverageBalance[account] = preBalance;
            } else {
                // If the user did transfer in the last period, the penultimate just rolls over from the lastAverageBalance
                penultimateAverageBalance[account] = lastAverageBalance[account];
                lastAverageBalance[account] = safeDiv(
                    safeAdd(currentBalanceSum[account], safeMul(preBalance, (feePeriodStartTime - lastTransferTime))),
                    (feePeriodStartTime - lastFeePeriodStartTime)
                );
            }

            // Roll over to the next fee period.
            currentBalanceSum[account] = 0;
            hasWithdrawnLastPeriodFees[account] = false;
            lastTransferTimestamp[account] = feePeriodStartTime;
        }
    }


    /* ========== MODIFIERS ========== */

    /* If the fee period has rolled over, then
     * save the start times of the last fee period,
     * as well as the penultimate fee period.
     *
     * Check after the modified function has executed
     * so that the contract state the caller saw before
     * calling the function is the actual one they
     * interact with.
     */
    modifier postCheckFeePeriodRollover
    {
        _;
        // If the fee period has rolled over...
        if (feePeriodStartTime + targetFeePeriodDurationSeconds <= now) {
            lastFeesCollected = nomin.feePool();

            // Shift the three period start times back one place
            penultimateFeePeriodStartTime = lastFeePeriodStartTime;
            lastFeePeriodStartTime = feePeriodStartTime;
            feePeriodStartTime = now;
            
            FeePeriodRollover(now);
        }
    }

    /* ========== EVENTS ========== */

    event FeePeriodRollover(uint timestamp);

    event FeePeriodDurationUpdated(uint duration);

    event FeesWithdrawn(address indexed account, uint fees);

}
