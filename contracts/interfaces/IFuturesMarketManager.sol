pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

/// external interface
interface IFuturesMarketManager {
    struct MarketSummary {
        string version;
        address market;
        bytes32 baseAsset;
        bytes32 marketKey;
        uint price;
        uint marketSize;
        int marketSkew;
        uint marketDebt;
        int currentFundingRate;
        bool priceInvalid;
    }

    // V1 + V2
    function numMarkets() external view returns (uint);

    function totalDebt() external view returns (uint debt, bool isInvalid);

    function allMarketSummaries() external view returns (MarketSummary[] memory);

    function isMarket(bytes32 marketKey) external view returns (bool);

    // V1 backwards compatibility for FuturesMarketData
    function marketForKey(bytes32 marketKey) external view returns (address); // backwards compatibility

    // V1
    function numMarketsV1() external view returns (uint);

    function isMarketV1(bytes32 marketKey) external view returns (bool);

    function marketsV1(uint index, uint pageSize) external view returns (address[] memory);

    function totalDebtV1() external view returns (uint debt, bool isInvalid);

    function allMarketsV1() external view returns (address[] memory);

    function marketV1ForKey(bytes32 marketKey) external view returns (address);

    function marketsV1ForKeys(bytes32[] calldata marketKeys) external view returns (address[] memory);

    function allMarketSummariesV1() external view returns (MarketSummary[] memory);

    function marketSummariesV1(address[] calldata addresses) external view returns (MarketSummary[] memory);

    function marketSummariesForKeysV1(bytes32[] calldata marketKeys) external view returns (MarketSummary[] memory);

    // V2
    function numMarketsV2() external view returns (uint);

    function marketsV2(uint index, uint pageSize) external view returns (bytes32[] memory);

    function isMarketV2(bytes32 marketKey) external view returns (bool);

    function allMarketsV2() external view returns (bytes32[] memory);

    function totalDebtV2() external view returns (uint debt, bool isInvalid);

    function allMarketSummariesV2() external view returns (MarketSummary[] memory);

    function marketSummariesV2(bytes32[] calldata marketKeys) external view returns (MarketSummary[] memory);
}

/// internal interface
interface IFuturesMarketManagerInternal {
    // view
    function approvedRouterAndMarket(address router, bytes32 marketKey) external view returns (bool approved);

    // Mutative V1 owner actions
    function addMarketsV1(address[] calldata marketsToAdd) external;

    function removeMarketsV1(address[] calldata marketsToRemove) external;

    function removeMarketsByKeyV1(bytes32[] calldata marketKeysToRemove) external;

    // Mutative V2 owner actions
    function addMarketsV2(bytes32[] calldata marketKeys, bytes32[] calldata assets) external;

    function removeMarketsV2(bytes32[] calldata marketKeys) external;

    // Mutative internal for engine & order methods
    function issueSUSD(address account, uint amount) external;

    function burnSUSD(address account, uint amount) external returns (uint postReclamationAmount);

    function payFee(uint amount, bytes32 trackingCode) external;

    function payFee(uint amount) external;
}
