/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       Havven.sol
version:    1.2
author:     Anton Jurisevic
            Dominic Romanowski

date:       2018-05-15

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

Havven token contract. Havvens are transferable ERC20 tokens,
and also give their holders the following privileges.
An owner of havvens may participate in nomin confiscation votes, they
may also have the right to issue nomins at the discretion of the
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
This occurs when issuing or burning for issued nomin balances,
and when transferring for havven balances. This is for efficiency,
and adds an implicit friction to interacting with havvens.
A havven holder pays for his own recomputation whenever he wants to change
his position, which saves the foundation having to maintain a pot dedicated
to resourcing this.

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
  - Update the last transfer time to n

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
those that have been nominated by the havven foundation. Nomins are assumed
to be valued at $1, as they are a stable unit of account.

All nomins issued require a proportional value of havvens to be locked,
where the proportion is governed by the current issuance ratio. This
means for every $1 of Havvens locked up, $(issuanceRatio) nomins can be issued.
i.e. to issue 100 nomins, 100/issuanceRatio dollars of havvens need to be locked up.

To determine the value of some amount of havvens(H), an oracle is used to push
the price of havvens (P_H) in dollars to the contract. The value of H
would then be: H * P_H.

Any havvens that are locked up by this issuance process cannot be transferred.
The amount that is locked floats based on the price of havvens. If the price
of havvens moves up, less havvens are locked, so they can be issued against,
or transferred freely. If the price of havvens moves down, more havvens are locked,
even going above the initial wallet balance.

-----------------------------------------------------------------
*/

pragma solidity 0.4.24;


import "contracts/ExternStateToken.sol";
import "contracts/Nomin.sol";
import "contracts/HavvenEscrow.sol";
import "contracts/TokenState.sol";


/**
 * @title Havven ERC20 contract.
 * @notice The Havven contracts does not only facilitate transfers and track balances,
 * but it also computes the quantity of fees each havven holder is entitled to.
 */
