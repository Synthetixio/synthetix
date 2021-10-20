pragma solidity ^0.8.9;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/IExchangeRatesCircuitBreaker.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/ISynth.sol";
import "./interfaces/IIssuer.sol";
import "./interfaces/ISystemStatus.sol";
import "./interfaces/IExchangeRates.sol";
import "./Proxyable.sol";

/**
 * Compares current exchange rate to previous, and suspends a synth if the
 * difference is outside of deviation bounds.
 * Stores last "good" rate for each synth on each invocation.
 * Inteded use is to use in combination with ExchangeRates on mutative exchange-like
 * methods.
 * Suspend functionality is public, resume functionality is controlled by owner.
 *
 * https://docs.synthetix.io/contracts/source/contracts/ExchangeRatesCircuitBreaker
 */
contract ExchangeRatesCircuitBreaker is Owned, MixinSystemSettings, IExchangeRatesCircuitBreaker {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    bytes32 public constant CONTRACT_NAME = "ExchangeRatesCircuitBreaker";

    // SIP-65: Decentralized circuit breaker
    uint public constant CIRCUIT_BREAKER_SUSPENSION_REASON = 65;

    // is internal to have lastExchangeRate getter in interface in solidity v0.5
    // TODO: after upgrading solidity, switch to just public lastExchangeRate instead
    //  of maintaining this internal one
    mapping(bytes32 => uint) internal _lastExchangeRate;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";

    constructor(address _owner, address _resolver) Owned(_owner) MixinSystemSettings(_resolver) {}

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view override returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](3);
        newAddresses[0] = CONTRACT_SYSTEMSTATUS;
        newAddresses[1] = CONTRACT_EXRATES;
        newAddresses[2] = CONTRACT_ISSUER;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    // Returns rate and its "invalid" state.
    // Checks if current rate is invalid or out of deviation dounds w.r.t. to previously stored rate
    // or if there is no valid stored rate, w.r.t. to previous 3 oracle rates.
    function rateWithInvalid(bytes32 currencyKey) external view returns (uint, bool) {
        (uint rate, bool invalid) = exchangeRates().rateAndInvalid(currencyKey);
        return (rate, invalid || _isRateOutOfBounds(currencyKey, rate));
    }

    function isDeviationAboveThreshold(uint base, uint comparison) external view returns (bool) {
        return _isDeviationAboveThreshold(base, comparison);
    }

    function priceDeviationThresholdFactor() external view returns (uint) {
        return getPriceDeviationThresholdFactor();
    }

    function lastExchangeRate(bytes32 currencyKey) external view returns (uint) {
        return _lastExchangeRate[currencyKey];
    }

    /* ========== Internal views ========== */

    function systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS));
    }

    function exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES));
    }

    function issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER));
    }

    /* ========== Mutating ========== */

    /**
     * Checks rate deviation from previous and its "invalid" oracle state.
     * if it's valid and within deviation bounds, stores it and returns it and "false" (circuit not broken).
     * If rate is invalid or outside of deviation bounds - doesn't store it, suspends the the synth, and returns
     * last rate and "true" (circuit broken).
     * Also, checks that system is not suspended currently, if it is - doesn't perform any checks, and
     * returns last rate and "false" (not broken), to prevent synths suspensions during maintenance.
     */
    function rateWithCircuitBroken(bytes32 currencyKey) external returns (uint lastValidRate, bool circuitBroken) {
        // check system status
        if (systemStatus().systemSuspended()) {
            // if system is inactive this call has no effect, but will neither revert,
            // nor persist new rate, nor suspend the synth - because the system is inactive.
            // not reverting is needed for performing admin operations during system suspension
            // e.g. purging synths that use some exchanging functionality
        } else {
            // get new rate and check oracle "invalid" state
            (uint rate, bool invalid) = exchangeRates().rateAndInvalid(currencyKey);
            // check and suspend
            if (invalid || _isRateOutOfBounds(currencyKey, rate)) {
                // check synth exists, to prevent spamming settings for non existant synths
                require(issuer().synths(currencyKey) != ISynth(address(0)), "No such synth");
                systemStatus().suspendSynth(currencyKey, CIRCUIT_BREAKER_SUSPENSION_REASON);
                circuitBroken = true;
            } else {
                // store the last passing rate
                _lastExchangeRate[currencyKey] = rate;
            }
        }
        return (_lastExchangeRate[currencyKey], circuitBroken);
    }

    /**
     * SIP-78
     *
     * sets the last-rate to an externally provided value
     * access restricted to only the ExchageRates contract, and is used there in setInversePricing
     * for iSynths
     * emits LastRateOverriden
     * TODO: deprecate when iSynths are removed from the system
     */
    function setLastExchangeRateForSynth(bytes32 currencyKey, uint rate) external onlyExchangeRates {
        require(rate > 0, "Rate must be above 0");
        emit LastRateOverriden(currencyKey, _lastExchangeRate[currencyKey], rate);
        _lastExchangeRate[currencyKey] = rate;
    }

    /**
     * SIP-139
     * resets the stored value for _lastExchangeRate for multiple currencies to the latest rate
     * can be used to un-suspend synths after a suspension happenned
     * doesn't check deviations here, so believes that owner knows better
     * emits LastRateOverriden
     */
    function resetLastExchangeRate(bytes32[] calldata currencyKeys) external onlyOwner {
        (uint[] memory rates, bool anyRateInvalid) = exchangeRates().ratesAndInvalidForCurrencies(currencyKeys);

        require(!anyRateInvalid, "Rates for given synths not valid");

        for (uint i = 0; i < currencyKeys.length; i++) {
            emit LastRateOverriden(currencyKeys[i], _lastExchangeRate[currencyKeys[i]], rates[i]);
            _lastExchangeRate[currencyKeys[i]] = rates[i];
        }
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function _isDeviationAboveThreshold(uint base, uint comparison) internal view returns (bool) {
        if (base == 0 || comparison == 0) {
            return true;
        }

        uint factor;
        if (comparison > base) {
            factor = comparison.divideDecimal(base);
        } else {
            factor = base.divideDecimal(comparison);
        }

        return factor >= getPriceDeviationThresholdFactor();
    }

    /**
     * Rate is invalid if:
     * - is outside of deviation bounds relative to previous non-zero rate
     * - (warm up case) if previous rate was 0 (init), gets last 4 rates from oracle, and checks
     * if rate is outside of deviation w.r.t any of the 3 previous ones (excluding the last one).
     */
    function _isRateOutOfBounds(bytes32 currencyKey, uint currentRate) internal view returns (bool) {
        if (currentRate == 0) {
            return true;
        }

        uint lastRateFromExchange = _lastExchangeRate[currencyKey];

        if (lastRateFromExchange > 0) {
            return _isDeviationAboveThreshold(lastRateFromExchange, currentRate);
        }

        // if no last exchange for this synth, then we need to look up last 3 rates (+1 for current rate)
        (uint[] memory rates, ) = exchangeRates().ratesAndUpdatedTimeForCurrencyLastNRounds(currencyKey, 4);

        // start at index 1 to ignore current rate
        for (uint i = 1; i < rates.length; i++) {
            // ignore any empty rates in the past (otherwise we will never be able to get validity)
            if (rates[i] > 0 && _isDeviationAboveThreshold(rates[i], currentRate)) {
                return true;
            }
        }

        return false;
    }

    // ========== MODIFIERS ==========

    modifier onlyExchangeRates() {
        IExchangeRates _exchangeRates = exchangeRates();
        require(msg.sender == address(_exchangeRates), "Restricted to ExchangeRates");
        _;
    }

    // ========== EVENTS ==========

    // @notice signals that a the "last rate" was overriden by one of the admin methods
    //   with a value that didn't come direclty from the ExchangeRates.getRates methods
    event LastRateOverriden(bytes32 currencyKey, uint256 previousRate, uint256 newRate);
}
