pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./SafeDecimalMath.sol";
import "./SelfDestructible.sol";

// AggregatorInterface from Chainlink represents a decentralized pricing network for a single currency key
import "chainlink/contracts/interfaces/AggregatorInterface.sol";


// https://docs.synthetix.io/contracts/ExchangeRates
contract ExchangeRates is SelfDestructible {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    struct RateAndUpdatedTime {
        uint216 rate;
        uint40 time;
    }

    // Exchange rates and update times stored by currency code, e.g. 'SNX', or 'sUSD'
    mapping(bytes32 => mapping(uint => RateAndUpdatedTime)) private _rates;

    // The address of the oracle which pushes rate updates to this contract
    address public oracle;

    // Decentralized oracle networks that feed into pricing aggregators
    mapping(bytes32 => AggregatorInterface) public aggregators;

    // List of aggregator keys for convenient iteration
    bytes32[] public aggregatorKeys;

    // Do not allow the oracle to submit times any further forward into the future than this constant.
    uint private constant ORACLE_FUTURE_LIMIT = 10 minutes;

    // How long will the contract assume the rate of any asset is correct
    uint public rateStalePeriod = 3 hours;

    // For inverted prices, keep a mapping of their entry, limits and frozen status
    struct InversePricing {
        uint entryPoint;
        uint upperLimit;
        uint lowerLimit;
        bool frozen;
    }
    mapping(bytes32 => InversePricing) public inversePricing;
    bytes32[] public invertedKeys;

    mapping(bytes32 => uint) currentRoundForRate;

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
        public
        /* Owned is initialised in SelfDestructible */
        SelfDestructible(_owner)
    {
        require(_currencyKeys.length == _newRates.length, "Currency key length and rate length must match.");

        oracle = _oracle;

        // The sUSD rate is always 1 and is never stale.
        _setRate("sUSD", SafeDecimalMath.unit(), now);

        internalUpdateRates(_currencyKeys, _newRates, now);
    }

    /* ========== SETTERS ========== */

    /**
     * @notice Set the Oracle that pushes the rate information to this contract
     * @param _oracle The new oracle address
     */
    function setOracle(address _oracle) external onlyOwner {
        oracle = _oracle;
        emit OracleUpdated(oracle);
    }

    /**
     * @notice Set the stale period on the updated rate variables
     * @param _time The new rateStalePeriod
     */
    function setRateStalePeriod(uint _time) external onlyOwner {
        rateStalePeriod = _time;
        emit RateStalePeriodUpdated(rateStalePeriod);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /**
     * @notice Set the rates stored in this contract
     * @param currencyKeys The currency keys you wish to update the rates for (in order)
     * @param newRates The rates for each currency (in order)
     * @param timeSent The timestamp of when the update was sent, specified in seconds since epoch (e.g. the same as the now keyword in solidity).
     *                 This is useful because transactions can take a while to confirm, so this way we know how old the oracle's datapoint was exactly even
     *                 if it takes a long time for the transaction to confirm.
     */
    function updateRates(bytes32[] currencyKeys, uint[] newRates, uint timeSent) external onlyOracle returns (bool) {
        return internalUpdateRates(currencyKeys, newRates, timeSent);
    }

    /**
     * @notice Delete a rate stored in the contract
     * @param currencyKey The currency key you wish to delete the rate for
     */
    function deleteRate(bytes32 currencyKey) external onlyOracle {
        require(getRate(currencyKey) > 0, "Rate is zero");

        delete _rates[currencyKey][currentRoundForRate[currencyKey]];

        currentRoundForRate[currencyKey]--;

        emit RateDeleted(currencyKey);
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
    function setInversePricing(
        bytes32 currencyKey,
        uint entryPoint,
        uint upperLimit,
        uint lowerLimit,
        bool freeze,
        bool freezeAtUpperLimit
    ) external onlyOwner {
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
    function removeInversePricing(bytes32 currencyKey) external onlyOwner {
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
     * @notice Remove a pricing aggregator for the given key
     * @param currencyKey The currency key to remove an aggregator for
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

    function getLastRoundIdBeforeElapsedSecs(
        bytes32 currencyKey,
        uint startingRoundId,
        uint startingTimestamp,
        uint timediff
    ) external view returns (uint) {
        uint roundId = startingRoundId;
        uint nextTimestamp = 0;
        while (true) {
            (, nextTimestamp) = getRateAndTimestampAtRound(currencyKey, roundId + 1);
            // if there's no new round, then the previous roundId was the latest
            if (nextTimestamp == 0 || nextTimestamp > startingTimestamp + timediff) {
                return roundId;
            }
            roundId++;
        }
        return roundId;
    }

    function getCurrentRoundId(bytes32 currencyKey) external view returns (uint) {
        if (aggregators[currencyKey] != address(0)) {
            AggregatorInterface aggregator = aggregators[currencyKey];
            return aggregator.latestRound();
        } else {
            return currentRoundForRate[currencyKey];
        }
    }

    function effectiveValueAtRound(
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey,
        uint roundIdForSrc,
        uint roundIdForDest
    ) external view rateNotStale(sourceCurrencyKey) rateNotStale(destinationCurrencyKey) returns (uint) {
        // If there's no change in the currency, then just return the amount they gave us
        if (sourceCurrencyKey == destinationCurrencyKey) return sourceAmount;

        (uint srcRate, ) = getRateAndTimestampAtRound(sourceCurrencyKey, roundIdForSrc);
        (uint destRate, ) = getRateAndTimestampAtRound(destinationCurrencyKey, roundIdForDest);
        // Calculate the effective value by going from source -> USD -> destination
        return sourceAmount.multiplyDecimalRound(srcRate).divideDecimalRound(destRate);
    }

    function rateAndTimestampAtRound(bytes32 currencyKey, uint roundId) external view returns (uint rate, uint time) {
        return getRateAndTimestampAtRound(currencyKey, roundId);
    }

    /* ========== VIEWS ========== */

    /**
     * @notice Retrieves the timestamp the given rate was last updated.
     */
    function lastRateUpdateTimes(bytes32 currencyKey) public view returns (uint256) {
        return getRateAndUpdatedTime(currencyKey).time;
    }

    /**
     * @notice Retrieve the last update time for a list of currencies
     */
    function lastRateUpdateTimesForCurrencies(bytes32[] currencyKeys) public view returns (uint[]) {
        uint[] memory lastUpdateTimes = new uint[](currencyKeys.length);

        for (uint i = 0; i < currencyKeys.length; i++) {
            lastUpdateTimes[i] = lastRateUpdateTimes(currencyKeys[i]);
        }

        return lastUpdateTimes;
    }

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
        return
            sourceAmount.multiplyDecimalRound(getRate(sourceCurrencyKey)).divideDecimalRound(
                getRate(destinationCurrencyKey)
            );
    }

    /**
     * @notice Retrieve the rate for a specific currency
     */
    function rateForCurrency(bytes32 currencyKey) external view returns (uint) {
        return getRateAndUpdatedTime(currencyKey).rate;
    }

    /**
     * @notice Retrieve the rates for a list of currencies
     */
    function ratesForCurrencies(bytes32[] currencyKeys) external view returns (uint[]) {
        uint[] memory _localRates = new uint[](currencyKeys.length);

        for (uint i = 0; i < currencyKeys.length; i++) {
            _localRates[i] = getRate(currencyKeys[i]);
        }

        return _localRates;
    }

    /**
     * @notice Retrieve the rates and isAnyStale for a list of currencies
     */
    function ratesAndStaleForCurrencies(bytes32[] currencyKeys) external view returns (uint[], bool) {
        uint[] memory _localRates = new uint[](currencyKeys.length);

        bool anyRateStale = false;
        uint period = rateStalePeriod;
        for (uint i = 0; i < currencyKeys.length; i++) {
            RateAndUpdatedTime memory rateAndUpdateTime = getRateAndUpdatedTime(currencyKeys[i]);
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
    function rateIsStale(bytes32 currencyKey) public view returns (bool) {
        // sUSD is a special case and is never stale.
        if (currencyKey == "sUSD") return false;

        return lastRateUpdateTimes(currencyKey).add(rateStalePeriod) < now;
    }

    /**
     * @notice Check if any rate is frozen (cannot be exchanged into)
     */
    function rateIsFrozen(bytes32 currencyKey) external view returns (bool) {
        return inversePricing[currencyKey].frozen;
    }

    /**
     * @notice Check if any of the currency rates passed in haven't been updated for longer than the stale period.
     */
    function anyRateIsStale(bytes32[] currencyKeys) external view returns (bool) {
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

    /* ========== INTERNAL FUNCTIONS ========== */

    function _setRate(bytes32 currencyKey, uint256 rate, uint256 time) internal {
        // Note: this will effectively start the rounds at 1, which matches Chainlink's Agggregators
        currentRoundForRate[currencyKey]++;

        _rates[currencyKey][currentRoundForRate[currencyKey]] = RateAndUpdatedTime({
            rate: uint216(rate),
            time: uint40(time)
        });
    }

    /**
     * @notice Internal function which sets the rates stored in this contract
     * @param currencyKeys The currency keys you wish to update the rates for (in order)
     * @param newRates The rates for each currency (in order)
     * @param timeSent The timestamp of when the update was sent, specified in seconds since epoch (e.g. the same as the now keyword in solidity).contract
     *                 This is useful because transactions can take a while to confirm, so this way we know how old the oracle's datapoint was exactly even
     *                 if it takes a long time for the transaction to confirm.
     */
    function internalUpdateRates(bytes32[] currencyKeys, uint[] newRates, uint timeSent) internal returns (bool) {
        require(currencyKeys.length == newRates.length, "Currency key array length must match rates array length.");
        require(timeSent < (now + ORACLE_FUTURE_LIMIT), "Time is too far into the future");

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
        }

        emit RatesUpdated(currencyKeys, newRates);

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
        uint newInverseRate = getRate(currencyKey);

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

    function getRateAndUpdatedTime(bytes32 currencyKey) internal view returns (RateAndUpdatedTime) {
        if (aggregators[currencyKey] != address(0)) {
            return
                RateAndUpdatedTime({
                    rate: uint216(aggregators[currencyKey].latestAnswer() * 1e10),
                    time: uint40(aggregators[currencyKey].latestTimestamp())
                });
        } else {
            return _rates[currencyKey][currentRoundForRate[currencyKey]];
        }
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

    function getRateAndTimestampAtRound(bytes32 currencyKey, uint roundId) internal view returns (uint rate, uint time) {
        if (aggregators[currencyKey] != address(0)) {
            AggregatorInterface aggregator = aggregators[currencyKey];
            return (uint(aggregator.getAnswer(roundId) * 1e10), aggregator.getTimestamp(roundId));
        } else {
            RateAndUpdatedTime storage update = _rates[currencyKey][roundId];
            return (update.rate, update.time);
        }
    }

    function getRate(bytes32 currencyKey) internal view returns (uint256) {
        return getRateAndUpdatedTime(currencyKey).rate;
    }

    /* ========== MODIFIERS ========== */

    modifier rateNotStale(bytes32 currencyKey) {
        require(!rateIsStale(currencyKey), "Rate stale or nonexistant currency");
        _;
    }

    modifier onlyOracle {
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
