/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       Synthetix.sol
version:    2.0
author:     Kevin Brown
            Gavin Conway
date:       2018-09-14

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

Synthetix token contract. SNX is a transferable ERC20 token,
and also give its holders the following privileges.
An owner of SNX has the right to issue nomins in all nomin flavours.

After a fee period terminates, the duration and fees collected for that
period are computed, and the next period begins. Thus an account may only
withdraw the fees owed to them for the previous period, and may only do
so once per period. Any unclaimed fees roll over into the common pot for
the next period.

== Average Balance Calculations ==

The fee entitlement of a synthetix holder is proportional to their average
issued nomin balance over the last fee period. This is computed by
measuring the area under the graph of a user's issued nomin balance over
time, and then when a new fee period begins, dividing through by the
duration of the fee period.

We need only update values when the balances of an account is modified.
This occurs when issuing or burning for issued nomin balances,
and when transferring for synthetix balances. This is for efficiency,
and adds an implicit friction to interacting with SNX.
A synthetix holder pays for his own recomputation whenever he wants to change
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
the average SNX held so far is ((t-f)*s + (n-t)*p) / (n-f).
The complementary computations must be performed for both sender and
recipient.

Note that a transfer keeps global supply of SNX invariant.
The sum of all balances is constant, and unmodified by any transfer.
So the sum of all balances multiplied by the duration of a fee period is also
constant, and this is equivalent to the sum of the area of every user's
time/balance graph. Dividing through by that duration yields back the total
synthetix supply. So, at the end of a fee period, we really do yield a user's
average share in the synthetix supply over that period.

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
as the check that they have rolled over occurs only when state-changing synthetix
operations are performed.

== Issuance and Burning ==

In this version of the synthetix contract, nomins can only be issued by
those that have been nominated by the synthetix foundation. Nomins are assumed
to be valued at $1, as they are a stable unit of account.

All nomins issued require a proportional value of SNX to be locked,
where the proportion is governed by the current issuance ratio. This
means for every $1 of SNX locked up, $(issuanceRatio) nomins can be issued.
i.e. to issue 100 nomins, 100/issuanceRatio dollars of SNX need to be locked up.

To determine the value of some amount of SNX(H), an oracle is used to push
the price of SNX (P_H) in dollars to the contract. The value of H
would then be: H * P_H.

Any SNX that are locked up by this issuance process cannot be transferred.
The amount that is locked floats based on the price of SNX. If the price
of SNX moves up, less SNX are locked, so they can be issued against,
or transferred freely. If the price of SNX moves down, more SNX are locked,
even going above the initial wallet balance.

-----------------------------------------------------------------
*/

pragma solidity 0.4.25;


import "./FeePool.sol";
import "./ExternStateToken.sol";
import "./Nomin.sol";
import "./SynthetixEscrow.sol";
import "./SynthetixState.sol";
import "./TokenState.sol";
import "./ExchangeRates.sol";

/**
 * @title Synthetix ERC20 contract.
 * @notice The Synthetix contracts not only facilitates transfers, exchanges, and tracks balances,
 * but it also computes the quantity of fees each synthetix holder is entitled to.
 */
