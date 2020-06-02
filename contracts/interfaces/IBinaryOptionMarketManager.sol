pragma solidity >=0.4.24;

import "../interfaces/IBinaryOptionMarket.sol";

contract IBinaryOptionMarketManager {

    struct Fees {
        uint poolFee;
        uint creatorFee;
        uint refundFee;
    }

    struct Durations {
        uint oracleMaturityWindow;
        uint exerciseDuration;
        uint creatorDestructionDuration;
        uint maxTimeToMaturity;
    }

    Fees public fees;
    Durations public durations;

    uint public capitalRequirement;
    bool public marketCreationEnabled;
    uint public totalDeposited;

    function numMarkets() external view returns (uint);
    function markets(uint index, uint pageSize) external view returns (address[] memory);
    function publiclyDestructibleTime(address market) external view returns (uint);

    function createMarket(
        bytes32 oracleKey, uint targetPrice,
        uint[2] calldata times, // [biddingEnd, maturity]
        uint[2] calldata bids // [longBid, shortBid]
    ) external returns (IBinaryOptionMarket);

    function destroyMarket(address market) external;

    event MarketCreated(address market, address indexed creator, bytes32 indexed oracleKey, uint targetPrice, uint biddingEndDate, uint maturityDate, uint destructionDate);
    event MarketDestroyed(address market, address indexed destroyer);
    event MarketsMigrated(IBinaryOptionMarketManager receivingManager, IBinaryOptionMarket[] markets);
    event MarketsReceived(IBinaryOptionMarketManager migratingManager, IBinaryOptionMarket[] markets);
    event MarketCreationEnabledUpdated(bool enabled);
    event OracleMaturityWindowUpdated(uint duration);
    event ExerciseDurationUpdated(uint duration);
    event CreatorDestructionDurationUpdated(uint duration);
    event MaxTimeToMaturityUpdated(uint duration);
    event CapitalRequirementUpdated(uint value);
    event PoolFeeUpdated(uint fee);
    event CreatorFeeUpdated(uint fee);
    event RefundFeeUpdated(uint fee);
}
