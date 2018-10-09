/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       Havven.sol
version:    2.0
author:     Kevin Brown
            Anton Jurisevic
            Dominic Romanowski

date:       2018-09-14

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

Havven token contract. Havvens are transferable ERC20 tokens,
and also give their holders the following privileges.
An owner of havvens has the right to issue nomins in all nomin flavours.

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

pragma solidity 0.4.25;


import "./ExternStateToken.sol";
import "./Nomin.sol";
import "./HavvenEscrow.sol";
import "./TokenState.sol";
import "./ExchangeRates.sol";

/*
 * @title Havven ERC20 contract.
 * @notice The Havven contracts not only facilitates transfers, exchanges, and tracks balances,
 * but it also computes the quantity of fees each havven holder is entitled to.
 */
contract Havven is ExternStateToken {

    // ========== STATE VARIABLES ==========

    // A struct for handing values associated with an individual user's debt position
    struct IssuanceData {
        // Percentage of the total debt owned at the time
        // of issuance. This number is modified by the global debt
        // delta array. You can figure out a user's exit price and
        // collateralisation ratio using a combination of their initial
        // debt and the slice of global debt delta which applies to them.
        uint initialDebtOwnership;
        // This lets us know when (in relative terms) the user entered
        // the debt pool so we can calculate their exit price and
        // collateralistion ratio
        uint debtEntryIndex;
    }

    // Issued nomin balances for individual fee entitlements and exit price calculations
    mapping(address => IssuanceData) public issuanceData;

    // The total count of people that have outstanding issued nomins in any flavour
    uint public totalIssuerCount;

    // Controls whether a particular address can issue nomins or not
    mapping(address => bool) public isIssuer;

    // Global debt pool tracking
    uint[] public debtLedger;

    // The time the current fee period began */
    uint public feePeriodStartTime;
    // The time the last fee period began */
    uint public lastFeePeriodStartTime;

    // Fee periods will roll over in no shorter a time than this. 
    // The fee period cannot actually roll over until a fee-relevant
    // operation such as withdrawal or a fee period duration update occurs,
    // so this is just a target, and the actual duration may be slightly longer.
    uint public feePeriodDuration = 4 weeks;
    // ...and must target between 1 day and six months.
    uint constant MIN_FEE_PERIOD_DURATION = 1 days;
    uint constant MAX_FEE_PERIOD_DURATION = 26 weeks;

    // The quantity of nomins that were in the fee pot at the time
    // of the last fee rollover, at feePeriodStartTime, priced in HDRs.
    uint public lastFeesCollected;

    // Whether a user has withdrawn their last fees
    mapping(address => bool) public hasWithdrawnFees;

    // Available Nomins which can be used with the system
    Nomin[] public availableNomins;
    mapping(bytes4 => Nomin) public nomins;

    HavvenEscrow public escrow;
    ExchangeRates public exchangeRates;

    // A quantity of nomins greater than this ratio
    // may not be issued against a given value of havvens.
    uint public issuanceRatio = UNIT / 5;
    // No more nomins may be issued than the value of havvens backing them.
    uint constant MAX_ISSUANCE_RATIO = UNIT;

    uint constant HAVVEN_SUPPLY = 1e8 * UNIT;
    string constant TOKEN_NAME = "Havven";
    string constant TOKEN_SYMBOL = "HAV";
    
    // ========== CONSTRUCTOR ==========

    /*
     * @dev Constructor
     * @param _tokenState A pre-populated contract containing token balances.
     * If the provided address is 0x0, then a fresh one will be constructed with the contract owning all tokens.
     * @param _owner The owner of this contract.
     */
    constructor(address _proxy, TokenState _tokenState, address _owner, ExchangeRates _exchangeRates, Havven _oldHavven)
        ExternStateToken(_proxy, _tokenState, TOKEN_NAME, TOKEN_SYMBOL, HAVVEN_SUPPLY, _owner)
        public
    {
        exchangeRates = _exchangeRates;

        if (_oldHavven == address(0)) {
            feePeriodStartTime = now;
            lastFeePeriodStartTime = now - feePeriodDuration;
        } else {
            feePeriodStartTime = _oldHavven.feePeriodStartTime();
            lastFeePeriodStartTime = _oldHavven.lastFeePeriodStartTime();

            // TODO: Need to handle contract upgrades correctly.

            // uint i;
            // uint cbs;
            // uint lab;
            // uint lm;
            // (cbs, lab, lm) = _oldHavven.totalIssuanceData();
            // totalIssuanceData.currentBalanceSum = cbs;
            // totalIssuanceData.lastAverageBalance = lab;
            // totalIssuanceData.lastModified = lm;

            // for (i = 0; i < _issuers.length; i++) {
            //     address issuer = _issuers[i];
            //     isIssuer[issuer] = true;
            //     uint nomins = _oldHavven.nominsIssued(issuer);
            //     if (nomins == 0) {
            //         // It is not valid in general to skip those with no currently-issued nomins.
            //         // But for this release, issuers with nonzero issuanceData have current issuance.
            //         continue;
            //     }
            //     (cbs, lab, lm) = _oldHavven.issuanceData(issuer);
            //     nominsIssued[issuer] = nomins;
            //     issuanceData[issuer].currentBalanceSum = cbs;
            //     issuanceData[issuer].lastAverageBalance = lab;
            //     issuanceData[issuer].lastModified = lm;
            // }
        }

    }

    // ========== SETTERS ========== */

    /*
     * @notice Add an associated Nomin contract to the Havven system
     * @dev Only the contract owner may call this.
     */
    function addNomin(Nomin nomin)
        external
        optionalProxy_onlyOwner
    {
        bytes4 currencyKey = nomin.currencyKey();

        require(nomins[currencyKey] == Nomin(0), "Nomin already exists");

        availableNomins.push(nomin);
        nomins[currencyKey] = nomin;

        emitNominAdded(currencyKey, nomin);
    }

    /*
     * @notice Remove an associated Nomin contract from the Havven system
     * @dev Only the contract owner may call this.
     */
    function removeNomin(bytes4 currencyKey)
        external
        optionalProxy_onlyOwner
        nominExists(currencyKey)
    {
        require(nomins[currencyKey].totalSupply() == 0, "Nomin cannot be removed until its total supply is zero");

        // Save the address we're removing for emitting the event at the end.
        address nominToRemove = nomins[currencyKey];

        // Remove the nomin from the availableNomins array.
        for (uint i = 0; i < availableNomins.length; i++) {
            if (availableNomins[i] == nominToRemove) {
                delete availableNomins[i];

                // Copy the last nomin into the place of the one we just deleted
                // If there's only one nomin, this is nomins[0] = nomins[0].
                // If we're deleting the last one, it's also a NOOP in the same way.
                availableNomins[i] = availableNomins[availableNomins.length - 1];

                // Decrease the size of the array by one.
                availableNomins.length--;

                break;
            }
        }

        // And remove it from the nomins mapping
        delete nomins[currencyKey];
        
        emitNominRemoved(currencyKey, nominToRemove);
    }

    /*
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

    /*
     * @notice Set the targeted fee period duration.
     * @dev Only callable by the contract owner. The duration must fall within
     * acceptable bounds (1 day to 26 weeks). Upon resetting this the fee period
     * may roll over if the target duration was shortened sufficiently.
     */
    function setFeePeriodDuration(uint duration)
        external
        optionalProxy_onlyOwner
    {
        require(
            MIN_FEE_PERIOD_DURATION <= duration && duration <= MAX_FEE_PERIOD_DURATION,
            "Duration must be between MIN_FEE_PERIOD_DURATION and MAX_FEE_PERIOD_DURATION"
        );
        
        feePeriodDuration = duration;
        emitFeePeriodDurationUpdated(duration);
        // rolloverFeePeriodIfElapsed();
    }

    /*
     * @notice Set the ExchangeRates contract address where rates are held.
     * @dev Only callable by the contract owner.
     */
    function setExchangeRates(ExchangeRates _exchangeRates)
        external
        optionalProxy_onlyOwner
    {
        exchangeRates = _exchangeRates;
        emitExchangeRatesUpdated(_exchangeRates);
    }

    /*
     * @notice Set the issuanceRatio for issuance calculations.
     * @dev Only callable by the contract owner.
     */
    function setIssuanceRatio(uint _issuanceRatio)
        external
        optionalProxy_onlyOwner
    {
        require(_issuanceRatio <= MAX_ISSUANCE_RATIO, "New issuance ratio cannot exceed MAX_ISSUANCE_RATIO");
        issuanceRatio = _issuanceRatio;
        emitIssuanceRatioUpdated(_issuanceRatio);
    }

    /*
     * @notice Set whether the specified address can issue nomins or not.
     * @dev Only callable by the contract owner.
     */
    function setIssuer(address account, bool value)
        external
        optionalProxy_onlyOwner
    {
        isIssuer[account] = value;
        emitIssuerUpdated(account, value);
    }

    // ========== VIEWS ==========

    /*
     * @notice A function that lets you easily convert an amount in a source currency to an amount in the destination currency
     * @param sourceCurrencyKey The currency the amount is specified in
     * @param sourceAmount The source amount, specified in UNIT base
     * @param destinationCurrencyKey The destination currency
     */
    function effectiveValue(bytes4 sourceCurrencyKey, uint sourceAmount, bytes4 destinationCurrencyKey)
        public
        view
        rateNotStale(sourceCurrencyKey)
        rateNotStale(destinationCurrencyKey)
        returns (uint)
    {
        // Calcuate the effective value by going from source -> USD -> destination
        return safeDiv_dec(
            safeMul_dec(sourceAmount, exchangeRates.rateForCurrency(sourceCurrencyKey)), 
            exchangeRates.rateForCurrency(destinationCurrencyKey)
        );
    }

    /*
     * @notice Total amount of nomins issued by the system, priced in currencyKey
     * @param currencyKey The currency to value the nomins in
     */
    function totalIssuedNomins(bytes4 currencyKey)
        public
        view
        rateNotStale(currencyKey)
        returns (uint)
    {
        uint total = 0;
        uint currencyRate = exchangeRates.rateForCurrency(currencyKey);

        for (uint i = 0; i < availableNomins.length; i++) {
            // Ensure the rate isn't stale.
            // TODO: Investigate gas cost optimisation of doing a single call with all keys in it vs
            // individual calls like this.
            require(!rateIsStale(availableNomins[i].currencyKey()), "Rate is stale");

            // What's the total issued value of that nomin in the destination currency?
            // Note: We're not using our effectiveValue function because we don't want to go get the
            //       rate for the destination currency and check if it's stale repeatedly on every
            //       iteration of the loop
            uint nominValue = safeDiv_dec(
                safeMul_dec(availableNomins[i].totalSupply(), exchangeRates.rateForCurrency(availableNomins[i].currencyKey())), 
                currencyRate
            );

            total = safeAdd(total, nominValue);
        }

        return total; 
    }

    /*
     * @notice Returns the count of available nomins in the system, which you can use to iterate availableNomins
     */
    function availableNominCount()
        public
        view
        returns (uint)
    {
        return availableNomins.length;
    }

    // function issuanceCurrentBalanceSum(address account)
    //     external
    //     view
    //     returns (uint)
    // {
    //     return issuanceData[account].currentBalanceSum;
    // }

    // function issuanceLastAverageBalance(address account)
    //     external
    //     view
    //     returns (uint)
    // {
    //     return issuanceData[account].lastAverageBalance;
    // }

    // function issuanceLastModified(address account)
    //     external
    //     view
    //     returns (uint)
    // {
    //     return issuanceData[account].lastModified;
    // }

    // function totalIssuanceCurrentBalanceSum()
    //     external
    //     view
    //     returns (uint)
    // {
    //     return totalIssuanceData.currentBalanceSum;
    // }

    // function totalIssuanceLastAverageBalance()
    //     external
    //     view
    //     returns (uint)
    // {
    //     return totalIssuanceData.lastAverageBalance;
    // }

    // function totalIssuanceLastModified()
    //     external
    //     view
    //     returns (uint)
    // {
    //     return totalIssuanceData.lastModified;
    // }

    // ========== MUTATIVE FUNCTIONS ==========

    /*
     * @notice ERC20 transfer function.
     */
    function transfer(address to, uint value)
        public
        returns (bool)
    {
        bytes memory empty;
        return transfer(to, value, empty);
    }

    /*
     * @notice ERC223 transfer function. Does not conform with the ERC223 spec, as:
     *         - Transaction doesn't revert if the recipient doesn't implement tokenFallback()
     *         - Emits a standard ERC20 event without the bytes data parameter so as not to confuse
     *           tooling such as Etherscan.
     */
    function transfer(address to, uint value, bytes data)
        public
        optionalProxy
        returns (bool)
    {
        // Ensure they're not trying to exceed their locked amount
        require(value <= transferableHavvens(messageSender), "Value to transfer exceeds available Havvens");

        // Perform the transfer: if there is a problem an exception will be thrown in this call.
        _transfer_byProxy(messageSender, to, value, data);

        return true;
    }

    /*
     * @notice ERC20 transferFrom function.
     */
    function transferFrom(address from, address to, uint value)
        public
        returns (bool)
    {
        bytes memory empty;
        return transferFrom(from, to, value, empty);
    }

    /*
     * @notice ERC223 transferFrom function. Does not conform with the ERC223 spec, as:
     *         - Transaction doesn't revert if the recipient doesn't implement tokenFallback()
     *         - Emits a standard ERC20 event without the bytes data parameter so as not to confuse
     *           tooling such as Etherscan.
     */
    function transferFrom(address from, address to, uint value, bytes data)
        public
        optionalProxy
        returns (bool)
    {
        // Ensure they're not trying to exceed their locked amount
        require(value <= transferableHavvens(from), "Value to transfer exceeds available Havvens");

        // Perform the transfer: if there is a problem,
        // an exception will be thrown in this call.
        _transferFrom_byProxy(messageSender, from, to, value, data);

        return true;
    }

    // /*
    //  * @notice Compute the last period's fee entitlement for the message sender
    //  * and then deposit it into their nomin account.
    //  */
    // function withdrawFees()
    //     external
    //     optionalProxy
    // {
    //     address sender = messageSender;
    //     rolloverFeePeriodIfElapsed();
    //     // Do not deposit fees into frozen accounts. */
    //     require(!nomin.frozen(sender), "Cannot deposit fees into frozen accounts");

    //     // Check the period has rolled over first. */
    //     updateIssuanceData(sender, nominsIssued[sender], nomin.totalSupply());

    //     // Only allow accounts to withdraw fees once per period. */
    //     require(!hasWithdrawnFees[sender], "Fees have already been withdrawn in this period");

    //     uint feesOwed;
    //     uint lastTotalIssued = totalIssuanceData.lastAverageBalance;

    //     if (lastTotalIssued > 0) {
    //         // Sender receives a share of last period's collected fees proportional
    //          * with their average fraction of the last period's issued nomins. */
    //         feesOwed = safeDiv_dec(
    //             safeMul_dec(issuanceData[sender].lastAverageBalance, lastFeesCollected),
    //             lastTotalIssued
    //         );
    //     }

    //     hasWithdrawnFees[sender] = true;

    //     if (feesOwed != 0) {
    //         nomin.withdrawFees(sender, feesOwed);
    //     }
    //     emitFeesWithdrawn(messageSender, feesOwed);
    // }

    // /*
    //  * @notice Update the havven balance averages since the last transfer
    //  * or entitlement adjustment.
    //  * @dev Since this updates the last transfer timestamp, if invoked
    //  * consecutively, this function will do nothing after the first call.
    //  * Also, this will adjust the total issuance at the same time.
    //  */
    // function updateIssuanceData(address account, uint preBalance, uint lastTotalSupply)
    //     internal
    // {
    //     // update the total balances first */
    //     totalIssuanceData = computeIssuanceData(lastTotalSupply, totalIssuanceData);

    //     if (issuanceData[account].lastModified < feePeriodStartTime) {
    //         hasWithdrawnFees[account] = false;
    //     }

    //     issuanceData[account] = computeIssuanceData(preBalance, issuanceData[account]);
    // }


    // /*
    //  * @notice Compute the new IssuanceData on the old balance
    //  */
    // function computeIssuanceData(uint preBalance, IssuanceData preIssuance)
    //     internal
    //     view
    //     returns (IssuanceData)
    // {

    //     uint currentBalanceSum = preIssuance.currentBalanceSum;
    //     uint lastAverageBalance = preIssuance.lastAverageBalance;
    //     uint lastModified = preIssuance.lastModified;

    //     if (lastModified < feePeriodStartTime) {
    //         if (lastModified < lastFeePeriodStartTime) {
    //             // The balance was last updated before the previous fee period, so the average
    //              * balance in this period is their pre-transfer balance. */
    //             lastAverageBalance = preBalance;
    //         } else {
    //             // The balance was last updated during the previous fee period. */
    //             // No overflow or zero denominator problems, since lastFeePeriodStartTime < feePeriodStartTime < lastModified. 
    //              * implies these quantities are strictly positive. */
    //             uint timeUpToRollover = feePeriodStartTime - lastModified;
    //             uint lastFeePeriodDuration = feePeriodStartTime - lastFeePeriodStartTime;
    //             uint lastBalanceSum = safeAdd(currentBalanceSum, safeMul(preBalance, timeUpToRollover));
    //             lastAverageBalance = lastBalanceSum / lastFeePeriodDuration;
    //         }
    //         // Roll over to the next fee period. */
    //         currentBalanceSum = safeMul(preBalance, now - feePeriodStartTime);
    //     } else {
    //         // The balance was last updated during the current fee period. */
    //         currentBalanceSum = safeAdd(
    //             currentBalanceSum,
    //             safeMul(preBalance, now - lastModified)
    //         );
    //     }

    //     return IssuanceData(currentBalanceSum, lastAverageBalance, now);
    // }

    // /*
    //  * @notice Recompute and return the given account's last average balance.
    //  */
    // function recomputeLastAverageBalance(address account)
    //     external
    //     returns (uint)
    // {
    //     updateIssuanceData(account, nominsIssued[account], nomin.totalSupply());
    //     return issuanceData[account].lastAverageBalance;
    // }

    function addToDebtRegister(bytes4 currencyKey, uint amount) 
        internal
        optionalProxy
    {
        // What is the value of the requested debt in HDRs?
        uint hdrValue = effectiveValue(currencyKey, amount, "HDR");
        
        // What is the value of all issued nomins of the system (priced in HDRs)?
        uint totalDebtIssued = totalIssuedNomins("HDR");

        // What will the new total be including the new value?
        uint newTotalDebtIssued = safeAdd(hdrValue, totalDebtIssued);

        // What is their percentage of the total debt?
        uint debtPercentage = safeDiv_dec(hdrValue, newTotalDebtIssued);

        // And what effect does this percentage have on the global debt holding of other issuers?
        // The delta specifically needs to not take into account any existing debt as it's already
        // accounted for in the delta from when they issued previously.
        uint delta = safeSub(UNIT, debtPercentage);

        // How much existing debt do they have?
        uint existingDebt = debtBalanceOf(messageSender, "HDR");
         
        // And what does their debt ownership look like including this previous stake?
        if (existingDebt > 0) {
            debtPercentage = safeDiv_dec(safeAdd(hdrValue, existingDebt), newTotalDebtIssued);
        }

        // Are they a new issuer? If so, record them.
        if (issuanceData[messageSender].initialDebtOwnership == 0) {
            totalIssuerCount = safeAdd(totalIssuerCount, 1);
        }

        // Save the debt entry parameters
        issuanceData[messageSender].initialDebtOwnership = debtPercentage;
        issuanceData[messageSender].debtEntryIndex = debtLedger.length;

        // And if we're the first, push 1 as there was no effect to any other holders, otherwise push 
        // the change for the rest of the debt holders
        if (debtLedger.length > 0) {
            debtLedger.push(safeMul_dec(debtLedger[debtLedger.length - 1], delta));
        } else {
            debtLedger.push(UNIT);
        }
    }

    /*
     * @notice Issue nomins against the sender's havvens.
     * @dev Issuance is only allowed if the havven price isn't stale and the sender is an issuer.
     * @param currencyKey The currency you wish to issue nomins in, for example nUSD or nAUD
     * @param amount The amount of nomins you wish to issue with a base of UNIT
     */
    function issueNomins(bytes4 currencyKey, uint amount)
        public
        optionalProxy
        onlyIssuer(messageSender)
        nominExists(currencyKey)
        // No need to check if price is stale, as it is checked in issuableNomins. */
    {
        require(amount > 0, "Amount must be greater than zero");
        require(amount <= remainingIssuableNomins(messageSender, currencyKey), "Amount exceeds remaining issuable nomins");

        // Keep track of the debt they're about to create
        addToDebtRegister(currencyKey, amount);

        // Create their nomins
        nomins[currencyKey].issue(messageSender, amount);
    }

    /*
     * @notice Issue the maximum amount of Nomins possible against the sender's havvens.
     * @dev Issuance is only allowed if the havven price isn't stale and the sender is an issuer.
     * @param currencyKey The currency you wish to issue nomins in, for example nUSD or nAUD
     */
    function issueMaxNomins(bytes4 currencyKey)
        external
        optionalProxy
    {
        // Figure out the maximum we can issue in that currency
        uint maxIssuable = remainingIssuableNomins(messageSender, currencyKey);

        // And issue them
        issueNomins(currencyKey, maxIssuable);
    }

    /*
     * @notice Burn nomins to clear issued nomins/free havvens.
     * @param currencyKey The currency you're specifying to burn
     * @param amount The amount (in UNIT base) you wish to burn
     */
    function burnNomins(bytes4 currencyKey, uint amount)
        // It doesn't matter if any rates are stale or if the user is an issuer, as non-issuers have issued no nomins.
        external
        optionalProxy
        nominExists(currencyKey)
    {
        // If they're trying to burn more debt than they actually owe, rather than fail the transaction, let's just
        // clear their debt and leave them be.
        // How much debt do they have?
        uint debt = debtBalanceOf(messageSender, currencyKey);

        require(debt > 0, "No debt to forgive");

        // If they're requesting to burn more than their debt, just burn their debt
        uint amountToBurn = debt < amount ? debt : amount;

        // Remove their debt from the ledger
        removeFromDebtRegister(currencyKey, amountToBurn);

        // nomin.burn does a safeSub on balance (so it will revert if there are not enough nomins).
        nomins[currencyKey].burn(messageSender, amountToBurn);
    }

    /*
     * @notice Remove a debt position from the register
     * @param currencyKey The currency the user is presenting to forgive their debt
     * @param amount The amount (in UNIT base) being presented
     */
    function removeFromDebtRegister(bytes4 currencyKey, uint amount) 
        internal
        optionalProxy
    {
        // How much debt are they trying to remove in HDRs?
        uint debtToRemove = effectiveValue(currencyKey, amount, "HDR");

        // How much debt do they have?
        uint existingDebt = debtBalanceOf(messageSender, "HDR"); 

        // What percentage of the total debt are they trying to remove?
        uint totalDebtIssued = totalIssuedNomins("HDR");
        uint debtPercentage = safeDiv_dec(debtToRemove, totalDebtIssued);

        // And what effect does this percentage have on the global debt holding of other issuers?
        // The delta specifically needs to not take into account any existing debt as it's already
        // accounted for in the delta from when they issued previously.
        uint delta = safeAdd(UNIT, debtPercentage);

        // Are they exiting the system, or are they just decreasing their debt position?
        if (debtToRemove == existingDebt) {
            delete issuanceData[messageSender];

            totalIssuerCount = safeSub(totalIssuerCount, 1);
        } else {
            // What percentage of the debt will they be left with?
            uint newDebt = safeSub(existingDebt, debtToRemove);
            uint newTotalDebtIssued = safeSub(totalDebtIssued, debtToRemove);
            uint newDebtPercentage = safeDiv_dec(newDebt, newTotalDebtIssued);

            issuanceData[messageSender].initialDebtOwnership = newDebtPercentage;
            issuanceData[messageSender].debtEntryIndex = debtLedger.length;
        }

        // Update our cumulative ledger
        debtLedger.push(safeMul_dec(debtLedger[debtLedger.length - 1], delta));
    }

    // /*
    //  * @notice Check if the fee period has rolled over. If it has, set the new fee period start
    //  * time, and record the fees collected in the nomin contract.
    //  */
    // function rolloverFeePeriodIfElapsed()
    //     public
    // {
    //     // If the fee period has rolled over... */
    //     if (now >= feePeriodStartTime + feePeriodDuration) {
    //         lastFeesCollected = nomin.feePool();
    //         lastFeePeriodStartTime = feePeriodStartTime;
    //         feePeriodStartTime = now;
    //         emitFeePeriodRollover(now);
    //     }
    // }

    // ========== Issuance/Burning ==========

    /*
     * @notice The maximum nomins an issuer can issue against their total havven quantity, priced in HDR.
     * This ignores any already issued nomins, and is purely giving you the maximimum amount the user can issue.
     */
    function maxIssuableNomins(address issuer, bytes4 currencyKey)
        public
        view
        rateNotStale("HAV")
        rateNotStale(currencyKey)
        returns (uint)
    {
        // If they're not on the whitelist then they can't issue.
        if (!isIssuer[issuer]) {
            return 0;
        }

        // Ok, so how many HAV do they have?
        uint totalOwnedHavvens = collateral(issuer);

        // We'll need some exchange rates to do this calculation
        uint havRate = exchangeRates.rateForCurrency("HAV");
        uint currencyRate = exchangeRates.rateForCurrency(currencyKey);

        // What is the value of their HAV balance in the destination currency?
        uint havvenBalanceInDestinationCurrency = safeDiv_dec(safeMul_dec(totalOwnedHavvens, havRate), currencyRate);

        // They're allowed to issue up to issuanceRatio of that value
        return safeMul_dec(havvenBalanceInDestinationCurrency, issuanceRatio);
    }

    function debtBalanceOf(address issuer, bytes4 currencyKey)
        public
        view
        optionalProxy
        // Don't need to check for stale rates here because totalIssuedNomins will do it for us
        returns (uint)
    {
        // What was their initial debt ownership?
        uint initialDebtOwnership = issuanceData[issuer].initialDebtOwnership;
        uint debtEntryIndex = issuanceData[issuer].debtEntryIndex;

        // If it's zero, they haven't issued, and they have no debt.
        if (initialDebtOwnership == 0) return 0;

        // Figure out the global debt percentage delta from when they entered the system.
        uint currentDebtOwnership = safeMul_dec(
            initialDebtOwnership, 
            safeDiv_dec(
                debtLedger[debtLedger.length - 1],
                debtLedger[debtEntryIndex]
            )
        );

        // What's the total value of the system in their requested currency?
        uint totalSystemValue = totalIssuedNomins(currencyKey);

        // Their debt balance is their portion of the total system value.
        return safeMul_dec(totalSystemValue, currentDebtOwnership);
    }

    /*
     * @notice The remaining nomins an issuer can issue against their total havven balance.
     * @param issuer The account that intends to issue
     * @param currencyKey The currency to price issuable value in
     */
    function remainingIssuableNomins(address issuer, bytes4 currencyKey)
        public
        view
        nominExists(currencyKey)
        returns (uint)
    {
        uint alreadyIssued = debtBalanceOf(issuer, currencyKey);
        uint max = maxIssuableNomins(issuer, currencyKey);

        if (alreadyIssued >= max) {
            return 0;
        } else {
            return safeSub(max, alreadyIssued);
        }
    }

    /*
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
        uint balance = tokenState.balanceOf(account);

        if (escrow != address(0)) {
            balance = safeAdd(balance, escrow.balanceOf(account));
        }

        return balance;
    }

    /*
     * @notice The collateralisation ratio for a specific user
     */
    function collateralisationRatio(address issuer)
        public
        view
        returns (uint)
    {
        uint debtBalance = debtBalanceOf(issuer, "HAV");
        uint totalOwnedHavvens = collateral(issuer);
        if (totalOwnedHavvens == 0) {
            return 0;
        }

        return safeDiv_dec(debtBalance, totalOwnedHavvens);
    }

    /*
     * @notice The number of havvens that are free to be transferred by an account.
     * @dev When issuing, escrowed havvens are locked first, then non-escrowed
     * havvens are locked last, but escrowed havvens are not transferable, so they are not included
     * in this calculation.
     */
    function transferableHavvens(address account)
        public
        view
        rateNotStale("HAV")
        returns (uint)
    {
        // How many havvens do they have, excluding escrow?
        // Note: We're excluding escrow here because we're interested in their transferable amount
        // and escrowed Havvens are not transferable.
        uint balance = tokenState.balanceOf(account);

        // How many of those will be locked by the amount they've issued?
        // Assuming issuance ratio is 20%, then issuing 20 HAV of value would require 
        // 100 HAV to be locked in their wallet to maintain their collateralisation ratio
        // The locked havven value can exceed their balance.
        uint lockedHavvenValue = safeDiv_dec(debtBalanceOf(account, "HAV"), issuanceRatio);

        // If we exceed the balance, no Havvens are transferable, otherwise the difference is.
        if (lockedHavvenValue >= balance) {
            return 0;
        } else {
            return safeSub(balance, lockedHavvenValue);
        }
    }

    /*
     * @notice Check if any of a list of rates haven't been updated for longer than the stale period.
     * @param currencyKeys The currency keys you wish to check on stale state for.
     */
    function anyRateIsStale(bytes4[] currencyKeys)
        public
        view
        returns (bool)
    {
        return exchangeRates.anyRateIsStale(currencyKeys);
    }

    /*
     * @notice Check if a single rate hasn't been updated for longer than the stale period.
     * @param currencyKey The currency key you wish to check on stale state for.
     */
    function rateIsStale(bytes4 currencyKey)
        public
        view
        returns (bool)
    {
        return exchangeRates.rateIsStale(currencyKey);
    }

    // ========== MODIFIERS ==========

    modifier onlyIssuer(address account) {
        require(isIssuer[account], "Only issuers can perform this action");
        _;
    }

    modifier nominExists(bytes4 currencyKey) {
        require(nomins[currencyKey] != Nomin(0), "Unknown nomin");
        _;
    }

    modifier ratesNotStale(bytes4[] currencyKeys) {
        require(!exchangeRates.anyRateIsStale(currencyKeys), "Rate is stale or currency was not found");
        _;
    }

    modifier rateNotStale(bytes4 currencyKey) {
        require(!exchangeRates.rateIsStale(currencyKey), "Rate is stale or currency was not found");
        _;
    }

    // ========== EVENTS ========== */

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
        proxy._emit(abi.encode(value), 1, FEESWITHDRAWN_SIG, 0, 0, 0);
    }

    event ExchangeRatesUpdated(address newExchangeRates);
    bytes32 constant EXCHANGERATESUPDATED_SIG = keccak256("ExchangeRatesUpdated(address)");
    function emitExchangeRatesUpdated(address newExchangeRates) internal {
        proxy._emit(abi.encode(newExchangeRates), 1, EXCHANGERATESUPDATED_SIG, 0, 0, 0);
    }

    event NominAdded(bytes4 currencyKey, address newNomin);
    bytes32 constant NOMINADDED_SIG = keccak256("NominAdded(bytes4,address)");
    function emitNominAdded(bytes4 currencyKey, address newNomin) internal {
        proxy._emit(abi.encode(currencyKey, newNomin), 1, NOMINADDED_SIG, 0, 0, 0);
    }

    event NominRemoved(bytes4 currencyKey, address removedNomin);
    bytes32 constant NOMINREMOVED_SIG = keccak256("NominRemoved(bytes4,address)");
    function emitNominRemoved(bytes4 currencyKey, address removedNomin) internal {
        proxy._emit(abi.encode(currencyKey, removedNomin), 1, NOMINREMOVED_SIG, 0, 0, 0);
    }

    event EscrowUpdated(address newEscrow);
    bytes32 constant ESCROWUPDATED_SIG = keccak256("EscrowUpdated(address)");
    function emitEscrowUpdated(address newEscrow) internal {
        proxy._emit(abi.encode(newEscrow), 1, ESCROWUPDATED_SIG, 0, 0, 0);
    }

    event IssuerUpdated(address indexed account, bool indexed value);
    bytes32 constant ISSUERUPDATED_SIG = keccak256("IssuerUpdated(address,bool)");
    function emitIssuerUpdated(address account, bool value) internal {
        proxy._emit(abi.encode(), 3, ISSUERUPDATED_SIG, bytes32(account), bytes32(value ? 1 : 0), 0);
    }

}
