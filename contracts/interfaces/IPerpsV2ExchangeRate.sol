pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./IPyth.sol";

// https://docs.synthetix.io/contracts/source/contracts/IPerpsV2ExchangeRate
interface IPerpsV2ExchangeRate {
    function setOffchainOracle(IPyth _offchainOracle) external;

    function setOffchainPriceFeedId(bytes32 assetId, bytes32 priceFeedId) external;

    /* ========== VIEWS ========== */

    function offchainOracle() external view returns (IPyth);

    function offchainPriceFeedId(bytes32 assetId) external view returns (bytes32);

    /* ---------- priceFeeds mutation ---------- */

    function updatePythPrice(address sender, bytes[] calldata priceUpdateData) external payable;

    // it is a view but it can revert
    function resolveAndGetPrice(bytes32 assetId, uint maxAge) external view returns (uint price, uint publishTime);

    // it is a view but it can revert
    function resolveAndGetLatestPrice(bytes32 assetId) external view returns (uint price, uint publishTime);
}
