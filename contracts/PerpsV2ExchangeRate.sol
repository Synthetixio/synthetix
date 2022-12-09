pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./Owned.sol";
import "./MixinSystemSettings.sol";
import "openzeppelin-solidity-2.3.0/contracts/utils/ReentrancyGuard.sol";

// Internal references

// Inheritance
import "./interfaces/IPyth.sol";
import "./interfaces/PythStructs.sol";

// https://docs.synthetix.io/contracts/source/contracts/PerpsV2ExchangeRate
contract PerpsV2ExchangeRate is Owned, ReentrancyGuard, MixinSystemSettings {
    bytes32 public constant CONTRACT_NAME = "PerpsV2ExchangeRate";

    bytes32 internal constant SETTING_OFFCHAIN_ORACLE = "offchainOracle";
    bytes32 internal constant SETTING_OFFCHAIN_PRICE_FEED_ID = "priceFeedId";

    /* ========== CONSTRUCTOR ========== */
    constructor(address _owner, address _resolver) public Owned(_owner) MixinSystemSettings(_resolver) {}

    /* ========== SETTERS ========== */

    function setOffchainOracle(address offchainOracle) external onlyOwner {
        flexibleStorage().setAddressValue(CONTRACT_NAME, SETTING_OFFCHAIN_ORACLE, offchainOracle);
        emit OffchainOracleUpdated(offchainOracle);
    }

    function setOffchainPriceFeedId(bytes32 assetId, bytes32 priceFeedId) external onlyOwner {
        flexibleStorage().setBytes32Value(
            CONTRACT_NAME,
            keccak256(abi.encodePacked(SETTING_OFFCHAIN_PRICE_FEED_ID, assetId)),
            priceFeedId
        );
        emit OffchainPriceFeedIdUpdated(assetId, priceFeedId);
    }

    /* ========== VIEWS ========== */

    function offchainOracle() public view returns (IPyth) {
        return IPyth(flexibleStorage().getAddressValue(CONTRACT_NAME, SETTING_OFFCHAIN_ORACLE));
    }

    function offchainPriceFeedId(bytes32 assetId) public view returns (bytes32) {
        return
            flexibleStorage().getBytes32Value(
                CONTRACT_NAME,
                keccak256(abi.encodePacked(SETTING_OFFCHAIN_PRICE_FEED_ID, assetId))
            );
    }

    /* ---------- priceFeeds mutation ---------- */

    function updatePythPrice(address sender, bytes[] calldata priceUpdateData) external payable nonReentrant {
        // Get fee amount to pay to Pyth
        uint fee = offchainOracle().getUpdateFee(priceUpdateData.length);
        require(msg.value >= fee, "Not enough eth for paying the fee");

        // Update the price data (and pay the fee)
        offchainOracle().updatePriceFeeds.value(fee)(priceUpdateData);

        if (msg.value - fee > 0) {
            // Need to refund caller. Try to return unused value, or revert if failed
            // solhint-disable-next-line  avoid-low-level-calls
            (bool success, ) = sender.call.value(msg.value - fee)("");
            require(success, "Failed to refund caller");
        }
    }

    // it is a view but it can revert
    function resolveAndGetPrice(bytes32 assetId, uint maxAge) external view returns (uint price, uint publishTime) {
        bytes32 priceFeedId = offchainPriceFeedId(assetId);
        require(priceFeedId != 0, "No price feed found for asset");

        return _getPythPrice(priceFeedId, maxAge);
    }

    // it is a view but it can revert
    function resolveAndGetLatestPrice(bytes32 assetId) external view returns (uint price, uint publishTime) {
        bytes32 priceFeedId = offchainPriceFeedId(assetId);
        require(priceFeedId != 0, "No price feed found for asset");

        return _getPythPriceUnsafe(priceFeedId);
    }

    function _calculatePrice(PythStructs.Price memory retrievedPrice) internal view returns (uint price) {
        /*
        retrievedPrice.price fixed-point representation base
        retrievedPrice.expo fixed-point representation exponent (to go from base to decimal)
        retrievedPrice.conf fixed-point representation of confidence         
        i.e. 
        .price = 12276250
        .expo = -5
        price = 12276250 * 10^(-5) =  122.76250
        to go to 18 decimals => rebasedPrice = 12276250 * 10^(18-5) = 122762500000000000000
        */

        // Adjust exponent (using base as 18 decimals)
        uint baseConvertion = 10**uint(int(18) + retrievedPrice.expo);

        // TODO use the confidence?
        price = uint(retrievedPrice.price * int(baseConvertion));
    }

    function _getPythPriceUnsafe(bytes32 priceFeedId) internal view returns (uint price, uint publishTime) {
        // TODO check if getPrice failed (reverted) and fallback to CL
        // It shouldn't revert since it was updated before... but...
        PythStructs.Price memory retrievedPrice = offchainOracle().getPriceUnsafe(priceFeedId);

        price = _calculatePrice(retrievedPrice);
        publishTime = retrievedPrice.publishTime;
    }

    function _getPythPrice(bytes32 priceFeedId, uint maxAge) internal view returns (uint price, uint publishTime) {
        // TODO check if getPrice failed (reverted) and fallback to CL
        // It shouldn't revert since it was updated before... but...
        PythStructs.Price memory retrievedPrice = offchainOracle().getPriceNoOlderThan(priceFeedId, maxAge);

        price = _calculatePrice(retrievedPrice);
        publishTime = retrievedPrice.publishTime;
    }

    event OffchainOracleUpdated(address offchainOracle);
    event OffchainPriceFeedIdUpdated(bytes32 assetId, bytes32 priceFeedId);
}
