pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./PerpsV2SettingsMixin.sol";
import "./interfaces/IPerpsV2Market.sol";

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

contract PerpsV2OrdersBase is PerpsV2SettingsMixin, IPerpsV2Types {
    /* ========== CONSTANTS ========== */

    // This is the same unit as used inside `SignedSafeDecimalMath`.
    int private constant _UNIT = int(10**uint(18));

    //slither-disable-next-line naming-convention
    bytes32 internal constant sUSD = "sUSD";

    /* ========== STATE VARIABLES ========== */

    bytes32 public constant CONTRACT_NAME = "PerpsV2Orders";

    /* ---------- Address Resolver Configuration ---------- */

    bytes32 internal constant CONTRACT_FUTURESMARKETMANAGER = "FuturesMarketManager";
    bytes32 internal constant CONTRACT_PERPSV2SETTINGS = "PerpsV2Settings";
    bytes32 internal constant CONTRACT_PERPSV2ENGINE = "PerpsV2Engine";
    bytes32 internal constant CONTRACT_PERPSV2STORAGE = "PerpsV2Storage";
    bytes32 internal constant CONTRACT_EXCHANGERATES = "ExchangeRates";

    /* ========== CONSTRUCTOR ========== */

    constructor(address _resolver) public PerpsV2SettingsMixin(_resolver) {}

    /* ========== VIEWS ========== */

    /* ---------- External Contracts ---------- */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = PerpsV2SettingsMixin.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](5);
        newAddresses[0] = CONTRACT_FUTURESMARKETMANAGER;
        newAddresses[1] = CONTRACT_PERPSV2SETTINGS;
        newAddresses[2] = CONTRACT_PERPSV2ENGINE;
        newAddresses[3] = CONTRACT_PERPSV2STORAGE;
        newAddresses[4] = CONTRACT_EXCHANGERATES;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    function engineContract() public view returns (IPerpsV2EngineExternal) {
        return IPerpsV2EngineExternal(requireAndGetAddress(CONTRACT_PERPSV2ENGINE));
    }

    function storageContract() public view returns (IPerpsV2StorageExternal) {
        return IPerpsV2StorageExternal(requireAndGetAddress(CONTRACT_PERPSV2STORAGE));
    }

    function baseFee(bytes32 marketKey) external view returns (uint feeRate) {
        return _baseFee(marketKey);
    }

    // INTERNAL

    function _manager() internal view returns (IFuturesMarketManagerInternal) {
        return IFuturesMarketManagerInternal(requireAndGetAddress(CONTRACT_FUTURESMARKETMANAGER));
    }

    function _engineInternal() internal view returns (IPerpsV2EngineInternal) {
        return IPerpsV2EngineInternal(requireAndGetAddress(CONTRACT_PERPSV2ENGINE));
    }

    function _exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXCHANGERATES));
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
     * in the account if the caller has a position open. Equivalent to `transferMargin(-accessibleMargin(sender))`.
     */
    function withdrawAllMargin(bytes32 marketKey) external {
        address account = msg.sender;
        (, PositionStatus memory posStatus) = engineContract().positionDetails(marketKey, account);
        int marginDelta = -int(posStatus.accessibleMargin);
        _engineInternal().transferMargin(marketKey, account, marginDelta);
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
     * allow offchain calculations for fee sharing with originating integrations
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
        _engineInternal().trade(marketKey, msg.sender, sizeDelta, _baseFee(marketKey), trackingCode);
    }

    function _closePosition(bytes32 marketKey, bytes32 trackingCode) internal {
        int size = storageContract().positions(marketKey, msg.sender).size;
        require(size != 0, "No position open");
        _modifyPosition(marketKey, -size, trackingCode);
    }
}
