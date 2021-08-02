pragma solidity ^0.5.16;

// Inheritance
import "./ExchangeRates.sol";
import "./interfaces/IDexPriceAggregator.sol";

// https://docs.synthetix.io/contracts/source/contracts/exchangerateswithdexpricing
contract ExchangeRatesWithDexPricing is ExchangeRates {
    bytes32 internal constant SETTING_DEX_PRICE_AGGREGATOR = "dexPriceAggregator";

    constructor(
        address _owner,
        address _oracle,
        address _resolver,
        bytes32[] memory _currencyKeys,
        uint[] memory _newRates
    ) public ExchangeRates(_owner, _oracle, _resolver, _currencyKeys, _newRates) {}

    /* ========== SETTERS ========== */

    function setDexPriceAggregator(IDexPriceAggregator _dexPriceAggregator) external onlyOwner {
        flexibleStorage().setAddressValue(CONTRACT_NAME, SETTING_DEX_PRICE_AGGREGATOR, address(_dexPriceAggregator));
        emit DexPriceAggregatorUpdated(address(_dexPriceAggregator));
    }

    /* ========== VIEWS ========== */

    function dexPriceAggregator() public view returns (IDexPriceAggregator) {
        // TODO: this fetch could be made cheaper with an internal cache that gets wiped on `setDexPriceAggregator()` calls
        return IDexPriceAggregator(flexibleStorage().getAddressValue(CONTRACT_NAME, SETTING_DEX_PRICE_AGGREGATOR));
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
        IERC20 sourceEquivalent = IERC20(getAtomicEquivalentForDexPricing(sourceCurrencyKey));
        require(address(sourceEquivalent) != address(0), "No atomic equivalent for src");

        IERC20 destEquivalent = IERC20(getAtomicEquivalentForDexPricing(destinationCurrencyKey));
        require(address(destEquivalent) != address(0), "No atomic equivalent for dest");

        // TODO: this may return 0s if the CL aggregator reverts on latestRoundData()--should it revert?
        (systemValue, systemSourceRate, systemDestinationRate) = _effectiveValueAndRates(
            sourceCurrencyKey,
            sourceAmount,
            destinationCurrencyKey
        );
        // Derive P_CLBUF from highest configured buffer between source and destination synth
        uint priceBuffer = Math.max(getAtomicPriceBuffer(sourceCurrencyKey), getAtomicPriceBuffer(destinationCurrencyKey));
        uint pClbufValue = systemValue.multiplyDecimal(SafeDecimalMath.unit().sub(priceBuffer));

        // Normalize decimals in case equivalent asset uses different decimals from internal unit
        uint sourceAmountInEquivalent = (sourceAmount * 10**uint(sourceEquivalent.decimals())) / SafeDecimalMath.unit();
        // TODO: add sanity check here to make sure the price window isn't 0?
        uint twapValueInEquivalent =
            dexPriceAggregator().assetToAsset(
                address(sourceEquivalent),
                sourceAmountInEquivalent,
                address(destEquivalent),
                getAtomicTwapWindow()
            );
        // Similar to source amount, normalize decimals back to internal unit for output amount
        uint pDexValue = (twapValueInEquivalent * SafeDecimalMath.unit()) / 10**uint(destEquivalent.decimals());

        // Final value is minimum output between P_CLBUF and P_TWAP
        value = Math.min(pClbufValue, pDexValue);
    }

    /* ========== EVENTS ========== */

    event DexPriceAggregatorUpdated(address newDexPriceAggregator);
}
