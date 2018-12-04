/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       ExchangeRates.sol
version:    1.0
author:     Kevin Brown
date:       2018-09-12

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

A contract that any other contract in the Synthetix system can query
for the current market value of various assets, including
crypto assets as well as various fiat assets.

This contract assumes that rate updates will completely update
all rates to their current values. If a rate shock happens
on a single asset, the oracle will still push updated rates
for all other assets.

-----------------------------------------------------------------
*/

pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./SafeDecimalMath.sol";
import "./SelfDestructible.sol";

/**
 * @title The repository for exchange rates
 */
contract ExchangeRates is SelfDestructible {

    using SafeMath for uint;

    // Exchange rates stored by currency code, e.g. 'SNX', or 'sUSD'
    mapping(bytes4 => uint) public rates;

    // Update times stored by currency code, e.g. 'SNX', or 'sUSD'
    mapping(bytes4 => uint) public lastRateUpdateTimes;

    // The address of the oracle which pushes rate updates to this contract
    address public oracle;

    // Do not allow the oracle to submit times any further forward into the future than this constant.
    uint constant ORACLE_FUTURE_LIMIT = 10 minutes;

    // How long will the contract assume the rate of any asset is correct
    uint public rateStalePeriod = 3 hours;

    // Each participating currency in the XDR basket is represented as a currency key with
    // equal weighting.
    // There are 5 participating currencies, so we'll declare that clearly.
    bytes4[5] public xdrParticipants;

    //
    // ========== CONSTRUCTOR ==========

    /**
     * @dev Constructor
     * @param _owner The owner of this contract.
     * @param _oracle The address which is able to update rate information.
     * @param _currencyKeys The initial currency keys to store (in order).
     * @param _newRates The initial currency amounts for each currency (in order).
     */
    constructor(
        // SelfDestructible (Ownable)
        address _owner,

        // Oracle values - Allows for rate updates
        address _oracle,
        bytes4[] _currencyKeys,
        uint[] _newRates
    )
        /* Owned is initialised in SelfDestructible */
        SelfDestructible(_owner)
        public
    {
        require(_currencyKeys.length == _newRates.length, "Currency key length and rate length must match.");

        oracle = _oracle;

        // The sUSD rate is always 1 and is never stale.
        rates["sUSD"] = SafeDecimalMath.unit();
        lastRateUpdateTimes["sUSD"] = now;

        // These are the currencies that make up the XDR basket.
        // These are hard coded because:
        //  - This way users can depend on the calculation and know it won't change for this deployment of the contract.
        //  - Adding new currencies would likely introduce some kind of weighting factor, which
        //    isn't worth preemptively adding when all of the currencies in the current basket are weighted at 1.
        //  - The expectation is if this logic needs to be updated, we'll simply deploy a new version of this contract
        //    then point the system at the new version.
        xdrParticipants = [
            bytes4("sUSD"),
            bytes4("sAUD"),
            bytes4("sCHF"),
            bytes4("sEUR"),
            bytes4("sGBP")
        ];

        internalUpdateRates(_currencyKeys, _newRates, now);
    }

    /* ========== SETTERS ========== */

    /**
     * @notice Set the rates stored in this contract
     * @param currencyKeys The currency keys you wish to update the rates for (in order)
     * @param newRates The rates for each currency (in order)
     * @param timeSent The timestamp of when the update was sent, specified in seconds since epoch (e.g. the same as the now keyword in solidity).contract
     *                 This is useful because transactions can take a while to confirm, so this way we know how old the oracle's datapoint was exactly even
     *                 if it takes a long time for the transaction to confirm.
     */
    function updateRates(bytes4[] currencyKeys, uint[] newRates, uint timeSent)
        external
        onlyOracle
        returns(bool)
    {
        return internalUpdateRates(currencyKeys, newRates, timeSent);
    }

    /**
     * @notice Internal function which sets the rates stored in this contract
     * @param currencyKeys The currency keys you wish to update the rates for (in order)
     * @param newRates The rates for each currency (in order)
     * @param timeSent The timestamp of when the update was sent, specified in seconds since epoch (e.g. the same as the now keyword in solidity).contract
     *                 This is useful because transactions can take a while to confirm, so this way we know how old the oracle's datapoint was exactly even
     *                 if it takes a long time for the transaction to confirm.
     */
    function internalUpdateRates(bytes4[] currencyKeys, uint[] newRates, uint timeSent)
        internal
        returns(bool)
    {
        require(currencyKeys.length == newRates.length, "Currency key array length must match rates array length.");
        require(timeSent < (now + ORACLE_FUTURE_LIMIT), "Time is too far into the future");

        // Loop through each key and perform update.
        for (uint8 i = 0; i < currencyKeys.length; i++) {
            // Should not set any rate to zero ever, as no asset will ever be
            // truely worthless and still valid. In this scenario, we should
            // delete the rate and remove it from the system.
            require(newRates[i] != 0, "Zero is not a valid rate, please call deleteRate instead.");
            require(currencyKeys[i] != "sUSD", "Rate of sUSD cannot be updated, it's always UNIT.");

            rates[currencyKeys[i]] = newRates[i];
            lastRateUpdateTimes[currencyKeys[i]] = timeSent;
        }

        emit RatesUpdated(currencyKeys, newRates);

        // Now update our XDR rate.
        updateXDRRate(timeSent);

        return true;
    }

    /**
     * @notice Update the Synthetix Drawing Rights exchange rate based on other rates already updated.
     */
    function updateXDRRate(uint timeSent)
        internal
    {
        uint total = 0;

        for (uint i = 0; i < xdrParticipants.length; i++) {
            total = rates[xdrParticipants[i]].add(total);
        }

        // Set the rate
        rates["XDR"] = total;

        // Record that we updated the XDR rate.
        lastRateUpdateTimes["XDR"] = timeSent;

        // Emit our updated event separate to the others to save
        // moving data around between arrays.
        bytes4[] memory eventCurrencyCode = new bytes4[](1);
        eventCurrencyCode[0] = "XDR";

        uint[] memory eventRate = new uint[](1);
        eventRate[0] = rates["XDR"];

        emit RatesUpdated(eventCurrencyCode, eventRate);
    }

    /**
     * @notice Delete a rate stored in the contract
     * @param currencyKey The currency key you wish to delete the rate for
     */
    function deleteRate(bytes4 currencyKey)
        external
        onlyOracle
    {
        require(rates[currencyKey] > 0, "Rate is zero");

        delete rates[currencyKey];
        delete lastRateUpdateTimes[currencyKey];

        emit RateDeleted(currencyKey);
    }

    /**
     * @notice Set the Oracle that pushes the rate information to this contract
     * @param _oracle The new oracle address
     */
    function setOracle(address _oracle)
        external
        onlyOwner
    {
        oracle = _oracle;
        emit OracleUpdated(oracle);
    }

    /**
     * @notice Set the stale period on the updated rate variables
     * @param _time The new rateStalePeriod
     */
    function setRateStalePeriod(uint _time)
        external
        onlyOwner
    {
        rateStalePeriod = _time;
        emit RateStalePeriodUpdated(rateStalePeriod);
    }

    /* ========== VIEWS ========== */

    /**
     * @notice Retrieve the rate for a specific currency
     */
    function rateForCurrency(bytes4 currencyKey)
        public
        view
        returns (uint)
    {
        return rates[currencyKey];
    }

    /**
     * @notice Retrieve the rates for a list of currencies
     */
    function ratesForCurrencies(bytes4[] currencyKeys)
        public
        view
        returns (uint[])
    {
        uint[] memory _rates = new uint[](currencyKeys.length);

        for (uint8 i = 0; i < currencyKeys.length; i++) {
            _rates[i] = rates[currencyKeys[i]];
        }

        return _rates;
    }

    /**
     * @notice Retrieve a list of last update times for specific currencies
     */
    function lastRateUpdateTimeForCurrency(bytes4 currencyKey)
        public
        view
        returns (uint)
    {
        return lastRateUpdateTimes[currencyKey];
    }

    /**
     * @notice Retrieve the last update time for a specific currency
     */
    function lastRateUpdateTimesForCurrencies(bytes4[] currencyKeys)
        public
        view
        returns (uint[])
    {
        uint[] memory lastUpdateTimes = new uint[](currencyKeys.length);

        for (uint8 i = 0; i < currencyKeys.length; i++) {
            lastUpdateTimes[i] = lastRateUpdateTimes[currencyKeys[i]];
        }

        return lastUpdateTimes;
    }

    /**
     * @notice Check if a specific currency's rate hasn't been updated for longer than the stale period.
     */
    function rateIsStale(bytes4 currencyKey)
        external
        view
        returns (bool)
    {
        // sUSD is a special case and is never stale.
        if (currencyKey == "sUSD") return false;

        return lastRateUpdateTimes[currencyKey].add(rateStalePeriod) < now;
    }

    /**
     * @notice Check if any of the currency rates passed in haven't been updated for longer than the stale period.
     */
    function anyRateIsStale(bytes4[] currencyKeys)
        external
        view
        returns (bool)
    {
        // Loop through each key and check whether the data point is stale.
        uint256 i = 0;

        while (i < currencyKeys.length) {
            // sUSD is a special case and is never false
            if (currencyKeys[i] != "sUSD" && lastRateUpdateTimes[currencyKeys[i]].add(rateStalePeriod) < now) {
                return true;
            }
            i += 1;
        }

        return false;
    }

    /* ========== MODIFIERS ========== */

    modifier onlyOracle
    {
        require(msg.sender == oracle, "Only the oracle can perform this action");
        _;
    }

    /* ========== EVENTS ========== */

    event OracleUpdated(address newOracle);
    event RateStalePeriodUpdated(uint rateStalePeriod);
    event RatesUpdated(bytes4[] currencyKeys, uint[] newRates);
    event RateDeleted(bytes4 currencyKey);
}
