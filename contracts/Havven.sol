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

-----------------------------------------------------------------

*/

pragma solidity 0.4.21;


import "contracts/ExternStateToken.sol";
import "contracts/Nomin.sol";
import "contracts/HavvenEscrow.sol";
import "contracts/TokenState.sol";
import "contracts/SelfDestructible.sol";


contract Havven is SelfDestructible, ExternStateToken {

    /* ========== STATE VARIABLES ========== */

    // Sums of balances*duration in the current fee period.
    // range: decimals; units: havven-seconds

    struct BalanceManager {
        uint currentBalanceSum;
        uint lastAverageBalance;
        uint lastTransferTimestamp;
    }

    mapping(address => BalanceManager) internal havvenBalanceManager;
    mapping(address => BalanceManager) internal issuedNominBalanceManager;

    // The time the current fee period began.
    uint public feePeriodStartTime = 2;
    // The actual start of the last fee period (seconds).
    // This fee period can be initially set to any value
    //   0 < val < now, as everyone's individual lastTransferTime will be 0
    //   and as such, their lastAvgBal will be set to that value
    //   apart from the contract, which will have totalSupply
    uint public lastFeePeriodStartTime = 1;

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

    Nomin public nomin;
    HavvenEscrow public escrow;

    address public oracle;
    uint public havPrice;
    uint public lastHavPriceUpdateTime;
    uint public havPriceStalePeriod = 60 minutes;
    uint public CMax = 5 * UNIT / 100;
    uint public MAX_C_MAX = UNIT;

    mapping(address => bool) public whitelistedIssuers;
    mapping(address => uint) public issuedNomins;

    /* ========== CONSTRUCTOR ========== */

    function Havven(TokenState initialState, address _owner, address _oracle)
        ExternStateToken("Havven", "HAV", 1e8 * UNIT, address(this), initialState, _owner)
        SelfDestructible(_owner, _owner)
        // Owned is initialised in ExternStateToken
        public
    {
        oracle = _oracle;
        feePeriodStartTime = now;
        lastFeePeriodStartTime = now - targetFeePeriodDurationSeconds;
    }

    /* ========== SETTERS ========== */

    function setNomin(Nomin _nomin)
        external
        onlyOwner
    {
        nomin = _nomin;
    }

    function setEscrow(HavvenEscrow _escrow)
        external
        onlyOwner
    {
        escrow = _escrow;
    }

    function setTargetFeePeriodDuration(uint duration)
        external
        postCheckFeePeriodRollover
        onlyOwner
    {
        require(MIN_FEE_PERIOD_DURATION_SECONDS <= duration &&
                duration <= MAX_FEE_PERIOD_DURATION_SECONDS);
        targetFeePeriodDurationSeconds = duration;
        emit FeePeriodDurationUpdated(duration);
    }

    function setOracle(address _oracle)
        external
        onlyOwner
    {
        oracle = _oracle;
        emit OracleUpdated(_oracle);
    }

    function setCMax(uint _CMax)
        external
        onlyOwner
    {
        require(_CMax <= MAX_C_MAX);
        CMax = _CMax;
    }

    function setWhitelisted(address account, bool value)
        external
        onlyOwner
    {
        whitelistedIssuers[account] = value;
    }

    function currentHavvenBalanceSum(address account)
        external
        view
        returns (uint)
    {
        return havvenBalanceManager[account].currentBalanceSum;
    }

    function lastAverageHavvenBalance(address account)
        external
        view
        returns (uint)
    {
        return havvenBalanceManager[account].lastAverageBalance;
    }

    function lastHavvenTransferTimestamp(address account)
        external
        view
        returns (uint)
    {
        return havvenBalanceManager[account].lastTransferTimestamp;
    }

    function currentIssuedNominBalanceSum(address account)
        external
        view
        returns (uint)
    {
        return issuedNominBalanceManager[account].currentBalanceSum;
    }

    function lastAverageIssuedNominBalance(address account)
        external
        view
        returns (uint)
    {
        return issuedNominBalanceManager[account].lastAverageBalance;
    }

    function lastIssuedNominTransferTimestamp(address account)
        external
        view
        returns (uint)
    {
        return issuedNominBalanceManager[account].lastTransferTimestamp;
    }


    /* ========== MUTATIVE FUNCTIONS ========== */

    function endow(address to, uint value)
        external
        onlyOwner
    {
        // Use "this" in order to ensure that the havven contract is the sender.
        this.transfer(to, value);
    }


    function transfer(address to, uint value)
        public
        preCheckFeePeriodRollover
        returns (bool)
    {

        uint senderPreBalance = state.balanceOf(msg.sender);
        uint recipientPreBalance = state.balanceOf(to);

        // Perform the transfer: if there is a problem,
        // an exception will be thrown in this call.
        super.transfer(to, value);

        // Zero-value transfers still update fee entitlement information,
        // and may roll over the fee period.
        adjustHavvenBalanceAverages(msg.sender, senderPreBalance);
        adjustHavvenBalanceAverages(to, recipientPreBalance);

        return true;
    }

    /* Override ERC20 transferFrom function in order to perform
     * fee entitlement recomputation whenever balances are updated. */
    function transferFrom(address from, address to, uint value)
        public
        preCheckFeePeriodRollover
        returns (bool)
    {
        uint senderPreBalance = state.balanceOf(from);
        uint recipientPreBalance = state.balanceOf(to);

        // Perform the transfer: if there is a problem,
        // an exception will be thrown in this call.
        super.transferFrom(from, to, value);

        // Zero-value transfers still update fee entitlement information,
        // and may roll over the fee period.
        adjustHavvenBalanceAverages(from, senderPreBalance);
        adjustHavvenBalanceAverages(to, recipientPreBalance);

        return true;
    }

    /* Compute the last period's fee entitlement for the message sender
     * and then deposit it into their nomin account. */
    function withdrawFeeEntitlement()
        public
        preCheckFeePeriodRollover
    {
        // Do not deposit fees into frozen accounts.
        require(!nomin.frozen(msg.sender));

        // check the period has rolled over first
        BalanceManager memory updatedBalances = rolloverBalances(msg.sender, issuedNomins[msg.sender], issuedNominBalanceManager[msg.sender]);

        // Only allow accounts to withdraw fees once per period.
        require(!hasWithdrawnLastPeriodFees[msg.sender]);

        uint feesOwed;


        feesOwed = safeDiv_dec(safeMul_dec(safeAdd(feesOwed, updatedBalances.lastAverageBalance), lastFeesCollected), totalSupply);

        hasWithdrawnLastPeriodFees[msg.sender] = true;
        if (feesOwed != 0) {
            nomin.withdrawFee(msg.sender, feesOwed);
            emit FeesWithdrawn(msg.sender, msg.sender, feesOwed);
        }

        issuedNominBalanceManager[msg.sender] = updatedBalances;
    }

    /* Update the fee entitlement since the last transfer or entitlement
     * adjustment. Since this updates the last transfer timestamp, if invoked
     * consecutively, this function will do nothing after the first call. */
    function adjustHavvenBalanceAverages(address account, uint preBalance)
        internal
    {
        // The time since the last transfer clamps at the last fee rollover time if the last transfer
        // was earlier than that.
        BalanceManager memory updatedBalances = rolloverBalances(account, preBalance, havvenBalanceManager[account]);

        updatedBalances.currentBalanceSum = safeAdd(
            updatedBalances.currentBalanceSum,
            safeMul(preBalance, now - updatedBalances.lastTransferTimestamp)
        );

        // Update the last time this user's balance changed.
        updatedBalances.lastTransferTimestamp = now;

        havvenBalanceManager[account] = updatedBalances;
    }

    function adjustIssuanceBalanceAverages(address account, uint preBalance)
        internal
    {
        BalanceManager memory updatedBalances = rolloverBalances(account, preBalance, issuedNominBalanceManager[account]);

        updatedBalances.currentBalanceSum = safeAdd(
            updatedBalances.currentBalanceSum,
            safeMul(preBalance, now - updatedBalances.lastTransferTimestamp)
        );

        updatedBalances.lastTransferTimestamp = now;

        issuedNominBalanceManager[account] = updatedBalances;
    }


    function rolloverBalances(address account, uint preBalance, BalanceManager balanceInfo)
        internal
        returns (BalanceManager)
    {

        uint currentBalanceSum = balanceInfo.currentBalanceSum;
        uint lastAvgBal = balanceInfo.lastAverageBalance;
        uint lastTransferTime = balanceInfo.lastTransferTimestamp;

        if (lastTransferTime < feePeriodStartTime) {
            if (lastTransferTime < lastFeePeriodStartTime) {
                // The balance did nothing in the last fee period, so the average balance
                // in this period is their pre-transfer balance.
                lastAvgBal = preBalance;
            } else {
                // No overflow risk here: the failed guard implies (lastFeePeriodStartTime <= lastTransferTime).
                lastAvgBal = safeDiv(
                    safeAdd(currentBalanceSum, safeMul(preBalance, (feePeriodStartTime - lastTransferTime))),
                    (feePeriodStartTime - lastFeePeriodStartTime)
                );
            }
            // Roll over to the next fee period.
            currentBalanceSum = 0;
            lastTransferTime = feePeriodStartTime;
        }

        return BalanceManager(currentBalanceSum, lastAvgBal, lastTransferTime);
    }


    /* Recompute and return the given account's average balance information.
     * This also rolls over the fee period if necessary, and brings
     * the account's current balance sum up to date. */
    function _recomputeAccountLastAverageBalance(address account)
        internal
        preCheckFeePeriodRollover
        returns (uint)
    {
        adjustHavvenBalanceAverages(account, state.balanceOf(account));
        return havvenBalanceManager[account].lastAverageBalance;
    }

    /* Recompute and return the given account's average balance information. */
    function recomputeAccountLastHavvenAverageBalance(address account)
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

    function checkFeePeriodRollover()
        internal
    {
        // If the fee period has rolled over...
        if (now >= feePeriodStartTime + targetFeePeriodDurationSeconds) {
            lastFeesCollected = nomin.feePool();

            // Shift the three period start times back one place
            lastFeePeriodStartTime = feePeriodStartTime;
            feePeriodStartTime = now;
            
            emit FeePeriodRollover(now);
        }
    }

    /* ========== HAV PRICE ========== */

    /* Havvens that are not escrowed */
    function availableHavvens(address account)
        public
        view
        returns (uint)
    {
        uint bal = state.balanceOf(account);
        uint bal_val = havValue(bal);
        uint issued_nom = issuedNomins[account];
        return 0;
    }

    function maxIssuanceRights(address issuer)
        view
        public
        onlyWhitelistedIssuers(issuer)
        havPriceNotStale
        returns (uint)
    {
        if (escrow != HavvenEscrow(0)) {
            return safeMul_dec(havValue(safeAdd(balanceOf(issuer), escrow.totalVestedAccountBalance(msg.sender))), CMax);
        } else {
            return safeMul_dec(havValue(balanceOf(issuer)), CMax);
        }
    }

    function remainingIssuanceRights(address issuer)
        view
        public
        onlyWhitelistedIssuers(issuer)
        havPriceNotStale
        returns (uint)
    {
        uint issued = issuedNomins[issuer];
        uint max = maxIssuanceRights(issuer);
        if (issued > max) {
            return 0;
        } else {
            return maxIssuanceRights(issuer) - issuedNomins[issuer];
        }
    }

    // Issue nomins for a whitelisted account
    function issueNomins(uint amount)
        onlyWhitelistedIssuers(msg.sender)
        havPriceNotStale
        external
    {
        require(amount <= remainingIssuanceRights(msg.sender));
        uint issued = issuedNomins[msg.sender];
        nomin.issue(msg.sender, amount);
        adjustIssuanceBalanceAverages(msg.sender, issued);
    }

    function burnNomins(uint amount)
        // it doesn't matter if the price is stale/user is whitelisted
        external
    {
        require(amount <= issuedNomins[msg.sender]);
        // nomin.burn does safeSub on balance (so revert if not enough nomins)
        uint issued = issuedNomins[msg.sender];
        nomin.burn(msg.sender, amount);
        adjustIssuanceBalanceAverages(msg.sender, issued);
    }

    // Value in USD for a given amount of HAV
    function havValue(uint havWei)
        public
        view
        havPriceNotStale
        returns (uint)
    {
        return safeMul_dec(havWei, havPrice);
    }

    function updatePrice(uint price, uint timeSent)
        external
    {
        // Should be callable only by the oracle.
        require(msg.sender == oracle);
        // Must be the most recently sent price, but not too far in the future.
        // (so we can't lock ourselves out of updating the oracle for longer than this)
        require(lastHavPriceUpdateTime < timeSent && timeSent < now + 10 minutes);

        havPrice = price;
        lastHavPriceUpdateTime = timeSent;
        emit PriceUpdated(price);
    }

    function havPriceIsStale()
        public
        view
        returns (bool)
    {
        return safeAdd(lastHavPriceUpdateTime, havPriceStalePeriod) < now;
    }

    modifier havPriceNotStale
    {
        require(!havPriceIsStale());
        _;
    }
    /* ========== MODIFIERS ========== */

    /* If the fee period has rolled over, then
     * save the start times of the last fee period,
     */
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

    modifier onlyWhitelistedIssuers(address account)
    {
        require(whitelistedIssuers[account]);
        _;
    }

    /* ========== EVENTS ========== */

    event PriceUpdated(uint price);

    event FeePeriodRollover(uint timestamp);

    event FeePeriodDurationUpdated(uint duration);

    event FeesWithdrawn(address account, address indexed accountIndex, uint value);

    event OracleUpdated(address new_oracle);
}
