pragma solidity ^0.5.16;

// Libraries
import "./SafeDecimalMath.sol";

// Inheritance
import "./BaseDebtCache.sol";

// https://docs.synthetix.io/contracts/source/contracts/debtcache
contract DebtCache is BaseDebtCache {
    using SafeDecimalMath for uint;

    bytes32 public constant CONTRACT_NAME = "DebtCache";

    constructor(address _owner, address _resolver) public BaseDebtCache(_owner, _resolver) {}

    bytes32 internal constant EXCLUDED_DEBT_KEY = "EXCLUDED_DEBT";
    bytes32 internal constant FUTURES_DEBT_KEY = "FUTURES_DEBT";

    /* ========== MUTATIVE FUNCTIONS ========== */

    // This function exists in case a synth is ever somehow removed without its snapshot being updated.
    function purgeCachedSynthDebt(bytes32 currencyKey) external onlyOwner {
        require(issuer().synths(currencyKey) == ISynth(0), "Synth exists");
        delete _cachedSynthDebt[currencyKey];
    }

    function takeDebtSnapshot() external requireSystemActiveIfNotOwner {
        bytes32[] memory currencyKeys = issuer().availableCurrencyKeys();
        (uint[] memory values, uint futuresDebt, uint excludedDebt, bool isInvalid) = _currentSynthDebts(currencyKeys);

        // The total SNX-backed debt is the debt of futures markets plus the debt of circulating synths.
        uint snxCollateralDebt = futuresDebt;
        _cachedSynthDebt[FUTURES_DEBT_KEY] = futuresDebt;
        uint numValues = values.length;
        for (uint i; i < numValues; i++) {
            uint value = values[i];
            snxCollateralDebt = snxCollateralDebt.add(value);
            _cachedSynthDebt[currencyKeys[i]] = value;
        }

        // Subtract out the excluded non-SNX backed debt from our total
        _cachedSynthDebt[EXCLUDED_DEBT_KEY] = excludedDebt;
        uint newDebt = snxCollateralDebt.floorsub(excludedDebt);
        _cachedDebt = newDebt;
        _cacheTimestamp = block.timestamp;
        emit DebtCacheUpdated(newDebt);
        emit DebtCacheSnapshotTaken(block.timestamp);

        // (in)validate the cache if necessary
        _updateDebtCacheValidity(isInvalid);
    }

    function updateCachedSynthDebts(bytes32[] calldata currencyKeys) external requireSystemActiveIfNotOwner {
        (uint[] memory rates, bool anyRateInvalid) = exchangeRates().ratesAndInvalidForCurrencies(currencyKeys);
        _updateCachedSynthDebtsWithRates(currencyKeys, rates, anyRateInvalid, false, false);
    }

    function updateCachedSynthDebtWithRate(bytes32 currencyKey, uint currencyRate) external onlyIssuer {
        bytes32[] memory synthKeyArray = new bytes32[](1);
        synthKeyArray[0] = currencyKey;
        uint[] memory synthRateArray = new uint[](1);
        synthRateArray[0] = currencyRate;
        _updateCachedSynthDebtsWithRates(synthKeyArray, synthRateArray, false, false, false);
    }

    function updateCachedSynthDebtsWithRates(bytes32[] calldata currencyKeys, uint[] calldata currencyRates)
        external
        onlyIssuerOrExchanger
    {
        _updateCachedSynthDebtsWithRates(currencyKeys, currencyRates, false, false, false);
    }

    function updateDebtCacheValidity(bool currentlyInvalid) external onlyIssuer {
        _updateDebtCacheValidity(currentlyInvalid);
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function _updateDebtCacheValidity(bool currentlyInvalid) internal {
        if (_cacheInvalid != currentlyInvalid) {
            _cacheInvalid = currentlyInvalid;
            emit DebtCacheValidityChanged(currentlyInvalid);
        }
    }

    function _updateCachedSynthDebtsWithRates(
        bytes32[] memory currencyKeys,
        uint[] memory currentRates,
        bool anyRateIsInvalid,
        bool recomputeExcludedDebt,
        bool recomputeFuturesDebt
    ) internal {
        uint numKeys = currencyKeys.length;
        require(numKeys == currentRates.length, "Input array lengths differ");

        // Update the cached values for each synth, saving the sums as we go.
        uint cachedSum;
        uint currentSum;
        uint excludedDebtSum = _cachedSynthDebt[EXCLUDED_DEBT_KEY];
        uint[] memory currentValues = _issuedSynthValues(currencyKeys, currentRates);

        for (uint i = 0; i < numKeys; i++) {
            bytes32 key = currencyKeys[i];
            uint currentSynthDebt = currentValues[i];
            cachedSum = cachedSum.add(_cachedSynthDebt[key]);
            currentSum = currentSum.add(currentSynthDebt);
            _cachedSynthDebt[key] = currentSynthDebt;
        }

        // Unused code until we circle back to refactor the debt system
        if (recomputeFuturesDebt) {
            (uint futuresDebt, bool futuresDebtIsInvalid) = futuresMarketManager().totalDebt();
            anyRateIsInvalid = anyRateIsInvalid || futuresDebtIsInvalid;
            cachedSum = cachedSum.add(_cachedSynthDebt[FUTURES_DEBT_KEY]);
            currentSum = currentSum.add(futuresDebt);
            _cachedSynthDebt[FUTURES_DEBT_KEY] = futuresDebt;
        }

        // Always update the cached value of the excluded debt -- it's computed anyway.
        if (recomputeExcludedDebt) {
            (uint excludedDebt, bool anyNonSnxDebtRateIsInvalid) = _totalNonSnxBackedDebt();
            anyRateIsInvalid = anyRateIsInvalid || anyNonSnxDebtRateIsInvalid;
            excludedDebtSum = excludedDebt;
        }

        cachedSum = cachedSum.floorsub(_cachedSynthDebt[EXCLUDED_DEBT_KEY]);
        currentSum = currentSum.floorsub(excludedDebtSum);
        _cachedSynthDebt[EXCLUDED_DEBT_KEY] = excludedDebtSum;

        // Compute the difference and apply it to the snapshot
        if (cachedSum != currentSum) {
            uint debt = _cachedDebt;
            // This requirement should never fail, as the total debt snapshot is the sum of the individual synth
            // debt snapshots.
            require(cachedSum <= debt, "Cached synth sum exceeds total debt");
            debt = debt.sub(cachedSum).add(currentSum);
            _cachedDebt = debt;
            emit DebtCacheUpdated(debt);
        }

        // A partial update can invalidate the debt cache, but a full snapshot must be performed in order
        // to re-validate it.
        if (anyRateIsInvalid) {
            _updateDebtCacheValidity(anyRateIsInvalid);
        }
    }

    /* ========== EVENTS ========== */

    event DebtCacheUpdated(uint cachedDebt);
    event DebtCacheSnapshotTaken(uint timestamp);
    event DebtCacheValidityChanged(bool indexed isInvalid);
}
