pragma solidity ^0.5.16;

// Inheritance
import "./ExchangeRates.sol";
import "./interfaces/IDexPriceAggregator.sol";

// https://docs.synthetix.io/contracts/source/contracts/exchangerateswithdexpricing
contract ExchangeRatesWithDexPricing is ExchangeRates {
    bytes32 public constant CONTRACT_NAME = "ExchangeRatesWithDexPricing";

    bytes32 internal constant SETTING_DEX_PRICE_AGGREGATOR = "dexPriceAggregator";

    constructor(address _owner, address _resolver) public ExchangeRates(_owner, _resolver) {}

    /* ========== SETTERS ========== */

    function setDexPriceAggregator(IDexPriceAggregator _dexPriceAggregator) external onlyOwner {
        flexibleStorage().setAddressValue(
            ExchangeRates.CONTRACT_NAME,
            SETTING_DEX_PRICE_AGGREGATOR,
            address(_dexPriceAggregator)
        );
        emit DexPriceAggregatorUpdated(address(_dexPriceAggregator));
    }

    /* ========== VIEWS ========== */

    function dexPriceAggregator() public view returns (IDexPriceAggregator) {
        return
            IDexPriceAggregator(
                flexibleStorage().getAddressValue(ExchangeRates.CONTRACT_NAME, SETTING_DEX_PRICE_AGGREGATOR)
            );
    }

    function atomicTwapWindow() external view returns (uint) {
        return getAtomicTwapWindow();
    }

    function atomicEquivalentForDexPricing(bytes32 currencyKey) external view returns (address) {
        return getAtomicEquivalentForDexPricing(currencyKey);
    }

    function atomicPriceBuffer(bytes32 currencyKey) external view returns (uint) {
        return getAtomicPriceBuffer(currencyKey);
    }

    function atomicVolatilityConsiderationWindow(bytes32 currencyKey) external view returns (uint) {
        return getAtomicVolatilityConsiderationWindow(currencyKey);
    }

    function atomicVolatilityUpdateThreshold(bytes32 currencyKey) external view returns (uint) {
        return getAtomicVolatilityUpdateThreshold(currencyKey);
    }

    // SIP-120 Atomic exchanges
    // Note that the returned systemValue, systemSourceRate, and systemDestinationRate are based on
    // the current system rate, which may not be the atomic rate derived from value / sourceAmount
    function effectiveAtomicValueAndRates(
        bytes32 sourceCurrencyKey,
        uint sourceAmount,
        bytes32 destinationCurrencyKey
    )
        external
        view
        returns (
            uint value,
            uint systemValue,
            uint systemSourceRate,
            uint systemDestinationRate
        )
    {
        (systemValue, systemSourceRate, systemDestinationRate) = _effectiveValueAndRates(
            sourceCurrencyKey,
            sourceAmount,
            destinationCurrencyKey
        );

        bool usePureChainlinkPriceForSource = getPureChainlinkPriceForAtomicSwapsEnabled(sourceCurrencyKey);
        bool usePureChainlinkPriceForDest = getPureChainlinkPriceForAtomicSwapsEnabled(destinationCurrencyKey);
        uint dexValue;

        if (usePureChainlinkPriceForSource || usePureChainlinkPriceForDest) {
            // If either can rely on the pure Chainlink price, use it and get the rate from Uniswap for the other if necessary
            uint sourceRate =
                usePureChainlinkPriceForSource
                    ? systemSourceRate
                    : _getPriceFromDexAggregator(sourceCurrencyKey, sourceAmount);
            uint destRate =
                usePureChainlinkPriceForDest
                    ? systemDestinationRate
                    : _getPriceFromDexAggregator(destinationCurrencyKey, sourceAmount);

            value = sourceAmount.mul(sourceRate).div(destRate);
        } else {
            // Otherwise, we get the price from Uniswap
            IERC20 sourceEquivalent = IERC20(getAtomicEquivalentForDexPricing(sourceCurrencyKey));
            require(address(sourceEquivalent) != address(0), "No atomic equivalent for src");
            IERC20 destEquivalent = IERC20(getAtomicEquivalentForDexPricing(destinationCurrencyKey));
            require(address(destEquivalent) != address(0), "No atomic equivalent for dest");

            dexValue = _dexPriceDestinationValue(sourceEquivalent, destEquivalent, sourceAmount);

            // Derive chainlinkValueWithBuffer from highest configured buffer between source and destination synth
            uint sourceBuffer = getAtomicPriceBuffer(sourceCurrencyKey);
            uint destBuffer = getAtomicPriceBuffer(destinationCurrencyKey);
            uint priceBuffer = sourceBuffer > destBuffer ? sourceBuffer : destBuffer; // max
            uint chainlinkValueWithBuffer = systemValue.multiplyDecimal(SafeDecimalMath.unit().sub(priceBuffer));

            // Final value is minimum output between the price from Chainlink with a buffer and the price from Uniswap.
            value = chainlinkValueWithBuffer < dexValue ? chainlinkValueWithBuffer : dexValue; // min
        }
    }

    /// @notice Retrieve the TWAP (time-weighted average price) of an asset from its Uniswap V3-equivalent pool
    /// @dev By default, the TWAP oracle 'hops' through the wETH pool. This can be overridden. See DexPriceAggregator for more information.
    /// @dev The TWAP oracle doesn't take into account variable slippage due to trade amounts, as Uniswap's OracleLibary doesn't cross ticks based on their liquidity. See: https://docs.uniswap.org/protocol/concepts/V3-overview/oracle#deriving-price-from-a-tick
    /// @param currencyKey The currency key of the synth we're retrieving the price for
    /// @param amount The amount of the asset we're interested in
    /// @return The price of the asset
    function _getPriceFromDexAggregator(bytes32 currencyKey, uint amount) internal view returns (uint) {
        require(amount != 0, "Amount must be greater than 0");

        IERC20 inputEquivalent = IERC20(getAtomicEquivalentForDexPricing(currencyKey));
        require(address(inputEquivalent) != address(0), "No atomic equivalent for input");

        IERC20 susdEquivalent = IERC20(getAtomicEquivalentForDexPricing("sUSD"));
        require(address(susdEquivalent) != address(0), "No atomic equivalent for sUSD");

        uint result =
            _dexPriceDestinationValue(inputEquivalent, susdEquivalent, amount).mul(SafeDecimalMath.unit()).div(amount);
        require(result != 0, "Result must be greater than 0");

        return result;
    }

    function _dexPriceDestinationValue(
        IERC20 sourceEquivalent,
        IERC20 destEquivalent,
        uint sourceAmount
    ) internal view returns (uint) {
        // Normalize decimals in case equivalent asset uses different decimals from internal unit
        uint sourceAmountInEquivalent =
            (sourceAmount.mul(10**uint(sourceEquivalent.decimals()))).div(SafeDecimalMath.unit());

        uint twapWindow = getAtomicTwapWindow();
        require(twapWindow != 0, "Uninitialized atomic twap window");

        uint twapValueInEquivalent =
            dexPriceAggregator().assetToAsset(
                address(sourceEquivalent),
                sourceAmountInEquivalent,
                address(destEquivalent),
                twapWindow
            );
        require(twapValueInEquivalent > 0, "dex price returned 0");

        // Similar to source amount, normalize decimals back to internal unit for output amount
        return (twapValueInEquivalent.mul(SafeDecimalMath.unit())).div(10**uint(destEquivalent.decimals()));
    }

    function synthTooVolatileForAtomicExchange(bytes32 currencyKey) external view returns (bool) {
        // sUSD is a special case and is never volatile
        if (currencyKey == "sUSD") return false;

        uint considerationWindow = getAtomicVolatilityConsiderationWindow(currencyKey);
        uint updateThreshold = getAtomicVolatilityUpdateThreshold(currencyKey);

        if (considerationWindow == 0 || updateThreshold == 0) {
            // If either volatility setting is not set, never judge an asset to be volatile
            return false;
        }

        // Go back through the historical oracle update rounds to see if there have been more
        // updates in the consideration window than the allowed threshold.
        // If there have, consider the asset volatile--by assumption that many close-by oracle
        // updates is a good proxy for price volatility.
        uint considerationWindowStart = block.timestamp.sub(considerationWindow);
        uint roundId = _getCurrentRoundId(currencyKey);
        for (updateThreshold; updateThreshold > 0; updateThreshold--) {
            (uint rate, uint time) = _getRateAndTimestampAtRound(currencyKey, roundId);
            if (time != 0 && time < considerationWindowStart) {
                // Round was outside consideration window so we can stop querying further rounds
                return false;
            } else if (rate == 0 || time == 0) {
                // Either entire round or a rate inside consideration window was not available
                // Consider the asset volatile
                break;
            }

            if (roundId == 0) {
                // Not enough historical data to continue further
                // Consider the asset volatile
                break;
            }
            roundId--;
        }

        return true;
    }

    /* ========== EVENTS ========== */

    event DexPriceAggregatorUpdated(address newDexPriceAggregator);
}
