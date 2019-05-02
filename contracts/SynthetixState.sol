/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       SynthetixState.sol
version:    1.0
author:     Kevin Brown
date:       2018-10-19

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

A contract that holds issuance state and preferred currency of
users in the Synthetix system.

This contract is used side by side with the Synthetix contract
to make it easier to upgrade the contract logic while maintaining
issuance state.

The Synthetix contract is also quite large and on the edge of
being beyond the contract size limit without moving this information
out to another contract.

The first deployed contract would create this state contract,
using it as its store of issuance data.

When a new contract is deployed, it links to the existing
state contract, whose owner would then change its associated
contract to the new one.

-----------------------------------------------------------------
*/

pragma solidity 0.4.25;

import "./Synthetix.sol";
import "./LimitedSetup.sol";
import "./SafeDecimalMath.sol";
import "./State.sol";
import "./ISynthetixState.sol";

/**\
 * @title Synthetix State
 * @notice Stores issuance information and preferred currency information of the Synthetix contract.
 */
contract SynthetixState is ISynthetixState, State, LimitedSetup {


    using SafeMath for uint;
    using SafeDecimalMath for uint;

    // Issued synth balances for individual fee entitlements and exit price calculations
    mapping(address => IssuanceData) public issuanceData;

    // The total count of people that have outstanding issued synths in any flavour
    uint public totalIssuerCount;

    // Global debt pool tracking
    uint[] public debtLedger;

    // Import state
    uint public importedXDRAmount;

    // A quantity of synths greater than this ratio
    // may not be issued against a given value of SNX.
    uint public issuanceRatio = SafeDecimalMath.unit() / 5;
    // No more synths may be issued than the value of SNX backing them.
    uint constant MAX_ISSUANCE_RATIO = SafeDecimalMath.unit();

    // Users can specify their preferred currency, in which case all synths they receive
    // will automatically exchange to that preferred currency upon receipt in their wallet
    mapping(address => bytes4) public preferredCurrency;

    /**
     * @dev Constructor
     * @param _owner The address which controls this contract.
     * @param _associatedContract The ERC20 contract whose state this composes.
     */
    constructor(address _owner, address _associatedContract)
        State(_owner, _associatedContract)
        LimitedSetup(1 weeks)
        public
    {}

    /* ========== SETTERS ========== */

    /**
     * @notice Set issuance data for an address
     * @dev Only the associated contract may call this.
     * @param account The address to set the data for.
     * @param initialDebtOwnership The initial debt ownership for this address.
     */
    function setCurrentIssuanceData(address account, uint initialDebtOwnership)
        external
        onlyAssociatedContract
    {
        issuanceData[account].initialDebtOwnership = initialDebtOwnership;
        issuanceData[account].debtEntryIndex = debtLedger.length;
    }

    /**
     * @notice Clear issuance data for an address
     * @dev Only the associated contract may call this.
     * @param account The address to clear the data for.
     */
    function clearIssuanceData(address account)
        external
        onlyAssociatedContract
    {
        delete issuanceData[account];
    }

    /**
     * @notice Increment the total issuer count
     * @dev Only the associated contract may call this.
     */
    function incrementTotalIssuerCount()
        external
        onlyAssociatedContract
    {
        totalIssuerCount = totalIssuerCount.add(1);
    }

    /**
     * @notice Decrement the total issuer count
     * @dev Only the associated contract may call this.
     */
    function decrementTotalIssuerCount()
        external
        onlyAssociatedContract
    {
        totalIssuerCount = totalIssuerCount.sub(1);
    }

    /**
     * @notice Append a value to the debt ledger
     * @dev Only the associated contract may call this.
     * @param value The new value to be added to the debt ledger.
     */
    function appendDebtLedgerValue(uint value)
        external
        onlyAssociatedContract
    {
        debtLedger.push(value);
    }

    /**
     * @notice Set preferred currency for a user
     * @dev Only the associated contract may call this.
     * @param account The account to set the preferred currency for
     * @param currencyKey The new preferred currency
     */
    function setPreferredCurrency(address account, bytes4 currencyKey)
        external
        onlyAssociatedContract
    {
        preferredCurrency[account] = currencyKey;
    }

    /**
     * @notice Set the issuanceRatio for issuance calculations.
     * @dev Only callable by the contract owner.
     */
    function setIssuanceRatio(uint _issuanceRatio)
        external
        onlyOwner
    {
        require(_issuanceRatio <= MAX_ISSUANCE_RATIO, "New issuance ratio cannot exceed MAX_ISSUANCE_RATIO");
        issuanceRatio = _issuanceRatio;
        emit IssuanceRatioUpdated(_issuanceRatio);
    }

    /**
     * @notice Import issuer data from the old Synthetix contract before multicurrency
     * @dev Only callable by the contract owner, and only for 1 week after deployment.
     */
    function importIssuerData(address[] accounts, uint[] sUSDAmounts)
        external
        onlyOwner
        onlyDuringSetup
    {
        require(accounts.length == sUSDAmounts.length, "Length mismatch");

        for (uint8 i = 0; i < accounts.length; i++) {
            _addToDebtRegister(accounts[i], sUSDAmounts[i]);
        }
    }

    /**
     * @notice Import issuer data from the old Synthetix contract before multicurrency
     * @dev Only used from importIssuerData above, meant to be disposable
     */
    function _addToDebtRegister(address account, uint amount)
        internal
    {
        // This code is duplicated from Synthetix so that we can call it directly here
        // during setup only.
        Synthetix synthetix = Synthetix(associatedContract);

        // What is the value of the requested debt in XDRs?
        uint xdrValue = synthetix.effectiveValue("sUSD", amount, "XDR");

        // What is the value that we've previously imported?
        uint totalDebtIssued = importedXDRAmount;

        // What will the new total be including the new value?
        uint newTotalDebtIssued = xdrValue.add(totalDebtIssued);

        // Save that for the next import.
        importedXDRAmount = newTotalDebtIssued;

        // What is their percentage (as a high precision int) of the total debt?
        uint debtPercentage = xdrValue.divideDecimalRoundPrecise(newTotalDebtIssued);

        // And what effect does this percentage have on the global debt holding of other issuers?
        // The delta specifically needs to not take into account any existing debt as it's already
        // accounted for in the delta from when they issued previously.
        // The delta is a high precision integer.
        uint delta = SafeDecimalMath.preciseUnit().sub(debtPercentage);

        uint existingDebt = synthetix.debtBalanceOf(account, "XDR");

        // And what does their debt ownership look like including this previous stake?
        if (existingDebt > 0) {
            debtPercentage = xdrValue.add(existingDebt).divideDecimalRoundPrecise(newTotalDebtIssued);
        }

        // Are they a new issuer? If so, record them.
        if (issuanceData[account].initialDebtOwnership == 0) {
            totalIssuerCount = totalIssuerCount.add(1);
        }

        // Save the debt entry parameters
        issuanceData[account].initialDebtOwnership = debtPercentage;
        issuanceData[account].debtEntryIndex = debtLedger.length;

        // And if we're the first, push 1 as there was no effect to any other holders, otherwise push
        // the change for the rest of the debt holders. The debt ledger holds high precision integers.
        if (debtLedger.length > 0) {
            debtLedger.push(
                debtLedger[debtLedger.length - 1].multiplyDecimalRoundPrecise(delta)
            );
        } else {
            debtLedger.push(SafeDecimalMath.preciseUnit());
        }
    }

    /* ========== VIEWS ========== */

    /**
     * @notice Retrieve the length of the debt ledger array
     */
    function debtLedgerLength()
        external
        view
        returns (uint)
    {
        return debtLedger.length;
    }

    /**
     * @notice Retrieve the most recent entry from the debt ledger
     */
    function lastDebtLedgerEntry()
        external
        view
        returns (uint)
    {
        return debtLedger[debtLedger.length - 1];
    }

    /**
     * @notice Query whether an account has issued and has an outstanding debt balance
     * @param account The address to query for
     */
    function hasIssued(address account)
        external
        view
        returns (bool)
    {
        return issuanceData[account].initialDebtOwnership > 0;
    }

    event IssuanceRatioUpdated(uint newRatio);
}
