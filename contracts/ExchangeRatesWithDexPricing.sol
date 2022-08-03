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
        uint sourceRate;
        uint destRate;

        // Handle the different scenarios that may arise when trading currencies with or without the PureChainlinkPrice set.
        // outlined here: https://sips.synthetix.io/sips/sip-198/#computation-methodology-in-atomic-pricing
        if (usePureChainlinkPriceForSource) {
            sourceRate = systemSourceRate;
        } else {
            sourceRate = _getMinValue(systemSourceRate, _getPriceFromDexAggregator(sourceCurrencyKey, sUSD, sourceAmount));
        }

        if (usePureChainlinkPriceForDest) {
            destRate = systemDestinationRate;
        } else {
            destRate = _getMaxValue(
                systemDestinationRate,
                _getPriceFromDexAggregator(sUSD, destinationCurrencyKey, sourceAmount)
            );
        }

        value = sourceAmount.mul(sourceRate).div(destRate);
    }

    function _getMinValue(uint x, uint y) internal pure returns (uint) {
        return x < y ? x : y;
    }

    function _getMaxValue(uint x, uint y) internal pure returns (uint) {
        return x > y ? x : y;
    }

    /// @notice Retrieve the TWAP (time-weighted average price) of an asset from its Uniswap V3-equivalent pool
    /// @dev By default, the TWAP oracle 'hops' through the wETH pool. This can be overridden. See DexPriceAggregator for more information.
    /// @dev The TWAP oracle doesn't take into account variable slippage due to trade amounts, as Uniswap's OracleLibary doesn't cross ticks based on their liquidity. See: https://docs.uniswap.org/protocol/concepts/V3-overview/oracle#deriving-price-from-a-tick
    /// @dev One of `sourceCurrencyKey` or `destCurrencyKey` should be sUSD. There are two parameters to indicate directionality. Because this function returns "price", if the source is sUSD, the result will be flipped.
    /// @param sourceCurrencyKey The currency key of the source token
    /// @param destCurrencyKey The currency key of the destination token
    /// @param amount The amount of the asset we're interested in
    /// @return The price of the asset
    function _getPriceFromDexAggregator(
        bytes32 sourceCurrencyKey,
        bytes32 destCurrencyKey,
        uint amount
    ) internal view returns (uint) {
        require(amount != 0, "Amount must be greater than 0");
        require(sourceCurrencyKey == sUSD || destCurrencyKey == sUSD, "Atomic swaps must go through sUSD");

        IERC20 sourceEquivalent = IERC20(getAtomicEquivalentForDexPricing(sourceCurrencyKey));
        require(address(sourceEquivalent) != address(0), "No atomic equivalent for source");

        IERC20 destEquivalent = IERC20(getAtomicEquivalentForDexPricing(destCurrencyKey));
        require(address(destEquivalent) != address(0), "No atomic equivalent for dest");

        uint result =
            _dexPriceDestinationValue(sourceEquivalent, destEquivalent, amount).mul(SafeDecimalMath.unit()).div(amount);
        require(result != 0, "Result must be greater than 0");

        return destCurrencyKey == "sUSD" ? result : SafeDecimalMath.unit().divideDecimalRound(result);
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
