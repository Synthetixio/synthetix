pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Empty contract for ether collateral placeholder for OVM
// https://docs.synthetix.io/contracts/source/contracts/emptyethercollateral

import "./interfaces/IFuturesMarketManager.sol";

contract EmptyFuturesMarketManager is IFuturesMarketManager {
    bytes32 public constant CONTRACT_NAME = "EmptyFuturesMarketManager";

    function numMarkets() external view returns (uint) {
        return 0;
    }

    function totalDebt() external view returns (uint debt, bool isInvalid) {
        return (0, false);
    }

    function allMarketSummaries() external view returns (MarketSummaryV1[] memory summaries) {
        return summaries;
    }

    function isMarket(bytes32 marketKey) external view returns (bool) {
        marketKey;
        return false;
    }

    function markets(uint index, uint pageSize) external view returns (address[] memory _markets) {
        index;
        pageSize;
        return _markets;
    }

    function allMarketsV1() external view returns (address[] memory _markets) {
        return _markets;
    }

    function marketForKey(bytes32 marketKey) external view returns (address) {
        marketKey;
        return address(0);
    }

    function marketsForKeys(bytes32[] calldata marketKeys) external view returns (address[] memory _markets) {
        marketKeys;
        return _markets;
    }

    function marketSummariesForKeysV1(bytes32[] calldata marketKeys)
        external
        view
        returns (MarketSummaryV1[] memory summaries)
    {
        marketKeys;
        return summaries;
    }
}
