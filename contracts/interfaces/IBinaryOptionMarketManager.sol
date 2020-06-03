pragma solidity >=0.4.24;

import "../interfaces/IBinaryOptionMarket.sol";

contract IBinaryOptionMarketManager {
    /* ========== VIEWS / VARIABLES ========== */

    function fees() external view returns (uint poolFee, uint creatorFee, uint refundFee);
    function durations() external view returns (uint oracleMaturityWindow, uint exerciseDuration, uint creatorDestructionDuration, uint maxTimeToMaturity);

    function capitalRequirement() external view returns (uint);
    function marketCreationEnabled() external view returns (bool);
    function totalDeposited() external view returns (uint);

    function numMarkets() external view returns (uint);
    function markets(uint index, uint pageSize) external view returns (address[] memory);
    function publiclyDestructibleTime(address market) external view returns (uint);

    /* ========== MUTATIVE FUNCTIONS ========== */

    function createMarket(
        bytes32 oracleKey, uint targetPrice,
        uint[2] calldata times, // [biddingEnd, maturity]
        uint[2] calldata bids // [longBid, shortBid]
    ) external returns (IBinaryOptionMarket);

    function destroyMarket(address market) external;
}
