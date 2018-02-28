/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       Havven.sol
version:    0.3
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

pragma solidity ^0.4.20;


import "contracts/ExternStateProxyToken.sol";
import "contracts/EtherNomin.sol";
import "contracts/HavvenEscrow.sol";
import "contracts/TokenState.sol";


contract Havven is ExternStateProxyToken {

    /* ========== STATE VARIABLES ========== */

    // Sums of balances*duration in the current fee period.
    // range: decimals; units: havven-seconds
    mapping(address => uint) public currentBalanceSum;

    // Average account balances in the last completed fee period. This is proportional
    // to that account's last period fee entitlement.
    // (i.e. currentBalanceSum for the previous period divided through by duration)
    // WARNING: This may be out of date.
    // range: decimals; units: havvens
    mapping(address => uint) public lastAverageBalance;

    // The average account balances in the period before the last completed fee period.
    // This is used as a person's weight in a confiscation vote, so it implies that
    // the vote duration must be no longer than the fee period in order to guarantee that 
    // no portion of a fee period used for determining vote weights falls within the
    // duration of a vote it contributes to.
    // WARNING: This may be out of date.
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
    uint public lastFeePeriodStartTime = 2;
    // The actual start of the penultimate fee period (seconds).
    uint public penultimateFeePeriodStartTime = 1;

    // Fee periods will roll over in no shorter a time than this.
    uint public targetFeePeriodDurationSeconds = 4 weeks;
    // And may not be set to be shorter than a day.
    uint constant MIN_FEE_PERIOD_DURATION_SECONDS = 1 days;
    // And may not be set to be longer than six months.
    uint constant MAX_FEE_PERIOD_DURATION_SECONDS = 26 weeks;

    // The quantity of nomins that were in the fee pot at the time
    // of the last fee rollover (feePeriodStartTime).
    uint public lastFeesCollected;

    mapping(address => bool) public hasWithdrawnLastPeriodFees;

    EtherNomin public nomin;
    HavvenEscrow public escrow;


    /* ========== CONSTRUCTOR ========== */

    function Havven(TokenState initialState, address _owner)
        ExternStateProxyToken("Havven", "HAV", 1e8 * UNIT, address(this), initialState, _owner)
        // Owned is initialised in ExternStateProxyToken
        public
    {
        lastTransferTimestamp[this] = now;
        feePeriodStartTime = now;
        lastFeePeriodStartTime = now - targetFeePeriodDurationSeconds;
        penultimateFeePeriodStartTime = now - 2*targetFeePeriodDurationSeconds;
    }


    /* ========== SETTERS ========== */

    function setNomin(EtherNomin _nomin) 
        external
        optionalProxy_onlyOwner
    {
        nomin = _nomin;
    }

    function setEscrow(HavvenEscrow _escrow)
        external
        optionalProxy_onlyOwner
    {
        escrow = _escrow;
    }

    function setTargetFeePeriodDuration(uint duration)
        external
        postCheckFeePeriodRollover
        optionalProxy_onlyOwner
    {
        require(MIN_FEE_PERIOD_DURATION_SECONDS <= duration &&
                duration <= MAX_FEE_PERIOD_DURATION_SECONDS);
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
        external
        optionalProxy_onlyOwner
        returns (bool)
    {

        // Use "this" in order that the havven account is the sender.
        // That this is an explicit transfer also initialises fee entitlement information.
        return _transfer(this, account, value);
    }

    /* Override ERC20 transfer function in order to perform
     * fee entitlement recomputation whenever balances are updated. */
    function transfer(address to, uint value)
        external
        optionalProxy
        returns (bool)
    {
        return _transfer(messageSender, to, value);
    }

    /* Anything calling this must apply the optionalProxy or onlyProxy modifier. */
    function _transfer(address sender, address to, uint value)
        internal
        preCheckFeePeriodRollover
        returns (bool)
    {

        uint senderPreBalance = state.balanceOf(sender);
        uint recipientPreBalance = state.balanceOf(to);

        // Perform the transfer: if there is a problem,
        // an exception will be thrown in this call.
        _transfer_byProxy(sender, to, value);

        // Zero-value transfers still update fee entitlement information,
        // and may roll over the fee period.
        adjustFeeEntitlement(sender, senderPreBalance);
        adjustFeeEntitlement(to, recipientPreBalance);

        return true;
    }

    /* Override ERC20 transferFrom function in order to perform
     * fee entitlement recomputation whenever balances are updated. */
    function transferFrom(address from, address to, uint value)
        external
        preCheckFeePeriodRollover
        optionalProxy
        returns (bool)
    {
        uint senderPreBalance = state.balanceOf(from);
        uint recipientPreBalance = state.balanceOf(to);

        // Perform the transfer: if there is a problem,
        // an exception will be thrown in this call.
        _transferFrom_byProxy(messageSender, from, to, value);

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
        optionalProxy
    {
        address sender = messageSender;

        // Do not deposit fees into frozen accounts.
        require(!nomin.frozen(sender));

        // check the period has rolled over first
        rolloverFee(sender, lastTransferTimestamp[sender], state.balanceOf(sender));

        // Only allow accounts to withdraw fees once per period.
        require(!hasWithdrawnLastPeriodFees[sender]);

        uint feesOwed;

        if (escrow != HavvenEscrow(0)) {
            feesOwed = escrow.totalVestedAccountBalance(sender);
        }

        feesOwed = safeDecDiv(safeDecMul(safeAdd(feesOwed, lastAverageBalance[sender]),
                                         lastFeesCollected),
                              totalSupply);

        hasWithdrawnLastPeriodFees[sender] = true;
        if (feesOwed != 0) {
            nomin.withdrawFee(sender, feesOwed);
            FeesWithdrawn(sender, sender, feesOwed);
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
        if (lastTransferTime < feePeriodStartTime) {
            if (lastTransferTime < lastFeePeriodStartTime) {
                // The last transfer predated the previous two fee periods.
                if (lastTransferTime < penultimateFeePeriodStartTime) {
                    // The balance did nothing in the penultimate fee period, so the average balance
                    // in this period is their pre-transfer balance.
                    penultimateAverageBalance[account] = preBalance;
                // The last transfer occurred within the one-before-the-last fee period.
                } else {
                    // No overflow risk here: the failed guard implies (penultimateFeePeriodStartTime <= lastTransferTime).
                    penultimateAverageBalance[account] = safeDiv(
                        safeAdd(currentBalanceSum[account], safeMul(preBalance, (lastFeePeriodStartTime - lastTransferTime))),
                        (lastFeePeriodStartTime - penultimateFeePeriodStartTime)
                    );
                }

                // The balance did nothing in the last fee period, so the average balance
                // in this period is their pre-transfer balance.
                lastAverageBalance[account] = preBalance;

            // The last transfer occurred within the last fee period.
            } else {
                // The previously-last average balance becomes the penultimate balance.
                penultimateAverageBalance[account] = lastAverageBalance[account];

                // No overflow risk here: the failed guard implies (lastFeePeriodStartTime <= lastTransferTime).
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

    /* Recompute and return the given account's average balance information.
     * This also rolls over the fee period if necessary, and brings
     * the account's current balance sum up to date. */
    function _recomputeAccountLastAverageBalance(address account)
        internal
        preCheckFeePeriodRollover
        returns (uint)
    {
        adjustFeeEntitlement(account, state.balanceOf(account));
        return lastAverageBalance[account];
    }

    /* Recompute and return the sender's average balance information. */
    function recomputeLastAverageBalance()
        external
        optionalProxy
        returns (uint)
    {
        return _recomputeAccountLastAverageBalance(messageSender);
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
        if (feePeriodStartTime + targetFeePeriodDurationSeconds <= now) {
            lastFeesCollected = nomin.feePool();

            // Shift the three period start times back one place
            penultimateFeePeriodStartTime = lastFeePeriodStartTime;
            lastFeePeriodStartTime = feePeriodStartTime;
            feePeriodStartTime = now;
            
            FeePeriodRollover(now);
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

    event FeesWithdrawn(address account, address indexed accountIndex, uint fees);
}
