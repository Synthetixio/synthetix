pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./SafeDecimalMath.sol";
import "./SelfDestructible.sol";

// AggregatorInterface from Chainlink represents a decentralized pricing network for a single currency keys
import "chainlink/contracts/interfaces/AggregatorInterface.sol";

/**
 * @title The repository for exchange rates
 */

contract ExchangeRates is SelfDestructible {


    using SafeMath for uint;
    using SafeDecimalMath for uint;

    struct RateAndUpdatedTime {
        uint216 rate;
        uint40 time;
    }

    // Exchange rates and update times stored by currency code, e.g. 'SNX', or 'sUSD'
    mapping(bytes32 => RateAndUpdatedTime) private _rates;

    // The address of the oracle which pushes rate updates to this contract
    address public oracle;

    // Decentralized oracle networks that feed into pricing aggregators
    mapping(bytes32 => AggregatorInterface) public aggregators;

    // List of configure aggregator keys for convenient iteration
    bytes32[] public aggregatorKeys;

    // Do not allow the oracle to submit times any further forward into the future than this constant.
    uint constant ORACLE_FUTURE_LIMIT = 10 minutes;

    // How long will the contract assume the rate of any asset is correct
    uint public rateStalePeriod = 3 hours;


    // Each participating currency in the XDR basket is represented as a currency key with
    // equal weighting.
    // There are 5 participating currencies, so we'll declare that clearly.
    bytes32[5] public xdrParticipants;

    // A conveience mapping for checking if a rate is a XDR participant
    mapping(bytes32 => bool) public isXDRParticipant;

    // For inverted prices, keep a mapping of their entry, limits and frozen status
    struct InversePricing {
        uint entryPoint;
        uint upperLimit;
        uint lowerLimit;
        bool frozen;
    }
    mapping(bytes32 => InversePricing) public inversePricing;
    bytes32[] public invertedKeys;

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
        bytes32[] _currencyKeys,
        uint[] _newRates
    )
        /* Owned is initialised in SelfDestructible */
        SelfDestructible(_owner)
        public
    {
        require(_currencyKeys.length == _newRates.length, "Currency key length and rate length must match.");

        oracle = _oracle;

        // The sUSD rate is always 1 and is never stale.
        _setRate("sUSD", SafeDecimalMath.unit(), now);

        // These are the currencies that make up the XDR basket.
        // These are hard coded because:
        //  - This way users can depend on the calculation and know it won't change for this deployment of the contract.
        //  - Adding new currencies would likely introduce some kind of weighting factor, which
        //    isn't worth preemptively adding when all of the currencies in the current basket are weighted at 1.
        //  - The expectation is if this logic needs to be updated, we'll simply deploy a new version of this contract
        //    then point the system at the new version.
        xdrParticipants = [
            bytes32("sUSD"),
            bytes32("sAUD"),
            bytes32("sCHF"),
            bytes32("sEUR"),
            bytes32("sGBP")
        ];

        // Mapping the XDR participants is cheaper than looping the xdrParticipants array to check if they exist
        isXDRParticipant[bytes32("sUSD")] = true;
        isXDRParticipant[bytes32("sAUD")] = true;
        isXDRParticipant[bytes32("sCHF")] = true;
        isXDRParticipant[bytes32("sEUR")] = true;
        isXDRParticipant[bytes32("sGBP")] = true;

        internalUpdateRates(_currencyKeys, _newRates, now);
    }

    function rates(bytes32 code) public view returns(uint256) {
        if (aggregators[code] != address(0)) {
            return uint(aggregators[code].latestAnswer() * 1e10);
        } else {
            return uint256(_rates[code].rate);
        }
    }

    function lastRateUpdateTimes(bytes32 code) public view returns(uint256) {
        if (aggregators[code] != address(0)) {
            return aggregators[code].latestTimestamp();
        } else {
            return uint256(_rates[code].time);
        }
    }

    function _setRate(bytes32 code, uint256 rate, uint256 time) internal {
        _rates[code] = RateAndUpdatedTime({
            rate: uint216(rate),
            time: uint40(time)
        });
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
    function updateRates(bytes32[] currencyKeys, uint[] newRates, uint timeSent)
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
    function internalUpdateRates(bytes32[] currencyKeys, uint[] newRates, uint timeSent)
        internal
        returns(bool)
    {
        require(currencyKeys.length == newRates.length, "Currency key array length must match rates array length.");
        require(timeSent < (now + ORACLE_FUTURE_LIMIT), "Time is too far into the future");

        bool recomputeXDRRate = false;

        // Loop through each key and perform update.
        for (uint i = 0; i < currencyKeys.length; i++) {
            bytes32 currencyKey = currencyKeys[i];

            // Should not set any rate to zero ever, as no asset will ever be
            // truely worthless and still valid. In this scenario, we should
            // delete the rate and remove it from the system.
            require(newRates[i] != 0, "Zero is not a valid rate, please call deleteRate instead.");
            require(currencyKey != "sUSD", "Rate of sUSD cannot be updated, it's always UNIT.");

            // We should only update the rate if it's at least the same age as the last rate we've got.
            if (timeSent < lastRateUpdateTimes(currencyKey)) {
                continue;
            }

            newRates[i] = rateOrInverted(currencyKey, newRates[i]);

            // Ok, go ahead with the update.
            _setRate(currencyKey, newRates[i], timeSent);

            // Flag if XDR needs to be recomputed. Note: sUSD is not sent and assumed $1
            if (!recomputeXDRRate && isXDRParticipant[currencyKey]) {
                recomputeXDRRate = true;
            }
        }

        emit RatesUpdated(currencyKeys, newRates);

        if (recomputeXDRRate) {
            // Now update our XDR rate.
            updateXDRRate(timeSent);
        }

        return true;
    }

    /**
     * @notice Internal function to get the inverted rate, if any, and mark an inverted
     *  key as frozen if either limits are reached.
     *
     * Inverted rates are ones that take a regular rate, perform a simple calculation (double entryPrice and
     * subtract the rate) on them and if the result of the calculation is over or under predefined limits, it freezes the
     * rate at that limit, preventing any future rate updates.
     *
     * For example, if we have an inverted rate iBTC with the following parameters set:
     * - entryPrice of 200
     * - upperLimit of 300
     * - lower of 100
     *
     * if this function is invoked with params iETH and 184 (or rather 184e18),
     * then the rate would be: 200 * 2 - 184 = 216. 100 < 216 < 200, so the rate would be 216,
     * and remain unfrozen.
     *
     * If this function is then invoked with params iETH and 301 (or rather 301e18),
     * then the rate would be: 200 * 2 - 301 = 99. 99 < 100, so the rate would be 100 and the
     * rate would become frozen, no longer accepting future price updates until the synth is unfrozen
     * by the owner function: setInversePricing().
     *
     * @param currencyKey The price key to lookup
     * @param rate The rate for the given price key
     */
    function rateOrInverted(bytes32 currencyKey, uint rate) internal returns (uint) {
        // if an inverse mapping exists, adjust the price accordingly
        InversePricing storage inverse = inversePricing[currencyKey];
        if (inverse.entryPoint <= 0) {
            return rate;
        }

        // set the rate to the current rate initially (if it's frozen, this is what will be returned)
        uint newInverseRate = rates(currencyKey);

        // get the new inverted rate if not frozen
        if (!inverse.frozen) {
            uint doubleEntryPoint = inverse.entryPoint.mul(2);
            if (doubleEntryPoint <= rate) {
                // avoid negative numbers for unsigned ints, so set this to 0
                // which by the requirement that lowerLimit be > 0 will
                // cause this to freeze the price to the lowerLimit
                newInverseRate = 0;
            } else {
                newInverseRate = doubleEntryPoint.sub(rate);
            }

            // now if new rate hits our limits, set it to the limit and freeze
            if (newInverseRate >= inverse.upperLimit) {
                newInverseRate = inverse.upperLimit;
            } else if (newInverseRate <= inverse.lowerLimit) {
                newInverseRate = inverse.lowerLimit;
            }

            if (newInverseRate == inverse.upperLimit || newInverseRate == inverse.lowerLimit) {
                inverse.frozen = true;
                emit InversePriceFrozen(currencyKey);
            }
        }

        return newInverseRate;
    }

    /**
     * @notice Update the Synthetix Drawing Rights exchange rate based on other rates already updated.
     */
    function updateXDRRate(uint timeSent)
        internal
    {
        uint total = 0;

        for (uint i = 0; i < xdrParticipants.length; i++) {
            total = rates(xdrParticipants[i]).add(total);
        }

        // Set the rate and update time
        _setRate("XDR", total, timeSent);

        // Emit our updated event separate to the others to save
        // moving data around between arrays.
        bytes32[] memory eventCurrencyCode = new bytes32[](1);
        eventCurrencyCode[0] = "XDR";

        uint[] memory eventRate = new uint[](1);
        eventRate[0] = rates("XDR");

        emit RatesUpdated(eventCurrencyCode, eventRate);
    }

    /**
     * @notice Delete a rate stored in the contract
     * @param currencyKey The currency key you wish to delete the rate for
     */
    function deleteRate(bytes32 currencyKey)
        external
        onlyOracle
    {
        require(rates(currencyKey) > 0, "Rate is zero");

        delete _rates[currencyKey];

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

    /**
     * @notice Set an inverse price up for the currency key.
     *
     * An inverse price is one which has an entryPoint, an uppper and a lower limit. Each update, the
     * rate is calculated as double the entryPrice minus the current rate. If this calculation is
     * above or below the upper or lower limits respectively, then the rate is frozen, and no more
     * rate updates will be accepted.
     *
     * @param currencyKey The currency to update
     * @param entryPoint The entry price point of the inverted price
     * @param upperLimit The upper limit, at or above which the price will be frozen
     * @param lowerLimit The lower limit, at or below which the price will be frozen
     * @param freeze Whether or not to freeze this rate immediately. Note: no frozen event will be configured
     * @param freezeAtUpperLimit When the freeze flag is true, this flag indicates whether the rate
     * to freeze at is the upperLimit or lowerLimit..
     */
    function setInversePricing(bytes32 currencyKey, uint entryPoint, uint upperLimit, uint lowerLimit, bool freeze, bool freezeAtUpperLimit)
        external onlyOwner
    {
        require(entryPoint > 0, "entryPoint must be above 0");
        require(lowerLimit > 0, "lowerLimit must be above 0");
        require(upperLimit > entryPoint, "upperLimit must be above the entryPoint");
        require(upperLimit < entryPoint.mul(2), "upperLimit must be less than double entryPoint");
        require(lowerLimit < entryPoint, "lowerLimit must be below the entryPoint");

        if (inversePricing[currencyKey].entryPoint <= 0) {
            // then we are adding a new inverse pricing, so add this
            invertedKeys.push(currencyKey);
        }
        inversePricing[currencyKey].entryPoint = entryPoint;
        inversePricing[currencyKey].upperLimit = upperLimit;
        inversePricing[currencyKey].lowerLimit = lowerLimit;
        inversePricing[currencyKey].frozen = freeze;

        emit InversePriceConfigured(currencyKey, entryPoint, upperLimit, lowerLimit);

        // When indicating to freeze, we need to know the rate to freeze it at - either upper or lower
        // this is useful in situations where ExchangeRates is updated and there are existing inverted
        // rates already frozen in the current contract that need persisting across the upgrade
        if (freeze) {
            emit InversePriceFrozen(currencyKey);

            _setRate(currencyKey, freezeAtUpperLimit ? upperLimit : lowerLimit, now);
        }
    }

    /**
     * @notice Remove an inverse price for the currency key
     * @param currencyKey The currency to remove inverse pricing for
     */
    function removeInversePricing(bytes32 currencyKey) external onlyOwner
    {
        require(inversePricing[currencyKey].entryPoint > 0, "No inverted price exists");

        inversePricing[currencyKey].entryPoint = 0;
        inversePricing[currencyKey].upperLimit = 0;
        inversePricing[currencyKey].lowerLimit = 0;
        inversePricing[currencyKey].frozen = false;

        // now remove inverted key from array
        bool wasRemoved = removeFromArray(currencyKey, invertedKeys);

        if (wasRemoved) {
            emit InversePriceConfigured(currencyKey, 0, 0, 0);
        }
    }

    /**
     * @notice Add a pricing aggregator for the given key. Note: existing aggregators may be overridden.
     * @param currencyKey The currency key to add an aggregator for
     */
    function addAggregator(bytes32 currencyKey, address aggregatorAddress) external onlyOwner {
        AggregatorInterface aggregator = AggregatorInterface(aggregatorAddress);
        require(aggregator.latestTimestamp() >= 0, "Given Aggregator is invalid");
        if (aggregators[currencyKey] == address(0)) {
            aggregatorKeys.push(currencyKey);
        }
        aggregators[currencyKey] = aggregator;
        emit AggregatorAdded(currencyKey, aggregator);
    }

    /**
     * @notice Remove a single value from an array by iterating through until it is found.
     * @param entry The entry to find
     * @param array The array to mutate
     * @return bool Whether or not the entry was found and removed
     */
    function removeFromArray(bytes32 entry, bytes32[] storage array) internal returns (bool) {
        for (uint i = 0; i < array.length; i++) {
            if (array[i] == entry) {
                delete array[i];

                // Copy the last key into the place of the one we just deleted
                // If there's only one key, this is array[0] = array[0].
                // If we're deleting the last one, it's also a NOOP in the same way.
                array[i] = array[array.length - 1];

                // Decrease the size of the array by one.
                array.length--;

                return true;
            }
        }
        return false;
    }
    /**
     * @notice Remove a pricing aggregator for the given key
     * @param currencyKey THe currency key to remove an aggregator for
     */
    function removeAggregator(bytes32 currencyKey) external onlyOwner {
        address aggregator = aggregators[currencyKey];
        require(aggregator != address(0), "No aggregator exists for key");
        delete aggregators[currencyKey];

        bool wasRemoved = removeFromArray(currencyKey, aggregatorKeys);

        if (wasRemoved) {
            emit AggregatorRemoved(currencyKey, aggregator);
        }
    }

    /* ========== VIEWS ========== */

    /**
     * @notice A function that lets you easily convert an amount in a source currency to an amount in the destination currency
     * @param sourceCurrencyKey The currency the amount is specified in
     * @param sourceAmount The source amount, specified in UNIT base
     * @param destinationCurrencyKey The destination currency
     */
    function effectiveValue(bytes32 sourceCurrencyKey, uint sourceAmount, bytes32 destinationCurrencyKey)
        public
        view
        rateNotStale(sourceCurrencyKey)
        rateNotStale(destinationCurrencyKey)
        returns (uint)
    {
        // If there's no change in the currency, then just return the amount they gave us
        if (sourceCurrencyKey == destinationCurrencyKey) return sourceAmount;

        // Calculate the effective value by going from source -> USD -> destination
        return sourceAmount.multiplyDecimalRound(rateForCurrency(sourceCurrencyKey))
            .divideDecimalRound(rateForCurrency(destinationCurrencyKey));
    }

    /**
     * @notice Retrieve the rate for a specific currency
     */
    function rateForCurrency(bytes32 currencyKey)
        public
        view
        returns (uint)
    {
        return rates(currencyKey);
    }

    /**
     * @notice Retrieve the rates for a list of currencies
     */
    function ratesForCurrencies(bytes32[] currencyKeys)
        public
        view
        returns (uint[])
    {
        uint[] memory _localRates = new uint[](currencyKeys.length);

        for (uint i = 0; i < currencyKeys.length; i++) {
            _localRates[i] = rates(currencyKeys[i]);
        }

        return _localRates;
    }

    /**
     * @notice Retrieve the rates and isAnyStale for a list of currencies
     */
    function ratesAndStaleForCurrencies(bytes32[] currencyKeys)
        public
        view
        returns (uint[], bool)
    {
        uint[] memory _localRates = new uint[](currencyKeys.length);

        bool anyRateStale = false;
        uint period = rateStalePeriod;
        for (uint i = 0; i < currencyKeys.length; i++) {
            RateAndUpdatedTime memory rateAndUpdateTime = _rates[currencyKeys[i]];
            _localRates[i] = uint256(rateAndUpdateTime.rate);
            if (!anyRateStale) {
                anyRateStale = (currencyKeys[i] != "sUSD" && uint256(rateAndUpdateTime.time).add(period) < now);
            }
        }

        return (_localRates, anyRateStale);
    }

    /**
     * @notice Check if a specific currency's rate hasn't been updated for longer than the stale period.
     */
    function rateIsStale(bytes32 currencyKey)
        public
        view
        returns (bool)
    {
        // sUSD is a special case and is never stale.
        if (currencyKey == "sUSD") return false;

        return lastRateUpdateTimes(currencyKey).add(rateStalePeriod) < now;
    }

    /**
     * @notice Check if any rate is frozen (cannot be exchanged into)
     */
    function rateIsFrozen(bytes32 currencyKey)
        external
        view
        returns (bool)
    {
        return inversePricing[currencyKey].frozen;
    }


    /**
     * @notice Check if any of the currency rates passed in haven't been updated for longer than the stale period.
     */
    function anyRateIsStale(bytes32[] currencyKeys)
        external
        view
        returns (bool)
    {
        // Loop through each key and check whether the data point is stale.
        uint256 i = 0;

        while (i < currencyKeys.length) {
            // sUSD is a special case and is never false
            if (currencyKeys[i] != "sUSD" && lastRateUpdateTimes(currencyKeys[i]).add(rateStalePeriod) < now) {
                return true;
            }
            i += 1;
        }

        return false;
    }

    /* ========== MODIFIERS ========== */

    modifier rateNotStale(bytes32 currencyKey) {
        require(!rateIsStale(currencyKey), "Rate stale or nonexistant currency");
        _;
    }

    modifier onlyOracle
    {
        require(msg.sender == oracle, "Only the oracle can perform this action");
        _;
    }

    /* ========== EVENTS ========== */

    event OracleUpdated(address newOracle);
    event RateStalePeriodUpdated(uint rateStalePeriod);
    event RatesUpdated(bytes32[] currencyKeys, uint[] newRates);
    event RateDeleted(bytes32 currencyKey);
    event InversePriceConfigured(bytes32 currencyKey, uint entryPoint, uint upperLimit, uint lowerLimit);
    event InversePriceFrozen(bytes32 currencyKey);
    event AggregatorAdded(bytes32 currencyKey, address aggregator);
    event AggregatorRemoved(bytes32 currencyKey, address aggregator);
}
