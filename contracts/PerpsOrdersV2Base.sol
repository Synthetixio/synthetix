pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./PerpsConfigGettersV2Mixin.sol";
import "./interfaces/IPerpsInterfacesV2.sol";

// Libraries
import "openzeppelin-solidity-2.3.0/contracts/math/SafeMath.sol";
import "./SignedSafeMath.sol";
import "./SignedSafeDecimalMath.sol";
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/IExchangeRates.sol";
import "./interfaces/IExchanger.sol";

/*
 User facing contract for Perps V2 that handles logic related to orders and fees (as opposed to main
 execution logic that's handled by PerpsEngineV2).

 Contract interactions:
 - to PerpsEngineV2: calling mutative operations (transfer and margin changes, trades, manager sUSD operations),
   using market and posistion views
 - to PerpsStorageV2: getting low level market (e.g. baseAsset) and position (e.g. size) details
 - to ExchangeRates: rates
 - to Exchanger: dynamic fees

 User interactions:
 - any user: can manage their own account's positions in any market

 Inheritance:
 - PerpsConfigGettersV2Mixin: calls FlexibleStorage to get configuration values set by manager (PerpsManagerV2)

 Main responsibilities: auth, determining the fee rates (fixed, dynamic, etc), and price deltas,
 convenience methods (e.g. methods that are combinations of other methods), handling and storing temporary order data.

 State & upgradability: can have some short-lived state due to unprocessed async orders (e.g. in next-price mixin).

 Risks: auth, bad execution params (such as fees, rates, price deltas) etc, privileged access to engine.
*/
contract PerpsOrdersV2Base is PerpsConfigGettersV2Mixin, IPerpsTypesV2 {
    using SafeMath for uint;
    using SignedSafeMath for int;
    using SignedSafeDecimalMath for int;
    using SafeDecimalMath for uint;

    /* ========== CONSTANTS ========== */

    //slither-disable-next-line naming-convention
    bytes32 internal constant sUSD = "sUSD";

    /* ---------- Address Resolver Configuration ---------- */

    bytes32 internal constant CONTRACT_PERPSENGINEV2 = "PerpsEngineV2";
    bytes32 internal constant CONTRACT_PERPSTORAGEV2 = "PerpsStorageV2";
    bytes32 internal constant CONTRACT_EXCHANGERATES = "ExchangeRates";
    bytes32 internal constant CONTRACT_EXCHANGER = "Exchanger";

    /* ========== PUBLIC CONSTANTS ========== */

    bytes32 public constant CONTRACT_NAME = "PerpsOrdersV2";

    /* ========== CONSTRUCTOR ========== */

    constructor(address _resolver) public PerpsConfigGettersV2Mixin(_resolver) {}

    /* ========== EXTERNAL VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = PerpsConfigGettersV2Mixin.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](4);
        newAddresses[0] = CONTRACT_PERPSENGINEV2;
        newAddresses[1] = CONTRACT_PERPSTORAGEV2;
        newAddresses[2] = CONTRACT_EXCHANGERATES;
        newAddresses[3] = CONTRACT_EXCHANGER;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    /* ---------- External Contracts ---------- */

    /// PerpsEngineV2 contract (with its external interface - for accessing views)
    function engineContract() public view returns (IPerpsEngineV2External) {
        return IPerpsEngineV2External(requireAndGetAddress(CONTRACT_PERPSENGINEV2));
    }

    /// PerpsStorageV2 contract for accessing low level views (with its external interface - views only)
    function stateContract() public view returns (IPerpsStorageV2External) {
        return IPerpsStorageV2External(requireAndGetAddress(CONTRACT_PERPSTORAGEV2));
    }

    /// the fixed fee rate component in 18 decimals
    function baseFee(bytes32 marketKey) external view returns (uint) {
        return _baseFee(marketKey);
    }

    /// the fee rate including fixed and dynamic fees in 18 decimals
    function feeRate(bytes32 marketKey) external view returns (uint) {
        return _feeRate(marketKey);
    }

    /// the fee amount for an order of sizeDelta in sUSD 18 decimals
    function orderFee(bytes32 marketKey, int sizeDelta) external view returns (uint fee, bool invalid) {
        uint curPrice;
        (curPrice, invalid) = engineContract().assetPrice(marketKey);
        return (_feeAmountForPrice(sizeDelta, curPrice, _feeRate(marketKey)), invalid);
    }

    /// the dynamic fee rate component for current round in 18 decimals
    function dynamicFeeRate(bytes32 marketKey) external view returns (uint rate, bool tooVolatile) {
        return _dynamicFeeRate(marketKey);
    }

    /// position summary struct passed from the engine
    function positionSummary(bytes32 marketKey, address account) external view returns (PositionSummary memory) {
        return engineContract().positionSummary(marketKey, account);
    }

    /// markets summary struct passed from the engine
    function marketSummary(bytes32 marketKey) external view returns (MarketSummary memory) {
        return engineContract().marketSummary(marketKey);
    }

    /// view for returning max possible order size that take into account existing positions (passed from engine)
    function maxOrderSizes(bytes32 marketKey) external view returns (uint long, uint short) {
        return engineContract().maxOrderSizes(marketKey);
    }

    /* ========== INTERNAL VIEWS ========== */

    /// PerpsEngineV2 with internal mutative interface
    function _engineInternal() internal view returns (IPerpsEngineV2Internal) {
        return IPerpsEngineV2Internal(requireAndGetAddress(CONTRACT_PERPSENGINEV2));
    }

    /// ExchangeRates contract for accessing price feed methods
    function _exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXCHANGERATES));
    }

    /// Exchanger contract for accessing dynamic fee rate
    function _exchanger() internal view returns (IExchanger) {
        return IExchanger(requireAndGetAddress(CONTRACT_EXCHANGER));
    }

    /// baseAsset view that uses storage contract directly
    function _baseAsset(bytes32 marketKey) internal view returns (bytes32) {
        return stateContract().marketScalars(marketKey).baseAsset;
    }

    /// Uses the exchanger to get the dynamic fee (SIP-184) for trading from sUSD to baseAsset
    /// this assumes dynamic fee is symmetric in direction of trade.
    /// @dev this is a pretty expensive action in terms of execution gas as it queries a lot
    ///   of past rates from oracle. Shouldn't be much of an issue on L2 though.
    function _dynamicFeeRate(bytes32 marketKey) internal view returns (uint rate, bool tooVolatile) {
        return _exchanger().dynamicFeeRateForExchange(sUSD, _baseAsset(marketKey));
    }

    /// returns dynamic fee value but reverts if it's tooVolatile for exchange (as returned by exchanger)
    function _dynamicFeeRateChecked(bytes32 marketKey) internal view returns (uint) {
        // get the dynamic fee rate SIP-184
        (uint _rate, bool tooVolatile) = _dynamicFeeRate(marketKey);
        // revert if too volatile
        require(!tooVolatile, "Price too volatile");
        return _rate;
    }

    /// the fee rate including fixed and dynamic fees in 18 decimals
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

    /// calculate fee amount using current asset price and given rate and order size
    function _feeAmountCurrentPrice(
        bytes32 marketKey,
        int sizeDelta,
        uint feeRate
    ) internal view returns (uint fee) {
        (uint curPrice, ) = engineContract().assetPrice(marketKey);
        return _feeAmountForPrice(sizeDelta, curPrice, feeRate);
    }

    /// calculate fee amount using given price, rate, and order size
    function _feeAmountForPrice(
        int sizeDelta,
        uint price,
        uint feeRate
    ) internal pure returns (uint fee) {
        uint absSizeDelta = uint(sizeDelta > 0 ? sizeDelta : -sizeDelta);
        return absSizeDelta.multiplyDecimal(price).multiplyDecimal(feeRate);
    }

    /* ========== EXTERNAL MUTATIVE ========== */

    /*
     * Alter the amount of margin in a position. A positive input triggers a deposit; a negative one, a
     * withdrawal. The sUSD will be burnt or issued directly into/out of the caller's wallet.
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
    function withdrawMaxMargin(bytes32 marketKey) external {
        address account = msg.sender;
        uint withdrawable = engineContract().withdrawableMargin(marketKey, account);
        _engineInternal().transferMargin(marketKey, account, -int(withdrawable));
    }

    /*
     * Adjust the sender's position size.
     * Reverts if the resulting position is too large, outside the max leverage, or is liquidating.
     */
    function trade(bytes32 marketKey, int sizeDelta) external {
        _trade(marketKey, sizeDelta, bytes32(0));
    }

    /*
     * Same as trade, but emits an event with the passed tracking code to
     * allow off chain calculations for fee sharing with originating integrations
     */
    function tradeWithTracking(
        bytes32 marketKey,
        int sizeDelta,
        bytes32 trackingCode
    ) external {
        _trade(marketKey, sizeDelta, trackingCode);
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

    /// Shortcut method to transfer margin and trade in a single tx.
    function transferAndTrade(
        bytes32 marketKey,
        int marginDelta,
        int sizeDelta,
        bytes32 trackingCode
    ) external {
        _engineInternal().transferMargin(marketKey, msg.sender, marginDelta);
        _trade(marketKey, sizeDelta, trackingCode);
    }

    /// Shortcut method to trade and transfer margin in a single tx (inverse of transferAndTrade).
    function tradeAndTransfer(
        bytes32 marketKey,
        int marginDelta,
        int sizeDelta,
        bytes32 trackingCode
    ) external {
        _trade(marketKey, sizeDelta, trackingCode);
        _engineInternal().transferMargin(marketKey, msg.sender, marginDelta);
    }

    /* ========== INTERNAL MUTATIVE ========== */

    function _trade(
        bytes32 marketKey,
        int sizeDelta,
        bytes32 trackingCode
    ) internal {
        ExecutionOptions memory options =
            ExecutionOptions({
                feeAmount: _feeAmountCurrentPrice(marketKey, sizeDelta, _feeRate(marketKey)),
                priceDelta: 0,
                trackingCode: trackingCode
            });
        _engineInternal().trade(marketKey, msg.sender, sizeDelta, options);
    }

    function _closePosition(bytes32 marketKey, bytes32 trackingCode) internal {
        int size = stateContract().position(marketKey, msg.sender).size;
        _trade(marketKey, -size, trackingCode);
    }
}
