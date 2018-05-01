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
An owner of havvens may participate in nomin confiscation votes, they
may also have the right to issue nomins based on the discretion of the
foundation for this version of the contract.

After a fee period terminates, the duration and fees collected for that
period are computed, and the next period begins. Thus an account may only
withdraw the fees owed to them for the previous period, and may only do
so once per period. Any unclaimed fees roll over into the common pot for
the next period.

== Average Balance Calculations ==

The fee entitlement of a havven holder is proportional to their average
issued nomin balance over the last fee period. This is computed by
measuring the area under the graph of a user's issued nomin balance over
time, and then when a new fee period begins, dividing through by the
duration of the fee period.

We need only update values when the balances of an account is modified.
When issuing or burning for the issued nomin balances and when transferring
for the havven balances. This is for efficiency, and adds an implicit
friction to interacting with havvens. A havven holder pays for his own
recomputation whenever he wants to change his position, which saves the
foundation having to maintain a pot dedicated to resourcing this.

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

== Issuance and Burning ==

In this version of the havven contract, nomins can only be issued by
those that have been whitelisted by the havven foundation. Nomins are assumed
to be valued at $1, as they are a stable unit of account.

All nomins issued require some value of havvens to be locked up for the
proportional to the value of CMax (The collateralisation ratio). This
means for every $1 of Havvens locked up, $(CMax) nomins can be issued.
i.e. to issue 100 nomins, 100/CMax dollars of havvens need to be locked up.

To determine the value of some amount of havvens, an oracle is used to push
the price of havvens in dollars to the contract. The value of some amount of
havvens would then be: H * p_H.

Any havvens that are locked up by this issuance process cannot be transferred.
The amount that is locked floats based on the price of havvens. If the price
of havvens moves up, less havvens are locked, so they can be issued against,
or transferred freely. If the price of havvens moves down, more havvens are locked,
even going above the initial amount that was locked.

-----------------------------------------------------------------

*/

pragma solidity 0.4.23;


import "contracts/ExternStateToken.sol";
import "contracts/Nomin.sol";
import "contracts/HavvenEscrow.sol";
import "contracts/TokenState.sol";
import "contracts/SelfDestructible.sol";

/**
 * @title Havven ERC20 contract.
 * @notice The Havven contracts does not only facilitate transfers and track balances,
 * but it also computes the quantity of fees each havven holder is entitled to.
 */
