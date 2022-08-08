pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./PerpsConfigGettersV2Mixin.sol";
import "./interfaces/IPerpsInterfacesV2.sol";
import "./interfaces/IFuturesMarketManager.sol";

// Libraries
import "openzeppelin-solidity-2.3.0/contracts/math/SafeMath.sol";
import "./SignedSafeMath.sol";
import "./SignedSafeDecimalMath.sol";
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/IExchangeCircuitBreaker.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/IExchanger.sol";
import "./interfaces/ISystemStatus.sol";
import "./interfaces/IERC20.sol";

contract PerpsOrdersV2Base is PerpsConfigGettersV2Mixin, IPerpsTypesV2 {
    using SafeMath for uint;
    using SignedSafeMath for int;
    using SafeDecimalMath for uint;

    /* ========== CONSTANTS ========== */

    // This is the same unit as used inside `SignedSafeDecimalMath`.
    int private constant _UNIT = int(10**uint(18));

    //slither-disable-next-line naming-convention
    bytes32 internal constant sUSD = "sUSD";

    /* ========== STATE VARIABLES ========== */

    bytes32 public constant CONTRACT_NAME = "PerpsOrdersV2";

    /* ---------- Address Resolver Configuration ---------- */

    bytes32 internal constant CONTRACT_PERPSENGINEV2 = "PerpsEngineV2";
    bytes32 internal constant CONTRACT_PERPSTORAGEV2 = "PerpsStorageV2";
    bytes32 internal constant CONTRACT_EXCHANGERATES = "ExchangeRates";
    bytes32 internal constant CONTRACT_EXCHANGER = "Exchanger";

    /* ========== CONSTRUCTOR ========== */

    constructor(address _resolver) public PerpsConfigGettersV2Mixin(_resolver) {}

    /* ========== VIEWS ========== */

    /* ---------- External Contracts ---------- */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = PerpsConfigGettersV2Mixin.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](4);
        newAddresses[0] = CONTRACT_PERPSENGINEV2;
        newAddresses[1] = CONTRACT_PERPSTORAGEV2;
        newAddresses[2] = CONTRACT_EXCHANGERATES;
        newAddresses[3] = CONTRACT_EXCHANGER;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    function engineContract() public view returns (IPerpsEngineV2External) {
        return IPerpsEngineV2External(requireAndGetAddress(CONTRACT_PERPSENGINEV2));
    }

    function stateContract() public view returns (IPerpsStorageV2External) {
        return IPerpsStorageV2External(requireAndGetAddress(CONTRACT_PERPSTORAGEV2));
    }

    function baseFee(bytes32 marketKey) external view returns (uint) {
        return _baseFee(marketKey);
    }

    function feeRate(bytes32 marketKey) external view returns (uint) {
        return _feeRate(marketKey);
    }

    function orderFee(bytes32 marketKey, int sizeDelta) external view returns (uint fee, bool invalid) {
        return engineContract().orderFee(marketKey, sizeDelta, _feeRate(marketKey));
    }

    function dynamicFeeRate(bytes32 marketKey) external view returns (uint rate, bool tooVolatile) {
        return _dynamicFeeRate(marketKey);
    }

    function positionSummary(bytes32 marketKey, address account) external view returns (PositionSummary memory) {
        return engineContract().positionSummary(marketKey, account);
    }

    function marketSummary(bytes32 marketKey) external view returns (MarketSummary memory) {
        return engineContract().marketSummary(marketKey);
    }

    /// view for returning max possible order size that take into account existing positions
    function maxOrderSizes(bytes32 marketKey) external view returns (uint long, uint short) {
        (uint price, ) = engineContract().assetPrice(marketKey);
        (uint longSize, uint shortSize) = engineContract().marketSizes(marketKey);
        uint sizeLimit = _maxSingleSideValueUSD(marketKey).divideDecimal(price);
        long = longSize < sizeLimit ? sizeLimit.sub(longSize) : 0;
        short = shortSize < sizeLimit ? sizeLimit.sub(shortSize) : 0;
        return (long, short);
    }

    // INTERNAL

    function _engineInternal() internal view returns (IPerpsEngineV2Internal) {
        return IPerpsEngineV2Internal(requireAndGetAddress(CONTRACT_PERPSENGINEV2));
    }

    function _exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXCHANGERATES));
    }

    function _exchanger() internal view returns (IExchanger) {
        return IExchanger(requireAndGetAddress(CONTRACT_EXCHANGER));
    }

    function _baseAsset(bytes32 marketKey) internal view returns (bytes32) {
        return stateContract().marketScalars(marketKey).baseAsset;
    }

    /// Uses the exchanger to get the dynamic fee (SIP-184) for trading from sUSD to baseAsset
    /// this assumes dynamic fee is symmetric in direction of trade.
    /// @dev this is a pretty expensive action in terms of execution gas as it queries a lot
    ///   of past rates from oracle. Shouldn't be much of an issue on a rollup though.
    function _dynamicFeeRate(bytes32 marketKey) internal view returns (uint rate, bool tooVolatile) {
        return _exchanger().dynamicFeeRateForExchange(sUSD, _baseAsset(marketKey));
    }

    function _dynamicFeeRateChecked(bytes32 marketKey) internal view returns (uint) {
        // get the dynamic fee rate SIP-184
        (uint _rate, bool tooVolatile) = _dynamicFeeRate(marketKey);
        // revert if too volatile
        require(!tooVolatile, "Price too volatile");
        return _rate;
    }

    function _feeRate(bytes32 marketKey) internal view returns (uint rate) {
        // add to base fee
        return _baseFee(marketKey).add(_dynamicFeeRateChecked(marketKey));
    }

    /// helper for getting `int priceDelta` for the `engine.trade()` interface for making a trade at price different
    /// from current asset price (e.g. orders such as next price, limit, but also orders with slippage)
    function _priceDeltaFromCurrent(bytes32 marketKey, uint targetPrice) internal view returns (int) {
        (uint currentPrice, ) = engineContract().assetPrice(marketKey);
        return int(targetPrice).sub(int(currentPrice));
    }

    // EXTERNAL MUTATIVE

    /*
     * Alter the amount of margin in a position. A positive input triggers a deposit; a negative one, a
     * withdrawal. The margin will be burnt or issued directly into/out of the caller's sUSD wallet.
     * Reverts on deposit if the caller lacks a sufficient sUSD balance.
     * Reverts on withdrawal if the amount to be withdrawn would expose an open position to liquidation.
     */
    function transferMargin(bytes32 marketKey, int marginDelta) external {
        _engineInternal().transferMargin(marketKey, msg.sender, marginDelta);
    }

    /*
     * Withdraws all accessible margin in a position. This will leave some remaining margin
     * in the account if the caller has a position open. Equivalent to `transferMargin(-withdrawableMargin(sender))`.
     */
    function withdrawAllMargin(bytes32 marketKey) external {
        address account = msg.sender;
        uint withdrawable = engineContract().withdrawableMargin(marketKey, account);
        _engineInternal().transferMargin(marketKey, account, -int(withdrawable));
    }

    /*
     * Adjust the sender's position size.
     * Reverts if the resulting position is too large, outside the max leverage, or is liquidating.
     */
    function modifyPosition(bytes32 marketKey, int sizeDelta) external {
        _modifyPosition(marketKey, sizeDelta, bytes32(0));
    }

    /*
     * Same as modifyPosition, but emits an event with the passed tracking code to
     * allow off chain calculations for fee sharing with originating integrations
     */
    function modifyPositionWithTracking(
        bytes32 marketKey,
        int sizeDelta,
        bytes32 trackingCode
    ) external {
        _modifyPosition(marketKey, sizeDelta, trackingCode);
    }

    /*
     * Submit an order to close a position.
     */
    function closePosition(bytes32 marketKey) external {
        _closePosition(marketKey, bytes32(0));
    }

    /// Same as closePosition, but emits an even with the trackingCode for volume source fee sharing
    function closePositionWithTracking(bytes32 marketKey, bytes32 trackingCode) external {
        _closePosition(marketKey, trackingCode);
    }

    // INTERNAL MUTATIVE

    function _modifyPosition(
        bytes32 marketKey,
        int sizeDelta,
        bytes32 trackingCode
    ) internal {
        IPerpsEngineV2Internal.ExecutionOptions memory options =
            IPerpsEngineV2Internal.ExecutionOptions({
                priceDelta: 0,
                feeRate: _feeRate(marketKey),
                trackingCode: trackingCode
            });
        _engineInternal().trade(marketKey, msg.sender, sizeDelta, options);
    }

    function _closePosition(bytes32 marketKey, bytes32 trackingCode) internal {
        int size = stateContract().positions(marketKey, msg.sender).size;
        require(size != 0, "No position open");
        _modifyPosition(marketKey, -size, trackingCode);
    }
}
