/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       HavvenState.sol
version:    1.0
author:     Kevin Brown
date:       2018-10-19

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

A contract that holds issuance state and preferred currency of 
users in the Havven system.

This contract is used side by side with the Havven contract
to make it easier to upgrade the contract logic while maintaining
issuance state.

The Havven contract is also quite large and on the edge of
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


import "./SafeDecimalMath.sol";
import "./State.sol";

/**
 * @title Havven State
 * @notice Stores issuance information and preferred currency information of the Havven contract.
 */
contract HavvenState is State {
    using SafeMath for uint;

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

    // Global debt pool tracking
    uint[] public debtLedger;

    // A quantity of nomins greater than this ratio
    // may not be issued against a given value of havvens.
    uint public issuanceRatio = SafeDecimalMath.unit() / 5;
    // No more nomins may be issued than the value of havvens backing them.
    uint constant MAX_ISSUANCE_RATIO = SafeDecimalMath.unit();

    // Users can specify their preferred currency, in which case all nomins they receive
    // will automatically exchange to that preferred currency upon receipt in their wallet
    mapping(address => bytes4) public preferredCurrency;

    /**
     * @dev Constructor
     * @param _owner The address which controls this contract.
     * @param _associatedContract The ERC20 contract whose state this composes.
     */
    constructor(address _owner, address _associatedContract)
        State(_owner, _associatedContract)
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