contract Havven is ExternStateToken {

    /* ========== STATE VARIABLES ========== */

    /* A struct for handing values associated with average balance calculations */
    struct IssuanceData {
        /* Sums of balances*duration in the current fee period.
        /* range: decimals; units: havven-seconds */
        uint currentBalanceSum;
        /* The last period's average balance */
        uint lastAverageBalance;
        /* The last time the data was calculated */
        uint lastModified;
    }

    /* Issued nomin balances for individual fee entitlements */
    mapping(address => IssuanceData) public issuanceData;
    /* The total number of issued nomins for determining fee entitlements */
    IssuanceData public totalIssuanceData;

    /* The time the current fee period began */
    uint public feePeriodStartTime;
    /* The time the last fee period began */
    uint public lastFeePeriodStartTime;

    /* Fee periods will roll over in no shorter a time than this. 
     * The fee period cannot actually roll over until a fee-relevant
     * operation such as withdrawal or a fee period duration update occurs,
     * so this is just a target, and the actual duration may be slightly longer. */
    uint public feePeriodDuration = 4 weeks;
    /* ...and must target between 1 day and six months. */
    uint constant MIN_FEE_PERIOD_DURATION = 1 days;
    uint constant MAX_FEE_PERIOD_DURATION = 26 weeks;

    /* The quantity of nomins that were in the fee pot at the time */
    /* of the last fee rollover, at feePeriodStartTime. */
    uint public lastFeesCollected;

    /* Whether a user has withdrawn their last fees */
    mapping(address => bool) public hasWithdrawnFees;

    Nomin public nomin;
    HavvenEscrow public escrow;

    /* The address of the oracle which pushes the havven price to this contract */
    address public oracle;
    /* The price of havvens written in UNIT */
    uint public price;
    /* The time the havven price was last updated */
    uint public lastPriceUpdateTime;
    /* How long will the contract assume the price of havvens is correct */
    uint public priceStalePeriod = 3 hours;

    /* A quantity of nomins greater than this ratio
     * may not be issued against a given value of havvens. */
    uint public issuanceRatio = UNIT / 5;
    /* No more nomins may be issued than the value of havvens backing them. */
    uint constant MAX_ISSUANCE_RATIO = UNIT;

    /* Whether the address can issue nomins or not. */
    mapping(address => bool) public isIssuer;
    /* The number of currently-outstanding nomins the user has issued. */
    mapping(address => uint) public nominsIssued;

    uint constant HAVVEN_SUPPLY = 1e8 * UNIT;
    uint constant ORACLE_FUTURE_LIMIT = 10 minutes;
    string constant TOKEN_NAME = "Havven";
    string constant TOKEN_SYMBOL = "HAV";
    
    /* ========== CONSTRUCTOR ========== */

    /**
     * @dev Constructor
     * @param _tokenState A pre-populated contract containing token balances.
     * If the provided address is 0x0, then a fresh one will be constructed with the contract owning all tokens.
     * @param _owner The owner of this contract.
     */
    constructor(address _proxy, TokenState _tokenState, address _owner, address _oracle,
                uint _price, address[] _issuers, Havven _oldHavven)
        ExternStateToken(_proxy, _tokenState, TOKEN_NAME, TOKEN_SYMBOL, HAVVEN_SUPPLY, _owner)
        public
    {
        oracle = _oracle;
        price = _price;
        lastPriceUpdateTime = now;

        uint i;
        if (_oldHavven == address(0)) {
            feePeriodStartTime = now;
            lastFeePeriodStartTime = now - feePeriodDuration;
            for (i = 0; i < _issuers.length; i++) {
                isIssuer[_issuers[i]] = true;
            }
        } else {
            feePeriodStartTime = _oldHavven.feePeriodStartTime();
            lastFeePeriodStartTime = _oldHavven.lastFeePeriodStartTime();

            uint cbs;
            uint lab;
            uint lm;
            (cbs, lab, lm) = _oldHavven.totalIssuanceData();
            totalIssuanceData.currentBalanceSum = cbs;
            totalIssuanceData.lastAverageBalance = lab;
            totalIssuanceData.lastModified = lm;

            for (i = 0; i < _issuers.length; i++) {
                address issuer = _issuers[i];
                isIssuer[issuer] = true;
                uint nomins = _oldHavven.nominsIssued(issuer);
                if (nomins == 0) {
                    // It is not valid in general to skip those with no currently-issued nomins.
                    // But for this release, issuers with nonzero issuanceData have current issuance.
                    continue;
                }
                (cbs, lab, lm) = _oldHavven.issuanceData(issuer);
                nominsIssued[issuer] = nomins;
                issuanceData[issuer].currentBalanceSum = cbs;
                issuanceData[issuer].lastAverageBalance = lab;
                issuanceData[issuer].lastModified = lm;
            }
        }

    }

    /* ========== SETTERS ========== */

    /**
     * @notice Set the associated Nomin contract to collect fees from.
     * @dev Only the contract owner may call this.
     */
    function setNomin(Nomin _nomin)
        external
        optionalProxy_onlyOwner
    {
        nomin = _nomin;
        emitNominUpdated(_nomin);
    }

    /**
     * @notice Set the associated havven escrow contract.
     * @dev Only the contract owner may call this.
     */
    function setEscrow(HavvenEscrow _escrow)
        external
        optionalProxy_onlyOwner
    {
        escrow = _escrow;
        emitEscrowUpdated(_escrow);
    }

    /**
     * @notice Set the targeted fee period duration.
     * @dev Only callable by the contract owner. The duration must fall within
     * acceptable bounds (1 day to 26 weeks). Upon resetting this the fee period
     * may roll over if the target duration was shortened sufficiently.
     */
    function setFeePeriodDuration(uint duration)
        external
        optionalProxy_onlyOwner
    {
        require(MIN_FEE_PERIOD_DURATION <= duration && duration <= MAX_FEE_PERIOD_DURATION,
            "Duration must be between MIN_FEE_PERIOD_DURATION and MAX_FEE_PERIOD_DURATION");
        feePeriodDuration = duration;
        emitFeePeriodDurationUpdated(duration);
        rolloverFeePeriodIfElapsed();
    }

    /**
     * @notice Set the Oracle that pushes the havven price to this contract
     */
    function setOracle(address _oracle)
        external
        optionalProxy_onlyOwner
    {
        oracle = _oracle;
        emitOracleUpdated(_oracle);
    }

    /**
     * @notice Set the stale period on the updated havven price
     * @dev No max/minimum, as changing it wont influence anything but issuance by the foundation
     */
    function setPriceStalePeriod(uint time)
        external
        optionalProxy_onlyOwner
    {
        priceStalePeriod = time;
    }

    /**
     * @notice Set the issuanceRatio for issuance calculations.
     * @dev Only callable by the contract owner.
     */
    function setIssuanceRatio(uint _issuanceRatio)
        external
        optionalProxy_onlyOwner
    {
        require(_issuanceRatio <= MAX_ISSUANCE_RATIO, "New issuance ratio must be less than or equal to MAX_ISSUANCE_RATIO");
        issuanceRatio = _issuanceRatio;
        emitIssuanceRatioUpdated(_issuanceRatio);
    }

    /**
     * @notice Set whether the specified can issue nomins or not.
     */
    function setIssuer(address account, bool value)
        external
        optionalProxy_onlyOwner
    {
        isIssuer[account] = value;
        emitIssuersUpdated(account, value);
    }

    /* ========== VIEWS ========== */

    function issuanceCurrentBalanceSum(address account)
        external
        view
        returns (uint)
    {
        return issuanceData[account].currentBalanceSum;
    }

    function issuanceLastAverageBalance(address account)
        external
        view
        returns (uint)
    {
        return issuanceData[account].lastAverageBalance;
    }

    function issuanceLastModified(address account)
        external
        view
        returns (uint)
    {
        return issuanceData[account].lastModified;
    }

    function totalIssuanceCurrentBalanceSum()
        external
        view
        returns (uint)
    {
        return totalIssuanceData.currentBalanceSum;
    }

    function totalIssuanceLastAverageBalance()
        external
        view
        returns (uint)
    {
        return totalIssuanceData.lastAverageBalance;
    }

    function totalIssuanceLastModified()
        external
        view
        returns (uint)
    {
        return totalIssuanceData.lastModified;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /**
     * @notice ERC20 transfer function.
     */
    function transfer(address to, uint value)
        public
        optionalProxy
        returns (bool)
    {
        address sender = messageSender;
        require(nominsIssued[sender] == 0 || value <= transferableHavvens(sender), "Value to transfer exceeds available havvens");
        /* Perform the transfer: if there is a problem,
         * an exception will be thrown in this call. */
        _transfer_byProxy(sender, to, value);

        return true;
    }

    /**
     * @notice ERC20 transferFrom function.
     */
    function transferFrom(address from, address to, uint value)
        public
        optionalProxy
        returns (bool)
    {
        address sender = messageSender;
        require(nominsIssued[from] == 0 || value <= transferableHavvens(from), "Value to transfer exceeds available havvens");
        /* Perform the transfer: if there is a problem,
         * an exception will be thrown in this call. */
        _transferFrom_byProxy(sender, from, to, value);

        return true;
    }

    /**
     * @notice Compute the last period's fee entitlement for the message sender
     * and then deposit it into their nomin account.
     */
    function withdrawFees()
        external
        optionalProxy
    {
        address sender = messageSender;
        rolloverFeePeriodIfElapsed();
        /* Do not deposit fees into frozen accounts. */
        require(!nomin.frozen(sender), "Cannot deposit fees into frozen accounts");

        /* Check the period has rolled over first. */
        updateIssuanceData(sender, nominsIssued[sender], nomin.totalSupply());

        /* Only allow accounts to withdraw fees once per period. */
        require(!hasWithdrawnFees[sender], "Fees have already been withdrawn in this period");

        uint feesOwed;
        uint lastTotalIssued = totalIssuanceData.lastAverageBalance;

        if (lastTotalIssued > 0) {
            /* Sender receives a share of last period's collected fees proportional
             * with their average fraction of the last period's issued nomins. */
            feesOwed = safeDiv_dec(
                safeMul_dec(issuanceData[sender].lastAverageBalance, lastFeesCollected),
                lastTotalIssued
            );
        }

        hasWithdrawnFees[sender] = true;

        if (feesOwed != 0) {
            nomin.withdrawFees(sender, feesOwed);
        }
        emitFeesWithdrawn(messageSender, feesOwed);
    }

    /**
     * @notice Update the havven balance averages since the last transfer
     * or entitlement adjustment.
     * @dev Since this updates the last transfer timestamp, if invoked
     * consecutively, this function will do nothing after the first call.
     * Also, this will adjust the total issuance at the same time.
     */
    function updateIssuanceData(address account, uint preBalance, uint lastTotalSupply)
        internal
    {
        /* update the total balances first */
        totalIssuanceData = computeIssuanceData(lastTotalSupply, totalIssuanceData);

        if (issuanceData[account].lastModified < feePeriodStartTime) {
            hasWithdrawnFees[account] = false;
        }

        issuanceData[account] = computeIssuanceData(preBalance, issuanceData[account]);
    }


    /**
     * @notice Compute the new IssuanceData on the old balance
     */
    function computeIssuanceData(uint preBalance, IssuanceData preIssuance)
        internal
        view
        returns (IssuanceData)
    {

        uint currentBalanceSum = preIssuance.currentBalanceSum;
        uint lastAverageBalance = preIssuance.lastAverageBalance;
        uint lastModified = preIssuance.lastModified;

        if (lastModified < feePeriodStartTime) {
            if (lastModified < lastFeePeriodStartTime) {
                /* The balance was last updated before the previous fee period, so the average
                 * balance in this period is their pre-transfer balance. */
                lastAverageBalance = preBalance;
            } else {
                /* The balance was last updated during the previous fee period. */
                /* No overflow or zero denominator problems, since lastFeePeriodStartTime < feePeriodStartTime < lastModified. 
                 * implies these quantities are strictly positive. */
                uint timeUpToRollover = feePeriodStartTime - lastModified;
                uint lastFeePeriodDuration = feePeriodStartTime - lastFeePeriodStartTime;
                uint lastBalanceSum = safeAdd(currentBalanceSum, safeMul(preBalance, timeUpToRollover));
                lastAverageBalance = lastBalanceSum / lastFeePeriodDuration;
            }
            /* Roll over to the next fee period. */
            currentBalanceSum = safeMul(preBalance, now - feePeriodStartTime);
        } else {
            /* The balance was last updated during the current fee period. */
            currentBalanceSum = safeAdd(
                currentBalanceSum,
                safeMul(preBalance, now - lastModified)
            );
        }

        return IssuanceData(currentBalanceSum, lastAverageBalance, now);
    }

    /**
     * @notice Recompute and return the given account's last average balance.
     */
    function recomputeLastAverageBalance(address account)
        external
        returns (uint)
    {
        updateIssuanceData(account, nominsIssued[account], nomin.totalSupply());
        return issuanceData[account].lastAverageBalance;
    }

    /**
     * @notice Issue nomins against the sender's havvens.
     * @dev Issuance is only allowed if the havven price isn't stale and the sender is an issuer.
     */
    function issueNomins(uint amount)
        public
        optionalProxy
        requireIssuer(messageSender)
        /* No need to check if price is stale, as it is checked in issuableNomins. */
    {
        address sender = messageSender;
        require(amount <= remainingIssuableNomins(sender), "Amount must be less than or equal to remaining issuable nomins");
        uint lastTot = nomin.totalSupply();
        uint preIssued = nominsIssued[sender];
        nomin.issue(sender, amount);
        nominsIssued[sender] = safeAdd(preIssued, amount);
        updateIssuanceData(sender, preIssued, lastTot);
    }

    function issueMaxNomins()
        external
        optionalProxy
    {
        issueNomins(remainingIssuableNomins(messageSender));
    }

    /**
     * @notice Burn nomins to clear issued nomins/free havvens.
     */
    function burnNomins(uint amount)
        /* it doesn't matter if the price is stale or if the user is an issuer, as non-issuers have issued no nomins.*/
        external
        optionalProxy
    {
        address sender = messageSender;

        uint lastTot = nomin.totalSupply();
        uint preIssued = nominsIssued[sender];
        /* nomin.burn does a safeSub on balance (so it will revert if there are not enough nomins). */
        nomin.burn(sender, amount);
        /* This safe sub ensures amount <= number issued */
        nominsIssued[sender] = safeSub(preIssued, amount);
        updateIssuanceData(sender, preIssued, lastTot);
    }

    /**
     * @notice Check if the fee period has rolled over. If it has, set the new fee period start
     * time, and record the fees collected in the nomin contract.
     */
    function rolloverFeePeriodIfElapsed()
        public
    {
        /* If the fee period has rolled over... */
        if (now >= feePeriodStartTime + feePeriodDuration) {
            lastFeesCollected = nomin.feePool();
            lastFeePeriodStartTime = feePeriodStartTime;
            feePeriodStartTime = now;
            emitFeePeriodRollover(now);
        }
    }

    /* ========== Issuance/Burning ========== */

    /**
     * @notice The maximum nomins an issuer can issue against their total havven quantity. This ignores any
     * already issued nomins.
     */
    function maxIssuableNomins(address issuer)
        view
        public
        priceNotStale
        returns (uint)
    {
        if (!isIssuer[issuer]) {
            return 0;
        }
        if (escrow != HavvenEscrow(0)) {
            uint totalOwnedHavvens = safeAdd(tokenState.balanceOf(issuer), escrow.balanceOf(issuer));
            return safeMul_dec(HAVtoUSD(totalOwnedHavvens), issuanceRatio);
        } else {
            return safeMul_dec(HAVtoUSD(tokenState.balanceOf(issuer)), issuanceRatio);
        }
    }

    /**
     * @notice The remaining nomins an issuer can issue against their total havven quantity.
     */
    function remainingIssuableNomins(address issuer)
        view
        public
        returns (uint)
    {
        uint issued = nominsIssued[issuer];
        uint max = maxIssuableNomins(issuer);
        if (issued > max) {
            return 0;
        } else {
            return safeSub(max, issued);
        }
    }

    /**
     * @notice The total havvens owned by this account, both escrowed and unescrowed,
     * against which nomins can be issued.
     * This includes those already being used as collateral (locked), and those
     * available for further issuance (unlocked).
     */
    function collateral(address account)
        public
        view
        returns (uint)
    {
        uint bal = tokenState.balanceOf(account);
        if (escrow != address(0)) {
            bal = safeAdd(bal, escrow.balanceOf(account));
        }
        return bal;
    }

    /**
     * @notice The collateral that would be locked by issuance, which can exceed the account's actual collateral.
     */
    function issuanceDraft(address account)
        public
        view
        returns (uint)
    {
        uint issued = nominsIssued[account];
        if (issued == 0) {
            return 0;
        }
        return USDtoHAV(safeDiv_dec(issued, issuanceRatio));
    }

    /**
     * @notice Collateral that has been locked due to issuance, and cannot be
     * transferred to other addresses. This is capped at the account's total collateral.
     */
    function lockedCollateral(address account)
        public
        view
        returns (uint)
    {
        uint debt = issuanceDraft(account);
        uint collat = collateral(account);
        if (debt > collat) {
            return collat;
        }
        return debt;
    }

    /**
     * @notice Collateral that is not locked and available for issuance.
     */
    function unlockedCollateral(address account)
        public
        view
        returns (uint)
    {
        uint locked = lockedCollateral(account);
        uint collat = collateral(account);
        return safeSub(collat, locked);
    }

    /**
     * @notice The number of havvens that are free to be transferred by an account.
     * @dev If they have enough available Havvens, it could be that
     * their havvens are escrowed, however the transfer would then
     * fail. This means that escrowed havvens are locked first,
     * and then the actual transferable ones.
     */
    function transferableHavvens(address account)
        public
        view
        returns (uint)
    {
        uint draft = issuanceDraft(account);
        uint collat = collateral(account);
        // In the case where the issuanceDraft exceeds the collateral, nothing is free
        if (draft > collat) {
            return 0;
        }

        uint bal = balanceOf(account);
        // In the case where the draft exceeds the escrow, but not the whole collateral
        //   return the fraction of the balance that remains free
        if (draft > safeSub(collat, bal)) {
            return safeSub(collat, draft);
        }
        // In the case where the draft doesn't exceed the escrow, return the entire balance
        return bal;
    }

    /**
     * @notice The value in USD for a given amount of HAV
     */
    function HAVtoUSD(uint hav_dec)
        public
        view
        priceNotStale
        returns (uint)
    {
        return safeMul_dec(hav_dec, price);
    }

    /**
     * @notice The value in HAV for a given amount of USD
     */
    function USDtoHAV(uint usd_dec)
        public
        view
        priceNotStale
        returns (uint)
    {
        return safeDiv_dec(usd_dec, price);
    }

    /**
     * @notice Access point for the oracle to update the price of havvens.
     */
    function updatePrice(uint newPrice, uint timeSent)
        external
        onlyOracle  /* Should be callable only by the oracle. */
    {
        /* Must be the most recently sent price, but not too far in the future.
         * (so we can't lock ourselves out of updating the oracle for longer than this) */
        require(lastPriceUpdateTime < timeSent && timeSent < now + ORACLE_FUTURE_LIMIT,
            "Time sent must be bigger than the last update, and must be less than now + ORACLE_FUTURE_LIMIT");

        price = newPrice;
        lastPriceUpdateTime = timeSent;
        emitPriceUpdated(newPrice, timeSent);

        /* Check the fee period rollover within this as the price should be pushed every 15min. */
        rolloverFeePeriodIfElapsed();
    }

    /**
     * @notice Check if the price of havvens hasn't been updated for longer than the stale period.
     */
    function priceIsStale()
        public
        view
        returns (bool)
    {
        return safeAdd(lastPriceUpdateTime, priceStalePeriod) < now;
    }

    /* ========== MODIFIERS ========== */

    modifier requireIssuer(address account)
    {
        require(isIssuer[account], "Must be issuer to perform this action");
        _;
    }

    modifier onlyOracle
    {
        require(msg.sender == oracle, "Must be oracle to perform this action");
        _;
    }

    modifier priceNotStale
    {
        require(!priceIsStale(), "Price must not be stale to perform this action");
        _;
    }

    /* ========== EVENTS ========== */

    event PriceUpdated(uint newPrice, uint timestamp);
    bytes32 constant PRICEUPDATED_SIG = keccak256("PriceUpdated(uint256,uint256)");
    function emitPriceUpdated(uint newPrice, uint timestamp) internal {
        proxy._emit(abi.encode(newPrice, timestamp), 1, PRICEUPDATED_SIG, 0, 0, 0);
    }

    event IssuanceRatioUpdated(uint newRatio);
    bytes32 constant ISSUANCERATIOUPDATED_SIG = keccak256("IssuanceRatioUpdated(uint256)");
    function emitIssuanceRatioUpdated(uint newRatio) internal {
        proxy._emit(abi.encode(newRatio), 1, ISSUANCERATIOUPDATED_SIG, 0, 0, 0);
    }

    event FeePeriodRollover(uint timestamp);
    bytes32 constant FEEPERIODROLLOVER_SIG = keccak256("FeePeriodRollover(uint256)");
    function emitFeePeriodRollover(uint timestamp) internal {
        proxy._emit(abi.encode(timestamp), 1, FEEPERIODROLLOVER_SIG, 0, 0, 0);
    } 

    event FeePeriodDurationUpdated(uint duration);
    bytes32 constant FEEPERIODDURATIONUPDATED_SIG = keccak256("FeePeriodDurationUpdated(uint256)");
    function emitFeePeriodDurationUpdated(uint duration) internal {
        proxy._emit(abi.encode(duration), 1, FEEPERIODDURATIONUPDATED_SIG, 0, 0, 0);
    } 

    event FeesWithdrawn(address indexed account, uint value);
    bytes32 constant FEESWITHDRAWN_SIG = keccak256("FeesWithdrawn(address,uint256)");
    function emitFeesWithdrawn(address account, uint value) internal {
        proxy._emit(abi.encode(value), 2, FEESWITHDRAWN_SIG, bytes32(account), 0, 0);
    }

    event OracleUpdated(address newOracle);
    bytes32 constant ORACLEUPDATED_SIG = keccak256("OracleUpdated(address)");
    function emitOracleUpdated(address newOracle) internal {
        proxy._emit(abi.encode(newOracle), 1, ORACLEUPDATED_SIG, 0, 0, 0);
    }

    event NominUpdated(address newNomin);
    bytes32 constant NOMINUPDATED_SIG = keccak256("NominUpdated(address)");
    function emitNominUpdated(address newNomin) internal {
        proxy._emit(abi.encode(newNomin), 1, NOMINUPDATED_SIG, 0, 0, 0);
    }

    event EscrowUpdated(address newEscrow);
    bytes32 constant ESCROWUPDATED_SIG = keccak256("EscrowUpdated(address)");
    function emitEscrowUpdated(address newEscrow) internal {
        proxy._emit(abi.encode(newEscrow), 1, ESCROWUPDATED_SIG, 0, 0, 0);
    }

    event IssuersUpdated(address indexed account, bool indexed value);
    bytes32 constant ISSUERSUPDATED_SIG = keccak256("IssuersUpdated(address,bool)");
    function emitIssuersUpdated(address account, bool value) internal {
        proxy._emit(abi.encode(), 3, ISSUERSUPDATED_SIG, bytes32(account), bytes32(value ? 1 : 0), 0);
    }

}
