/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       Havven.sol
version:    1.0
author:     Anton Jurisevic
            Dominic Romanowski

date:       2018-02-05

checked:    Mike Spain
approved:   Samuel Brooks

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

Havven token contract. Havvens are transferable ERC20 tokens,
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

Additionally, we keep track also of the penultimate and not just the last
average balance, in order to support the voting functionality detailed in Court.sol.

-----------------------------------------------------------------

*/

pragma solidity ^0.4.21;


import "contracts/ExternStateProxyToken.sol";
import "contracts/EtherNomin.sol";
import "contracts/HavvenEscrow.sol";
import "contracts/TokenState.sol";
import "contracts/SelfDestructible.sol";


contract Havven is ExternStateToken, SelfDestructible {

    // Havven has two storages
    // bal_s: balances and allowances
    // s: everything else


    /* ========== CONSTRUCTOR ========== */

    function Havven(address initialState, TokenState initialBalanceState, address _owner)
        ExternStateToken("Havven", "HAV", 1e8 * UNIT, address(this), initialState, initialBalanceState, _owner)
        SelfDestructible(_owner, _owner)
        // Owned is initialised in ExternStateProxyToken
        public
    {
        s.setLastTransferTimestamp(this, now);
        s.setFeePeriodStartTime(now);
        s.setLastFeePeriodStartTime(now - s.targetFeePeriodDurationSeconds());
        s.setPenultimateFeePeriodStartTime(now - 2*s.targetFeePeriodDurationSeconds());
    }


    /* ========== SETTERS ========== */

    function setNomin(EtherNomin _nomin) 
        external
        onlyOwner
    {
        s.setNomin(_nomin);
    }

    function setEscrow(HavvenEscrow _escrow)
        external
        onlyOwner
    {
        s.setEscrow(_escrow);
    }

    function setTargetFeePeriodDuration(uint duration)
        external
        postCheckFeePeriodRollover
        onlyOwner
    {
        //        require(MIN_FEE_PERIOD_DURATION_SECONDS <= duration &&
//                duration <= MAX_FEE_PERIOD_DURATION_SECONDS);
        s.setTargetFeePeriodDurationSeconds(duration);
        emit FeePeriodDurationUpdated(duration);
    }


    /* ========== MUTATIVE FUNCTIONS ========== */

    /* Allow the owner of this contract to endow any address with havvens
     * from the initial supply. Since the entire initial supply resides
     * in the havven contract, this disallows the foundation from withdrawing
     * fees on undistributed balances. This function can also be used
     * to retrieve any havvens sent to the Havven contract itself. */
    function endow(address account, uint value)
        external
        onlyOwner
        returns (bool)
    {

        // Use "this" in order that the havven account is the sender.
        // That this is an explicit transfer also initialises fee entitlement information.
        return transfer(this, account, value);
    }

    /* Allow the owner of this contract to emit transfer events for
     * contract setup purposes. */
    function emitTransferEvents(address sender, address[] recipients, uint[] values)
        external
        onlyOwner
    {
        for (uint i = 0; i < recipients.length; ++i) {
            emit Transfer(sender, recipients[i], values[i]);
        }
    }

    /* Override ERC20 transfer function in order to perform
     * fee entitlement recomputation whenever balances are updated.
     * Anything calling this must apply the optionalProxy or onlyProxy modifier. */
    function transfer(address to, uint value)
        public
        preCheckFeePeriodRollover
        returns (bool)
    {
        require(to != address(0));

        uint senderPreBalance = bal_s.balanceOf(msg.sender);
        uint recipientPreBalance = bal_s.balanceOf(to);

        // Insufficient balance will be handled by the safe subtraction.
        bal_s.setBalanceOf(msg.sender, safeSub(senderPreBalance, value));
        bal_s.setBalanceOf(to, safeAdd(recipientPreBalance, value));

        emit Transfer(msg.sender, to, value);

        // Zero-value transfers still update fee entitlement information,
        // and may roll over the fee period.
        adjustFeeEntitlement(msg.sender, msg.senderPreBalance);
        adjustFeeEntitlement(to, recipientPreBalance);

        return true;
    }

    /* Override ERC20 transferFrom function in order to perform
     * fee entitlement recomputation whenever balances are updated. */
    function transferFrom(address from, address to, uint value)
        external
        preCheckFeePeriodRollover
        returns (bool)
    {
        uint senderPreBalance = bal_s.balanceOf(from);
        uint recipientPreBalance = bal_s.balanceOf(to);

        // Perform the transfer: if there is a problem,
        // an exception will be thrown in this call.
        require(from != address(0) && to != address(0));

        // Insufficient balance will be handled by the safe subtraction.
        bal_s.setBalanceOf(from, safeSub(senderPreBalance, value));
        bal_s.setAllowance(from, msg.sender, safeSub(bal_s.allowance(from, msg.sender), value));
        bal_s.setBalanceOf(to, safeAdd(recipientPreBalance, value));

        emit Transfer(from, to, value);

        // Zero-value transfers still update fee entitlement information,
        // and may roll over the fee period.
        adjustFeeEntitlement(from, senderPreBalance);
        adjustFeeEntitlement(to, recipientPreBalance);

        return true;
    }

    /* Compute the last period's fee entitlement for the message sender
     * and then deposit it into their nomin account. */
    function withdrawFeeEntitlement()
        public
        preCheckFeePeriodRollover
    {
        address sender = msg.sender;

        // Do not deposit fees into frozen accounts.
        require(!s.nomin().frozen(sender));

        // check the period has rolled over first
        rolloverFee(sender, s.lastTransferTimestamp(sender), bal_s.balanceOf(sender));

        // Only allow accounts to withdraw fees once per period.
        require(!s.hasWithdrawnLastPeriodFees(sender));

        uint feesOwed;
        HavvenEscrow escrow = s.escrow();
        if (escrow != HavvenEscrow(0)) {
            feesOwed = escrow.totalVestedAccountBalance(sender);
        }

        feesOwed = safeDiv_dec(safeMul_dec(safeAdd(feesOwed, s.lastAverageBalance(sender)),
                                           s.lastFeesCollected()),
                               s.totalSupply());

        s.setHasWithdrawnLastPeriodFees(sender, true);
        if (feesOwed != 0) {
            s.nomin().withdrawFee(sender, feesOwed);
            emit FeesWithdrawn(sender, sender, feesOwed);
        }
    }

    /* Update the fee entitlement since the last transfer or entitlement
     * adjustment. Since this updates the last transfer timestamp, if invoked
     * consecutively, this function will do nothing after the first call. */
    function adjustFeeEntitlement(address account, uint preBalance)
        internal
    {
        // The time since the last transfer clamps at the last fee rollover time if the last transfer
        // was earlier than that.
        rolloverFee(account, s.lastTransferTimestamp(account), preBalance);

        s.setCurrentBalanceSum(account, safeAdd(
            s.currentBalanceSum(account),
            safeMul(preBalance, now - s.lastTransferTimestamp(account))
        ));

        // Update the last time this user's balance changed.
        s.setLastTransferTimestamp(account, now);
    }

    /* Update the given account's previous period fee entitlement value.
     * Do nothing if the last transfer occurred since the fee period rolled over.
     * If the entitlement was updated, also update the last transfer time to be
     * at the timestamp of the rollover, so if this should do nothing if called more
     * than once during a given period.
     *
     * Consider the case where the entitlement is updated. If the last transfer
     * occurred at time t in the last period, then the starred region is added to the
     * entitlement, the last transfer timestamp is moved to r, and the fee period is
     * rolled over from k-1 to k so that the new fee period start time is at time r.
     * 
     *   k-1       |        k
     *         s __|
     *  _  _ ___|**|
     *          |**|
     *  _  _ ___|**|___ __ _  _
     *             |
     *          t  |
     *             r
     * 
     * Similar computations are performed according to the fee period in which the
     * last transfer occurred.
     */
    function rolloverFee(address account, uint lastTransferTime, uint preBalance)
        internal
    {
        if (lastTransferTime < s.feePeriodStartTime()) {
            if (lastTransferTime < s.lastFeePeriodStartTime()) {
                // The last transfer predated the previous two fee periods.
                if (lastTransferTime < s.penultimateFeePeriodStartTime()) {
                    // The balance did nothing in the penultimate fee period, so the average balance
                    // in this period is their pre-transfer balance.
                    s.setPenultimateAverageBalance(account, preBalance);
                // The last transfer occurred within the one-before-the-last fee period.
                } else {
                    // No overflow risk here: the failed guard implies (penultimateFeePeriodStartTime <= lastTransferTime).
                    s.setPenultimateAverageBalance(
                        account,
                        safeDiv(
                            safeAdd(
                                s.currentBalanceSum(account),
                                safeMul(
                                    preBalance,
                                    (s.lastFeePeriodStartTime() - lastTransferTime)
                                )
                            ),
                            (s.lastFeePeriodStartTime() - s.penultimateFeePeriodStartTime())
                        )
                    );
                }

                // The balance did nothing in the last fee period, so the average balance
                // in this period is their pre-transfer balance.
                s.setLastAverageBalance(account, preBalance);

            // The last transfer occurred within the last fee period.
            } else {
                // The previously-last average balance becomes the penultimate balance.
                s.setPenultimateAverageBalance(account, s.lastAverageBalance(account));

                // No overflow risk here: the failed guard implies (lastFeePeriodStartTime <= lastTransferTime).
                s.setLastAverageBalance(account, safeDiv(
                    safeAdd(s.currentBalanceSum(account), safeMul(preBalance, (s.feePeriodStartTime() - s.lastTransferTime()))),
                    (s.feePeriodStartTime() - s.lastFeePeriodStartTime())
                ));
            }

            // Roll over to the next fee period.
            s.setCurrentBalanceSum(account, 0);
            s.setHasWithdrawnLastPeriodFees(account, false);
            s.setLastTransferTimestamp(account, s.feePeriodStartTime());
        }
    }

    /* Recompute and return the given account's average balance information.
     * This also rolls over the fee period if necessary, and brings
     * the account's current balance sum up to date. */
    function _recomputeAccountLastAverageBalance(address account)
        internal
        preCheckFeePeriodRollover
        returns (uint)
    {
        adjustFeeEntitlement(account, bal_s.balanceOf(account));
        return s.lastAverageBalance(account);
    }

    /* Recompute and return the sender's average balance information. */
    function recomputeLastAverageBalance()
        external
        returns (uint)
    {
        return _recomputeAccountLastAverageBalance(msg.sender);
    }

    /* Recompute and return the given account's average balance information. */
    function recomputeAccountLastAverageBalance(address account)
        external
        returns (uint)
    {
        return _recomputeAccountLastAverageBalance(account);
    }

    function rolloverFeePeriod()
        public
    {
        checkFeePeriodRollover();
    }


    /* ========== MODIFIERS ========== */

    /* If the fee period has rolled over, then
     * save the start times of the last fee period,
     * as well as the penultimate fee period.
     */
    function checkFeePeriodRollover()
        internal
    {
        // If the fee period has rolled over...
        if (s.feePeriodStartTime() + s.targetFeePeriodDurationSeconds() <= now) {
            s.setLastFeesCollected(s.nomin().feePool());

            // Shift the three period start times back one place
            s.setPenultimateFeePeriodStartTime(s.lastFeePeriodStartTime());
            s.setLastFeePeriodStartTime(s.feePeriodStartTime());
            s.setFeePeriodStartTime(now);
            
            emit FeePeriodRollover(now);
        }
    }

    modifier postCheckFeePeriodRollover
    {
        _;
        checkFeePeriodRollover();
    }

    modifier preCheckFeePeriodRollover
    {
        checkFeePeriodRollover();
        _;
    }


    /* ========== EVENTS ========== */

    event FeePeriodRollover(uint timestamp);

    event FeePeriodDurationUpdated(uint duration);

    event FeesWithdrawn(address account, address indexed accountIndex, uint value);
}
