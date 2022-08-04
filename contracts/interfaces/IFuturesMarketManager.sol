pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// interface for perps manager
import "./IPerpsInterfacesV2.sol";

/// external interface
interface IFuturesMarketManager {
    // summary format that can combine top level details from both V1 and V2
    struct MarketSummaryV1 {
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

    function perpsManagerV2() external view returns (IPerpsManagerV2);

    // V1 + V2
    function numMarkets() external view returns (uint);

    function totalDebt() external view returns (uint debt, bool isInvalid);

    function allMarketSummaries() external view returns (MarketSummaryV1[] memory);

    function isMarket(bytes32 marketKey) external view returns (bool);

    // V1

    function numMarketsV1() external view returns (uint);

    function isMarketV1(bytes32 marketKey) external view returns (bool);

    function markets(uint index, uint pageSize) external view returns (address[] memory);

    function totalDebtV1() external view returns (uint debt, bool isInvalid);

    function allMarketsV1() external view returns (address[] memory);

    function marketForKey(bytes32 marketKey) external view returns (address);

    function marketsForKeys(bytes32[] calldata marketKeys) external view returns (address[] memory);

    function allMarketSummariesV1() external view returns (MarketSummaryV1[] memory);

    function marketSummariesV1(address[] calldata addresses) external view returns (MarketSummaryV1[] memory);

    function marketSummariesForKeysV1(bytes32[] calldata marketKeys) external view returns (MarketSummaryV1[] memory);
}

/// internal interface
interface IFuturesMarketManagerInternal {
    // Mutative owner actions (V1)
    function addMarkets(address[] calldata marketsToAdd) external;

    function removeMarkets(address[] calldata marketsToRemove) external;

    function removeMarketsByKey(bytes32[] calldata marketKeysToRemove) external;

    // Mutative internal for markets & order methods
    function issueSUSD(address account, uint amount) external;

    function burnSUSD(address account, uint amount) external returns (uint postReclamationAmount);

    function payFee(uint amount) external;
}