contract Synthetix is ExternStateToken {

    // ========== STATE VARIABLES ==========

    // Available Nomins which can be used with the system
    Nomin[] public availableNomins;
    mapping(bytes4 => Nomin) public nomins;

    FeePool public feePool;
    SynthetixEscrow public escrow;
    ExchangeRates public exchangeRates;
    SynthetixState public synthetixState;

    uint constant SYNTHETIX_SUPPLY = 1e8 * SafeDecimalMath.unit();
    string constant TOKEN_NAME = "Synthetix";
    string constant TOKEN_SYMBOL = "SNX";
    uint constant DECIMALS = 18;

    // ========== CONSTRUCTOR ==========

    /**
     * @dev Constructor
     * @param _tokenState A pre-populated contract containing token balances.
     * If the provided address is 0x0, then a fresh one will be constructed with the contract owning all tokens.
     * @param _owner The owner of this contract.
     */
    constructor(address _proxy, TokenState _tokenState, SynthetixState _synthetixState,
        address _owner, ExchangeRates _exchangeRates, FeePool _feePool
    )
        ExternStateToken(_proxy, _tokenState, TOKEN_NAME, TOKEN_SYMBOL, SYNTHETIX_SUPPLY, DECIMALS, _owner)
        public
    {
        synthetixState = _synthetixState;
        exchangeRates = _exchangeRates;
        feePool = _feePool;
    }

    // ========== SETTERS ========== */

    /**
     * @notice Add an associated Nomin contract to the Synthetix system
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

    /**
     * @notice Remove an associated Nomin contract from the Synthetix system
     * @dev Only the contract owner may call this.
     */
    function removeNomin(bytes4 currencyKey)
        external
        optionalProxy_onlyOwner
    {
        require(nomins[currencyKey] != address(0), "Nomin does not exist");
        require(nomins[currencyKey].totalSupply() == 0, "Nomin supply exists");

        // Save the address we're removing for emitting the event at the end.
        address nominToRemove = nomins[currencyKey];

        // Remove the nomin from the availableNomins array.
        for (uint8 i = 0; i < availableNomins.length; i++) {
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

    /**
     * @notice Set the associated synthetix escrow contract.
     * @dev Only the contract owner may call this.
     */
    function setEscrow(SynthetixEscrow _escrow)
        external
        optionalProxy_onlyOwner
    {
        escrow = _escrow;
        // Note: No event here as our contract exceeds max contract size
        // with these events, and it's unlikely people will need to
        // track these events specifically.
    }

    /**
     * @notice Set the ExchangeRates contract address where rates are held.
     * @dev Only callable by the contract owner.
     */
    function setExchangeRates(ExchangeRates _exchangeRates)
        external
        optionalProxy_onlyOwner
    {
        exchangeRates = _exchangeRates;
        // Note: No event here as our contract exceeds max contract size
        // with these events, and it's unlikely people will need to
        // track these events specifically.
    }

    /**
     * @notice Set the synthetixState contract address where issuance data is held.
     * @dev Only callable by the contract owner.
     */
    function setSynthetixState(SynthetixState _synthetixState)
        external
        optionalProxy_onlyOwner
    {
        synthetixState = _synthetixState;
        // Note: No event here as our contract exceeds max contract size
        // with these events, and it's unlikely people will need to
        // track these events specifically.
    }

    /**
     * @notice Set your preferred currency. Note: This does not automatically exchange any balances you've held previously in
     * other nomin currencies in this address, it will apply for any new payments you receive at this address.
     */
    function setPreferredCurrency(bytes4 currencyKey)
        external
        optionalProxy
    {
        require(currencyKey == 0 || !exchangeRates.rateIsStale(currencyKey), "Currency rate is stale or doesn't exist.");

        synthetixState.setPreferredCurrency(messageSender, currencyKey);

        emitPreferredCurrencyChanged(messageSender, currencyKey);
    }

    // ========== VIEWS ==========

    /**
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
        // If there's no change in the currency, then just return the amount they gave us
        if (sourceCurrencyKey == destinationCurrencyKey) return sourceAmount;

        // Calcuate the effective value by going from source -> USD -> destination
        return sourceAmount.multiplyDecimalRound(exchangeRates.rateForCurrency(sourceCurrencyKey))
            .divideDecimalRound(exchangeRates.rateForCurrency(destinationCurrencyKey));
    }

    /**
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

        for (uint8 i = 0; i < availableNomins.length; i++) {
            // Ensure the rate isn't stale.
            // TODO: Investigate gas cost optimisation of doing a single call with all keys in it vs
            // individual calls like this.
            require(!exchangeRates.rateIsStale(availableNomins[i].currencyKey()), "Rate is stale");

            // What's the total issued value of that nomin in the destination currency?
            // Note: We're not using our effectiveValue function because we don't want to go get the
            //       rate for the destination currency and check if it's stale repeatedly on every
            //       iteration of the loop
            uint nominValue = availableNomins[i].totalSupply()
                .multiplyDecimalRound(exchangeRates.rateForCurrency(availableNomins[i].currencyKey()))
                .divideDecimalRound(currencyRate);
            total = total.add(nominValue);
        }

        return total;
    }

    /**
     * @notice Returns the count of available nomins in the system, which you can use to iterate availableNomins
     */
    function availableNominCount()
        public
        view
        returns (uint)
    {
        return availableNomins.length;
    }

    // ========== MUTATIVE FUNCTIONS ==========

    /**
     * @notice ERC20 transfer function.
     */
    function transfer(address to, uint value)
        public
        returns (bool)
    {
        bytes memory empty;
        return transfer(to, value, empty);
    }

    /**
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
        require(value <= transferableSynthetix(messageSender), "Insufficient balance");

        // Perform the transfer: if there is a problem an exception will be thrown in this call.
        _transfer_byProxy(messageSender, to, value, data);

        return true;
    }

    /**
     * @notice ERC20 transferFrom function.
     */
    function transferFrom(address from, address to, uint value)
        public
        returns (bool)
    {
        bytes memory empty;
        return transferFrom(from, to, value, empty);
    }

    /**
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
        require(value <= transferableSynthetix(from), "Insufficient balance");

        // Perform the transfer: if there is a problem,
        // an exception will be thrown in this call.
        _transferFrom_byProxy(messageSender, from, to, value, data);

        return true;
    }

    /**
     * @notice Function that allows you to exchange nomins you hold in one flavour for another.
     * @param sourceCurrencyKey The source currency you wish to exchange from
     * @param sourceAmount The amount, specified in UNIT of source currency you wish to exchange
     * @param destinationCurrencyKey The destination currency you wish to obtain.
     * @param destinationAddress Where the result should go. If this is address(0), or if it's the message sender, no fee
     *        is deducted, otherwise the standard transfer fee is deducted.
     * @return Boolean that indicates whether the transfer succeeded or failed.
     */
    function exchange(bytes4 sourceCurrencyKey, uint sourceAmount, bytes4 destinationCurrencyKey, address destinationAddress)
        external
        optionalProxy
        // Note: We don't need to insist on non-stale rates because effectiveValue will do it for us.
        returns (bool)
    {
        require(sourceCurrencyKey != destinationCurrencyKey, "Exchange must use different nomins");
        require(sourceAmount > 0, "Zero amount");
        require(destinationAddress != address(this), "Synthetix is invalid destination");
        require(destinationAddress != address(proxy), "Proxy is invalid destination");

        // Pass it along, defaulting to the sender as the recipient.
        return _internalExchange(
            messageSender,
            sourceCurrencyKey,
            sourceAmount,
            destinationCurrencyKey,
            destinationAddress == address(0) ? messageSender : destinationAddress,
            true // Charge fee on the exchange
        );
    }

    function nominInitiatedExchange(
        address from,
        bytes4 sourceCurrencyKey,
        uint sourceAmount,
        bytes4 destinationCurrencyKey,
        address destinationAddress
    )
        external
        onlyNomin
        returns (bool)
    {
        require(sourceCurrencyKey != destinationCurrencyKey, "Can't be same nomin");
        require(sourceAmount > 0, "Zero amount");

        // Pass it along
        return _internalExchange(
            from,
            sourceCurrencyKey,
            sourceAmount,
            destinationCurrencyKey,
            destinationAddress,
            false // Don't charge fee on the exchange, as they've already been charged a transfer fee in the nomin contract
        );
    }

    function nominInitiatedFeePayment(
        address from,
        bytes4 sourceCurrencyKey,
        uint sourceAmount
    )
        external
        onlyNomin
        returns (bool)
    {
        require(sourceAmount > 0, "Source can't be 0");

        // Pass it along, defaulting to the sender as the recipient.
        bool result = _internalExchange(
            from,
            sourceCurrencyKey,
            sourceAmount,
            "HDR",
            feePool.FEE_ADDRESS(),
            false // Don't charge a fee on the exchange because this is already a fee
        );

        // Tell the fee pool about this.
        if (result) {
            feePool.feePaid(sourceCurrencyKey, sourceAmount);
        }

        return result;
    }

    function _internalExchange(
        address from,
        bytes4 sourceCurrencyKey,
        uint sourceAmount,
        bytes4 destinationCurrencyKey,
        address destinationAddress,
        bool chargeFee
    )
        internal
        notFeeAddress(from)
        returns (bool)
    {
        require(destinationAddress != address(0), "Zero destination");
        require(destinationAddress != address(this), "Synthetix is invalid destination");
        require(destinationAddress != address(proxy), "Proxy is invalid destination");

        // Note: We don't need to check their balance as the burn() below will do a safe subtraction which requires
        // the subtraction to not overflow, which would happen if their balance is not sufficient.

        // Burn the source amount
        nomins[sourceCurrencyKey].burn(from, sourceAmount);

        // How much should they get in the destination currency?
        uint destinationAmount = effectiveValue(sourceCurrencyKey, sourceAmount, destinationCurrencyKey);

        // What's the fee on that currency that we should deduct?
        uint amountReceived = destinationAmount;
        uint fee = 0;

        if (chargeFee) {
            amountReceived = feePool.amountReceivedFromExchange(destinationAmount);
            fee = destinationAmount.sub(amountReceived);
        }

        // Issue their new nomins
        nomins[destinationCurrencyKey].issue(destinationAddress, amountReceived);

        // Remit the fee in HDRs
        if (fee > 0) {
            uint hdrFeeAmount = effectiveValue(destinationCurrencyKey, fee, "HDR");
            nomins["HDR"].issue(feePool.FEE_ADDRESS(), hdrFeeAmount);
        }

        // Nothing changes as far as issuance data goes because the total value in the system hasn't changed.

        // Call the ERC223 transfer callback if needed
        nomins[destinationCurrencyKey].triggerTokenFallbackIfNeeded(from, destinationAddress, amountReceived);

        // Gas optimisation:
        // No event emitted as it's assumed users will be able to track transfers to the zero address, followed
        // by a transfer on another nomin from the zero address and ascertain the info required here.

        return true;
    }


    function _addToDebtRegister(bytes4 currencyKey, uint amount)
        internal
        optionalProxy
    {
        // What is the value of the requested debt in HDRs?
        uint hdrValue = effectiveValue(currencyKey, amount, "HDR");

        // What is the value of all issued nomins of the system (priced in HDRs)?
        uint totalDebtIssued = totalIssuedNomins("HDR");

        // What will the new total be including the new value?
        uint newTotalDebtIssued = hdrValue.add(totalDebtIssued);

        // What is their percentage (as a high precision int) of the total debt?
        uint debtPercentage = hdrValue.divideDecimalRoundPrecise(newTotalDebtIssued);

        // And what effect does this percentage have on the global debt holding of other issuers?
        // The delta specifically needs to not take into account any existing debt as it's already
        // accounted for in the delta from when they issued previously.
        // The delta is a high precision integer.
        uint delta = SafeDecimalMath.preciseUnit().sub(debtPercentage);

        // How much existing debt do they have?
        uint existingDebt = debtBalanceOf(messageSender, "HDR");

        // And what does their debt ownership look like including this previous stake?
        if (existingDebt > 0) {
            debtPercentage = hdrValue.add(existingDebt).divideDecimalRoundPrecise(newTotalDebtIssued);
        }

        // Are they a new issuer? If so, record them.
        if (!synthetixState.hasIssued(messageSender)) {
            synthetixState.incrementTotalIssuerCount();
        }

        // Save the debt entry parameters
        synthetixState.setCurrentIssuanceData(messageSender, debtPercentage);

        // And if we're the first, push 1 as there was no effect to any other holders, otherwise push
        // the change for the rest of the debt holders. The debt ledger holds high precision integers.
        if (synthetixState.debtLedgerLength() > 0) {
            synthetixState.appendDebtLedgerValue(
                synthetixState.lastDebtLedgerEntry().multiplyDecimalRoundPrecise(delta)
            );
        } else {
            synthetixState.appendDebtLedgerValue(SafeDecimalMath.preciseUnit());
        }
    }

    /**
     * @notice Issue nomins against the sender's SNX.
     * @dev Issuance is only allowed if the synthetix price isn't stale and the sender is an issuer.
     * @param currencyKey The currency you wish to issue nomins in, for example nUSD or nAUD
     * @param amount The amount of nomins you wish to issue with a base of UNIT
     */
    function issueNomins(bytes4 currencyKey, uint amount)
        public
        optionalProxy
        // No need to check if price is stale, as it is checked in issuableNomins.
    {
        require(amount <= remainingIssuableNomins(messageSender, currencyKey), "Amount too large");

        // Keep track of the debt they're about to create
        _addToDebtRegister(currencyKey, amount);

        // Create their nomins
        nomins[currencyKey].issue(messageSender, amount);
    }

    /**
     * @notice Issue the maximum amount of Nomins possible against the sender's SNX.
     * @dev Issuance is only allowed if the synthetix price isn't stale and the sender is an issuer.
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

    /**
     * @notice Burn nomins to clear issued nomins/free SNX.
     * @param currencyKey The currency you're specifying to burn
     * @param amount The amount (in UNIT base) you wish to burn
     */
    function burnNomins(bytes4 currencyKey, uint amount)
        external
        optionalProxy
        // No need to check for stale rates as _removeFromDebtRegister calls effectiveValue
        // which does this for us
    {
        // If they're trying to burn more debt than they actually owe, rather than fail the transaction, let's just
        // clear their debt and leave them be.
        // How much debt do they have?
        uint debt = debtBalanceOf(messageSender, currencyKey);

        require(debt > 0, "No debt to forgive");

        // If they're requesting to burn more than their debt, just burn their debt
        uint amountToBurn = debt < amount ? debt : amount;

        // Remove their debt from the ledger
        _removeFromDebtRegister(currencyKey, amountToBurn);

        // nomin.burn does a safe subtraction on balance (so it will revert if there are not enough nomins).
        nomins[currencyKey].burn(messageSender, amountToBurn);
    }

    /**
     * @notice Remove a debt position from the register
     * @param currencyKey The currency the user is presenting to forgive their debt
     * @param amount The amount (in UNIT base) being presented
     */
    function _removeFromDebtRegister(bytes4 currencyKey, uint amount)
        internal
    {
        // How much debt are they trying to remove in HDRs?
        uint debtToRemove = effectiveValue(currencyKey, amount, "HDR");

        // How much debt do they have?
        uint existingDebt = debtBalanceOf(messageSender, "HDR");

        // What percentage of the total debt are they trying to remove?
        uint totalDebtIssued = totalIssuedNomins("HDR");
        uint debtPercentage = debtToRemove.divideDecimalRoundPrecise(totalDebtIssued);

        // And what effect does this percentage have on the global debt holding of other issuers?
        // The delta specifically needs to not take into account any existing debt as it's already
        // accounted for in the delta from when they issued previously.
        uint delta = SafeDecimalMath.preciseUnit().add(debtPercentage);

        // Are they exiting the system, or are they just decreasing their debt position?
        if (debtToRemove == existingDebt) {
            synthetixState.clearIssuanceData(messageSender);
            synthetixState.decrementTotalIssuerCount();
        } else {
            // What percentage of the debt will they be left with?
            uint newDebt = existingDebt.sub(debtToRemove);
            uint newTotalDebtIssued = totalDebtIssued.sub(debtToRemove);
            uint newDebtPercentage = newDebt.divideDecimalRoundPrecise(newTotalDebtIssued);

            // Store the debt percentage and debt ledger as high precision integers
            synthetixState.setCurrentIssuanceData(messageSender, newDebtPercentage);
        }

        // Update our cumulative ledger. This is also a high precision integer.
        synthetixState.appendDebtLedgerValue(
            synthetixState.lastDebtLedgerEntry().multiplyDecimalRoundPrecise(delta)
        );
    }

    // ========== Issuance/Burning ==========

    /**
     * @notice The maximum nomins an issuer can issue against their total synthetix quantity, priced in HDRs.
     * This ignores any already issued nomins, and is purely giving you the maximimum amount the user can issue.
     */
    function maxIssuableNomins(address issuer, bytes4 currencyKey)
        public
        view
        // We don't need to check stale rates here as effectiveValue will do it for us.
        returns (uint)
    {
        // What is the value of their SNX balance in the destination currency?
        uint destinationValue = effectiveValue("SNX", collateral(issuer), currencyKey);

        // They're allowed to issue up to issuanceRatio of that value
        return destinationValue.multiplyDecimal(synthetixState.issuanceRatio());
    }

    function collateralisationRatio(address issuer)
        public
        view
        returns (uint)
    {
        uint debtBalance = debtBalanceOf(issuer, "SNX");
        uint totalOwnedSynthetix = collateral(issuer);

        if (totalOwnedSynthetix == 0) return 0;

        return debtBalance.divideDecimalRound(totalOwnedSynthetix);
    }

    function debtBalanceOf(address issuer, bytes4 currencyKey)
        public
        view
        // Don't need to check for stale rates here because totalIssuedNomins will do it for us
        returns (uint)
    {
        // What was their initial debt ownership?
        uint initialDebtOwnership;
        uint debtEntryIndex;
        (initialDebtOwnership, debtEntryIndex) = synthetixState.issuanceData(issuer);

        // If it's zero, they haven't issued, and they have no debt.
        if (initialDebtOwnership == 0) return 0;

        // Figure out the global debt percentage delta from when they entered the system.
        // This is a high precision integer.
        uint currentDebtOwnership = synthetixState.lastDebtLedgerEntry()
            .divideDecimalRoundPrecise(synthetixState.debtLedger(debtEntryIndex))
            .multiplyDecimalRoundPrecise(initialDebtOwnership);

        // What's the total value of the system in their requested currency?
        uint totalSystemValue = totalIssuedNomins(currencyKey);

        // Their debt balance is their portion of the total system value.
        uint highPrecisionBalance = totalSystemValue.decimalToPreciseDecimal()
            .multiplyDecimalRoundPrecise(currentDebtOwnership);

        return highPrecisionBalance.preciseDecimalToDecimal();
    }

    /**
     * @notice The remaining nomins an issuer can issue against their total synthetix balance.
     * @param issuer The account that intends to issue
     * @param currencyKey The currency to price issuable value in
     */
    function remainingIssuableNomins(address issuer, bytes4 currencyKey)
        public
        view
        // Don't need to check for nomin existing or stale rates because maxIssuableNomins will do it for us.
        returns (uint)
    {
        uint alreadyIssued = debtBalanceOf(issuer, currencyKey);
        uint max = maxIssuableNomins(issuer, currencyKey);

        if (alreadyIssued >= max) {
            return 0;
        } else {
            return max.sub(alreadyIssued);
        }
    }

    /**
     * @notice The total SNX owned by this account, both escrowed and unescrowed,
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
            balance = balance.add(escrow.balanceOf(account));
        }

        return balance;
    }

    /**
     * @notice The number of SNX that are free to be transferred by an account.
     * @dev When issuing, escrowed SNX are locked first, then non-escrowed
     * SNX are locked last, but escrowed SNX are not transferable, so they are not included
     * in this calculation.
     */
    function transferableSynthetix(address account)
        public
        view
        rateNotStale("SNX")
        returns (uint)
    {
        // How many SNX do they have, excluding escrow?
        // Note: We're excluding escrow here because we're interested in their transferable amount
        // and escrowed SNX are not transferable.
        uint balance = tokenState.balanceOf(account);

        // How many of those will be locked by the amount they've issued?
        // Assuming issuance ratio is 20%, then issuing 20 SNX of value would require
        // 100 SNX to be locked in their wallet to maintain their collateralisation ratio
        // The locked synthetix value can exceed their balance.
        uint lockedSynthetixValue = debtBalanceOf(account, "SNX").divideDecimalRound(synthetixState.issuanceRatio());

        // If we exceed the balance, no SNX are transferable, otherwise the difference is.
        if (lockedSynthetixValue >= balance) {
            return 0;
        } else {
            return balance.sub(lockedSynthetixValue);
        }
    }

    // ========== MODIFIERS ==========

    modifier rateNotStale(bytes4 currencyKey) {
        require(!exchangeRates.rateIsStale(currencyKey), "Rate stale or nonexistant currency");
        _;
    }

    modifier onlyFeePool() {
        require(msg.sender == address(feePool), "Only fee pool allowed");
        _;
    }

    modifier notFeeAddress(address account) {
        require(account != feePool.FEE_ADDRESS(), "Fee address not allowed");
        _;
    }

    modifier onlyNomin() {
        bool isNomin = false;

        // No need to repeatedly call this function either
        for (uint8 i = 0; i < availableNomins.length; i++) {
            if (availableNomins[i] == msg.sender) {
                isNomin = true;
                break;
            }
        }

        require(isNomin, "Only nomin allowed");
        _;
    }

    // ========== EVENTS ==========

    event PreferredCurrencyChanged(address indexed account, bytes4 newPreferredCurrency);
    bytes32 constant PREFERREDCURRENCYCHANGED_SIG = keccak256("PreferredCurrencyChanged(address,bytes4)");
    function emitPreferredCurrencyChanged(address account, bytes4 newPreferredCurrency) internal {
        proxy._emit(abi.encode(newPreferredCurrency), 2, PREFERREDCURRENCYCHANGED_SIG, bytes32(account), 0, 0);
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
}
