pragma solidity >=0.4.24;

import "../interfaces/IBinaryOptionMarket.sol";

// https://docs.synthetix.io/contracts/source/interfaces/IBinaryOptionMarketManager
interface IBinaryOptionMarketManager {
    /* ========== VIEWS / VARIABLES ========== */

    function fees()
        external
        view
        returns (
            uint poolFee,
            uint creatorFee,
            uint refundFee
        );

    function durations()
        external
        view
        returns (
            uint maxOraclePriceAge,
            uint expiryDuration,
            uint maxTimeToMaturity
        );

    function creatorLimits() external view returns (uint capitalRequirement, uint skewLimit);

    function marketCreationEnabled() external view returns (bool);

    function totalDeposited() external view returns (uint);

    function numActiveMarkets() external view returns (uint);

    function activeMarkets(uint index, uint pageSize) external view returns (address[] memory);

    function numMaturedMarkets() external view returns (uint);

    function maturedMarkets(uint index, uint pageSize) external view returns (address[] memory);

    /* ========== MUTATIVE FUNCTIONS ========== */

    function createMarket(
        bytes32 oracleKey,
        uint strikePrice,
        bool refundsEnabled,
        uint[2] calldata times, // [biddingEnd, maturity]
        uint[2] calldata bids // [longBid, shortBid]
    ) external returns (IBinaryOptionMarket);

    function resolveMarket(address market) external;

    function cancelMarket(address market) external;

    function expireMarkets(address[] calldata market) external;
}
