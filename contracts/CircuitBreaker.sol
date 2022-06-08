pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/ICircuitBreaker.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/ISynth.sol";
import "./interfaces/ISystemStatus.sol";
import "./interfaces/IExchangeRates.sol";
import "./Proxyable.sol";

// Chainlink
import "@chainlink/contracts-0.0.10/src/v0.5/interfaces/AggregatorV2V3Interface.sol";

/**
 * Compares current exchange rate to previous, and suspends a synth if the
 * difference is outside of deviation bounds.
 * Stores last "good" rate for each synth on each invocation.
 * Inteded use is to use in combination with ExchangeRates on mutative exchange-like
 * methods.
 * Suspend functionality is public, resume functionality is controlled by owner.
 *
 * https://docs.synthetix.io/contracts/source/contracts/CircuitBreaker
 */
contract CircuitBreaker is Owned, MixinSystemSettings, ICircuitBreaker {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    bytes32 public constant CONTRACT_NAME = "CircuitBreaker";

    // SIP-65: Decentralized circuit breaker
    uint public constant CIRCUIT_BREAKER_SUSPENSION_REASON = 65;

    // is internal to have lastValue getter in interface in solidity v0.5
    // TODO: after upgrading solidity, switch to just public lastValue instead
    //  of maintaining this internal one
    mapping(address => uint) internal _lastValue;
    mapping(address => bool) internal _circuitBroken;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYSTEMSTATUS = "SystemStatus";

    constructor(address _owner, address _resolver) public Owned(_owner) MixinSystemSettings(_resolver) {}

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](1);
        newAddresses[0] = CONTRACT_SYSTEMSTATUS;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    // Returns rate and its "invalid" state.
    // Rate can be invalid due to range out of bounds.
    function isInvalid(address oracleAddress, uint value) external view returns (bool) {
        return _circuitBroken[oracleAddress] || _isRateOutOfBounds(oracleAddress, value) || value == 0;
    }

    function isDeviationAboveThreshold(uint base, uint comparison) external view returns (bool) {
        return _isDeviationAboveThreshold(base, comparison);
    }

    function priceDeviationThresholdFactor() external view returns (uint) {
        return getPriceDeviationThresholdFactor();
    }

    function lastValue(address oracleAddress) external view returns (uint) {
        return _lastValue[oracleAddress];
    }

    function circuitBroken(address oracleAddress) external view returns (bool) {
        return _circuitBroken[oracleAddress];
    }

    /* ========== Internal views ========== */

    function systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS));
    }

    /* ========== Mutating ========== */

    /**
     * Checks rate deviation from previous and its "invalid" oracle state (stale rate, of flagged by oracle).
     * if it's valid and within deviation bounds, stores it and returns it and "false" (circuit not broken).
     * If rate is invalid or outside of deviation bounds - doesn't store it, suspends the the synth, and returns
     * last rate and "true" (circuit broken).
     * Also, checks that system is not suspended currently, if it is - doesn't perform any checks, and
     * returns last rate and "false" (not broken), to prevent synths suspensions during maintenance.
     */
    function probeCircuitBreaker(address oracleAddress, uint value) external returns (bool circuitBroken) {
        // check system status
        if (
            !systemStatus().systemSuspended() && _isRateOutOfBounds(oracleAddress, value) && _lastValue[oracleAddress] != 0
        ) {
            _circuitBroken[oracleAddress] = true;
            emit CircuitBroken(oracleAddress);
        }

        _lastValue[oracleAddress] = value;

        return _circuitBroken[oracleAddress] || value == 0;
    }

    /**
     * SIP-139
     * resets the stored value for _lastValue for multiple currencies to the latest rate
     * can be used to un-suspend synths after a suspension happenned
     * doesn't check deviations here, so believes that owner knows better
     * emits LastRateOverriden
     */
    function resetLastValue(address[] calldata oracleAddresses, uint[] calldata values) external onlyOwner {
        for (uint i = 0; i < oracleAddresses.length; i++) {
            emit LastValueOverriden(oracleAddresses[i], _lastValue[oracleAddresses[i]], values[i]);
            _lastValue[oracleAddresses[i]] = values[i];
            _circuitBroken[oracleAddresses[i]] = false;
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
    function _isRateOutOfBounds(address oracleAddress, uint current) internal view returns (bool) {
        uint last = _lastValue[oracleAddress];

        if (last > 0) {
            return _isDeviationAboveThreshold(last, current);
        }

        return false;
    }

    // ========== EVENTS ==========

    // @notice signals that a the "last rate" was overriden by one of the admin methods
    //   with a value that didn't come direclty from the ExchangeRates.getRates methods
    event LastValueOverriden(address indexed oracleAddress, uint256 previousRate, uint256 newRate);
    event CircuitBroken(address indexed oracleAddress);
}