contract Havven is ExternStateToken {

    /* ========== STATE VARIABLES ========== */


    // A struct for handing values associated with average balance calculations
    struct BalanceData {
        // Sums of balances*duration in the current fee period.
        // range: decimals; units: havven-seconds
        uint currentBalanceSum;
        // The last period's average balance
        uint lastAverageBalance;
        // The last time the data was calculated
        uint lastTransferTimestamp;
    }

    // Havven balance averages for voting weight
    mapping(address => BalanceData) internal havvenBalanceData;
    // Issued nomin balances for individual fee entitlements
    mapping(address => BalanceData) internal issuedNominBalanceData;
    // The total number of issued nomins for determining fee entitlements
    BalanceData internal totalIssuedNominBalanceData;

    // The time the current fee period began
    uint public feePeriodStartTime;
    // The time the last fee period began
    uint public lastFeePeriodStartTime;

    // Fee periods will roll over in no shorter a time than this
    uint public targetFeePeriodDurationSeconds = 4 weeks;
    // And may not be set to be shorter than a day
    uint constant MIN_FEE_PERIOD_DURATION_SECONDS = 1 days;
    // And may not be set to be longer than six months
    uint constant MAX_FEE_PERIOD_DURATION_SECONDS = 26 weeks;

    // The quantity of nomins that were in the fee pot at the time
    // of the last fee rollover (feePeriodStartTime)
    uint public lastFeesCollected;

    // Whether a user has withdrawn their last fees
    mapping(address => bool) public hasWithdrawnLastPeriodFees;

    Nomin public nomin;
    HavvenEscrow public escrow;

    // The address of the oracle which pushes the havven price to this contract
    address public oracle;
    // The price of havvens written in UNIT
    uint public havPrice;
    // The time the havven price was last updated
    uint public lastHavPriceUpdateTime;
    // How long will the contract assume the price of havvens is correct
    uint public havPriceStalePeriod = 3 hours;

    // The maximal amount that
    uint public CMax = 5 * UNIT / 100;
    uint public MAX_C_MAX = 50 * UNIT / 100;  // TODO: get final value

    // whether the address can issue nomins or not
    mapping(address => bool) public whitelistedIssuers;
    // the number of nomins the user has issued
    mapping(address => uint) public issuedNomins;

    /* ========== CONSTRUCTOR ========== */

    /**
     * @dev Constructor
     * @param initialState A pre-populated contract containing token balances.
     * If the provided address is 0x0, then a fresh one will be constructed with the contract owning all tokens.
     * @param _owner The owner of this contract.
     */
    constructor(TokenState initialState, address _owner, address _oracle)
        ExternStateToken("Havven", "HAV", 1e8 * UNIT, address(this), initialState, _owner)
        // Owned is initialised in ExternStateToken
        public
    {
        oracle = _oracle;
        feePeriodStartTime = now;
        lastFeePeriodStartTime = now - targetFeePeriodDurationSeconds;
    }

    /* ========== SETTERS ========== */

    /**
     * @notice Set the associated Nomin contract to collect fees from.
     * @dev Only the contract owner may call this.
     */
    function setNomin(Nomin _nomin)
        external
        onlyOwner
    {
        nomin = _nomin;
    }

    /**
     * @notice Set the associated havven escrow contract.
     * @dev Only the contract owner may call this.
     */
    function setEscrow(HavvenEscrow _escrow)
        external
        onlyOwner
    {
        escrow = _escrow;
    }

    /**
     * @notice Set the targeted fee period duration.
     * @dev Only callable by the contract owner. The duration must fall within
     * acceptable bounds (1 day to 26 weeks). Upon resetting this the fee period
     * may roll over if the target duration was shortened sufficiently.
     */
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

    /* ========== GETTERS ========== */

    //
    // Havven balance sum data
    //
    function currentHavvenBalanceSum(address account)
        external
        view
        returns (uint)
    {
        return havvenBalanceData[account].currentBalanceSum;
    }

    function lastAverageHavvenBalance(address account)
        external
        view
        returns (uint)
    {
        return havvenBalanceData[account].lastAverageBalance;
    }

    function lastHavvenTransferTimestamp(address account)
        external
        view
        returns (uint)
    {
        return havvenBalanceData[account].lastTransferTimestamp;
    }

    //
    // Issued nomin balance sum data
    //
    function currentIssuedNominBalanceSum(address account)
        external
        view
        returns (uint)
    {
        return issuedNominBalanceData[account].currentBalanceSum;
    }

    function lastAverageIssuedNominBalance(address account)
        external
        view
        returns (uint)
    {
        return issuedNominBalanceData[account].lastAverageBalance;
    }

    function lastIssuedNominTransferTimestamp(address account)
        external
        view
        returns (uint)
    {
        return issuedNominBalanceData[account].lastTransferTimestamp;
    }

    //
    // The total issued nomin balance sum data
    //
    function currentTotalIssuedNominBalanceSum()
        external
        view
        returns (uint)
    {
        return totalIssuedNominBalanceData.currentBalanceSum;
    }

    function lastAverageTotalIssuedNominBalance()
        external
        view
        returns (uint)
    {
        return totalIssuedNominBalanceData.lastAverageBalance;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /**
     * @notice Allow the owner of this contract to endow any address with havvens
     * from the initial supply.
     * @dev Since the entire initial supply resides in the havven contract,
     * this disallows the foundation from withdrawing fees on undistributed balances.
     * This function can also be used to retrieve any havvens sent to the Havven contract itself.S
     * Only callable by the contract owner.
     */
    function endow(address to, uint value)
        external
        onlyOwner
    {
        /* Use "this" in order that the havven account is the sender.
         * The explicit transfer also initialises fee entitlement information. */
        this.transfer(to, value);
    }


    /**
     * @notice ERC20 transfer function.
     */
    function transfer(address to, uint value)
        public
        preCheckFeePeriodRollover
        returns (bool)
    {
        /* If they have enough available Havvens, it could be that
         * their havvens are escrowed, however the transfer would then
         * fail. This means that escrowed havvens are locked first,
         * and then the actual transferable ones. */
        require(value <= availableHavvens(msg.sender));
        uint senderPreBalance = state.balanceOf(msg.sender);
        uint recipientPreBalance = state.balanceOf(to);

        /* Perform the transfer: if there is a problem,
         * an exception will be thrown in this call. */
        super.transfer(to, value);

        /* Zero-value transfers still update fee entitlement information,
         * and may roll over the fee period. */
        adjustHavvenBalanceAverages(msg.sender, senderPreBalance);
        adjustHavvenBalanceAverages(to, recipientPreBalance);

        return true;
    }

    /**
     * @notice ERC20 transferFrom function, which also performs
     * fee entitlement recomputation whenever balances are updated.
     */
    function transferFrom(address from, address to, uint value)
        public
        preCheckFeePeriodRollover
        returns (bool)
    {
        require(value <= availableHavvens(from));
        uint senderPreBalance = state.balanceOf(from);
        uint recipientPreBalance = state.balanceOf(to);

        /* Perform the transfer: if there is a problem,
         * an exception will be thrown in this call. */
        super.transferFrom(from, to, value);

        /* Zero-value transfers still update fee entitlement information,
         * and may roll over the fee period. */
        adjustHavvenBalanceAverages(from, senderPreBalance);
        adjustHavvenBalanceAverages(to, recipientPreBalance);

        return true;
    }

    /**
     * @notice Compute the last period's fee entitlement for the message sender
     * and then deposit it into their nomin account.
     */
    function withdrawFeeEntitlement()
        public
        preCheckFeePeriodRollover
    {
        /* Do not deposit fees into frozen accounts. */
        require(!nomin.frozen(msg.sender));

        /* Check the period has rolled over first. */
        adjustIssuanceBalanceAverages(msg.sender, issuedNomins[msg.sender], nomin.totalSupply());

        BalanceData memory updatedBalances = issuedNominBalanceData[msg.sender];

        /* Only allow accounts to withdraw fees once per period. */
        require(!hasWithdrawnLastPeriodFees[msg.sender]);
        uint feesOwed = 0;
        if (totalIssuedNominBalanceData.lastAverageBalance > 0) {
            feesOwed = safeDiv_dec(safeMul_dec(updatedBalances.lastAverageBalance, lastFeesCollected), totalIssuedNominBalanceData.lastAverageBalance);
        }

        hasWithdrawnLastPeriodFees[msg.sender] = true;

        if (feesOwed != 0) {
            nomin.withdrawFee(msg.sender, feesOwed);
        }
        emit FeesWithdrawn(msg.sender, msg.sender, feesOwed);
    }

    /**
     * @notice Update the fee entitlement since the last transfer or entitlement adjustment.
     * @dev Since this updates the last transfer timestamp, if invoked
     * consecutively, this function will do nothing after the first call.
     */
    function adjustHavvenBalanceAverages(address account, uint preBalance)
        internal
    {
        /* The time since the last transfer clamps at the last fee rollover time
         * if the last transfer was earlier than that. */
        BalanceData memory updatedBalances = rolloverBalances(preBalance, havvenBalanceData[account]);

        updatedBalances.currentBalanceSum = safeAdd(
            updatedBalances.currentBalanceSum,
            safeMul(preBalance, now - updatedBalances.lastTransferTimestamp)
        );

        /* Update the last time this user's balance changed. */
        updatedBalances.lastTransferTimestamp = now;

        havvenBalanceData[account] = updatedBalances;
    }

    function adjustIssuanceBalanceAverages(address account, uint preBalance, uint last_total_supply)
        internal
    {

        adjustTotalIssuanceBalanceAverages(last_total_supply);

        if (issuedNominBalanceData[account].lastTransferTimestamp < feePeriodStartTime) {
            hasWithdrawnLastPeriodFees[account] = false;
        }

        BalanceData memory updatedBalances = rolloverBalances(preBalance, issuedNominBalanceData[account]);

        updatedBalances.currentBalanceSum = safeAdd(
            updatedBalances.currentBalanceSum,
            safeMul(preBalance, now - updatedBalances.lastTransferTimestamp)
        );

        updatedBalances.lastTransferTimestamp = now;
        issuedNominBalanceData[account] = updatedBalances;
    }


    function adjustTotalIssuanceBalanceAverages(uint preBalance)
        internal
    {
        BalanceData memory updatedBalances = rolloverBalances(preBalance, totalIssuedNominBalanceData);

        updatedBalances.currentBalanceSum = safeAdd(
            updatedBalances.currentBalanceSum,
            safeMul(preBalance, now - updatedBalances.lastTransferTimestamp)
        );

        updatedBalances.lastTransferTimestamp = now;
        totalIssuedNominBalanceData = updatedBalances;
    }


    function rolloverBalances(uint preBalance, BalanceData balanceInfo)
        internal
        returns (BalanceData)
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
            /* Roll over to the next fee period. */
            currentBalanceSum = 0;
            lastTransferTime = feePeriodStartTime;
        }

        return BalanceData(currentBalanceSum, lastAvgBal, lastTransferTime);
    }


    /**
     * @dev Recompute and return the given account's average balance information.
     * This also rolls over the fee period if necessary, and brings
     * the account's current balance sum up to date.
     */
    function recomputeAccountLastHavvenAverageBalance(address account)
        public
        preCheckFeePeriodRollover
        returns (uint)
    {
        adjustHavvenBalanceAverages(account, state.balanceOf(account));
        return havvenBalanceData[account].lastAverageBalance;
    }

    /**
     * @notice Recompute and return the given account's average balance information.
     */
    function recomputeAccountLastIssuedNominAverageBalance(address account)
        external
        returns (uint)
    {
        adjustIssuanceBalanceAverages(account, issuedNomins[account], nomin.totalSupply());
        return issuedNominBalanceData[account].lastAverageBalance;
    }

    /**
     * @notice Check if the current fee period has terminated and, if so, roll it over.
     */
    function rolloverFeePeriod()
        public
    {
        checkFeePeriodRollover();
    }

    // Issue nomins for a whitelisted account
    function issueNomins(uint amount)
        onlyWhitelistedIssuers(msg.sender)
        havPriceNotStale
        external
    {
        require(amount <= remainingIssuanceRights(msg.sender));
        uint lastTot = nomin.totalSupply();
        uint issued = issuedNomins[msg.sender];
        nomin.issue(msg.sender, amount);
        issuedNomins[msg.sender] = safeAdd(issued, amount);
        adjustIssuanceBalanceAverages(msg.sender, issued, lastTot);
    }

    function burnNomins(uint amount)
        // it doesn't matter if the price is stale or if the user is whitelisted
        external
    {
        require(amount <= issuedNomins[msg.sender]);
        uint lastTot = nomin.totalSupply();
        uint issued = issuedNomins[msg.sender];
        // nomin.burn does safeSub on balance (so it will revert if there are not enough nomins)
        nomin.burn(msg.sender, amount);
        issuedNomins[msg.sender] = safeSub(issued, amount);
        adjustIssuanceBalanceAverages(msg.sender, issued, lastTot);
    }

    function checkFeePeriodRollover()
        internal
    {
        /* If the fee period has rolled over... */
        if (now >= feePeriodStartTime + targetFeePeriodDurationSeconds) {
            lastFeesCollected = nomin.feePool();
            lastFeePeriodStartTime = feePeriodStartTime;
            feePeriodStartTime = now;
            emit FeePeriodRollover(now);
        }
    }

    /* ========== Issuance/Burning ========== */

    function maxIssuanceRights(address issuer)
        view
        public
        onlyWhitelistedIssuers(issuer)
        havPriceNotStale
        returns (uint)
    {
        if (escrow != HavvenEscrow(0)) {
            return safeMul_dec(HAVtoUSD(safeAdd(balanceOf(issuer), escrow.balanceOf(msg.sender))), CMax);
        } else {
            return safeMul_dec(HAVtoUSD(balanceOf(issuer)), CMax);
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
        if (issued >= max) {
            return 0;
        } else {
            return maxIssuanceRights(issuer) - issuedNomins[issuer];
        }
    }

    /* Havvens that are locked, which can exceed the user's total balance + escrowed */
    function lockedHavvens(address account)
        public
        view
        returns (uint)
    {
        if (issuedNomins[account] == 0) {
            return 0;
        }
        return USDtoHAV(safeDiv_dec(issuedNomins[account], CMax));
    }

    /* Havvens that are not locked, available for issuance */
    function availableHavvens(address account)
        public
        view
        returns (uint)
    {
        uint locked = lockedHavvens(account);
        uint bal = state.balanceOf(account) + escrow.balanceOf(account);
        if (locked > bal) {
            return 0;
        }
        return bal - locked;
    }

    // Value in USD for a given amount of HAV
    function HAVtoUSD(uint hav_dec)
        public
        view
        havPriceNotStale
        returns (uint)
    {
        return safeMul_dec(hav_dec, havPrice);
    }

    // Value in HAV for a given amount of USD
    function USDtoHAV(uint usd_dec)
        public
        view
        havPriceNotStale
        returns (uint)
    {
        return safeDiv_dec(usd_dec, havPrice);
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

    modifier havPriceNotStale
    {
        require(!havPriceIsStale());
        _;
    }


    /* ========== EVENTS ========== */

    event PriceUpdated(uint price);

    event FeePeriodRollover(uint timestamp);

    event FeePeriodDurationUpdated(uint duration);

    event FeesWithdrawn(address account, address indexed accountIndex, uint value);

    event OracleUpdated(address new_oracle);
}
