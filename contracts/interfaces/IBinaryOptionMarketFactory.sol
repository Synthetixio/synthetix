pragma solidity ^0.5.16;

import "../interfaces/IBinaryOptionMarket.sol";

contract IBinaryOptionMarketFactory {

    struct Durations {
        uint256 oracleMaturityWindow;
        uint256 exerciseDuration;
        uint256 creatorDestructionDuration;
        uint256 maxTimeToMaturity;
    }

    IBinaryOptionMarket.Fees public fees;
    Durations public durations;

    uint256 public minimumInitialLiquidity;
    bool public marketCreationEnabled;
    uint256 public totalDeposited;

    function numMarkets() external view returns (uint256);
    function markets(uint256 index, uint256 pageSize) external view returns (address[] memory);
    function publiclyDestructibleTime(address market) public view returns (uint256);

    function createMarket(
        uint256 endOfBidding,
        uint256 maturity,
        bytes32 oracleKey,
        uint256 targetPrice,
        uint256 longBid,
        uint256 shortBid
    ) external returns (IBinaryOptionMarket);

    function destroyMarket(address market) external;

    event MarketCreated(address market, address indexed creator, bytes32 indexed oracleKey, uint256 targetPrice, uint256 endOfBidding, uint256 maturity);
    event MarketDestroyed(address market, address indexed destroyer);
    event MarketsMigrated(IBinaryOptionMarketFactory receivingFactory, IBinaryOptionMarket[] markets);
    event MarketsReceived(IBinaryOptionMarketFactory migratingFactory, IBinaryOptionMarket[] markets);
    event OracleMaturityWindowUpdated(uint256 duration);
    event ExerciseDurationUpdated(uint256 duration);
    event CreatorDestructionDurationUpdated(uint256 duration);
    event MaxTimeToMaturityUpdated(uint256 duration);
    event MinimumInitialLiquidityUpdated(uint256 value);
    event PoolFeeUpdated(uint256 fee);
    event CreatorFeeUpdated(uint256 fee);
    event RefundFeeUpdated(uint256 fee);
    event MarketCreationUpdated(bool enabled);
}
