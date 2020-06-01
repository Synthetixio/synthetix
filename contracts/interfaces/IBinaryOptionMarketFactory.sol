pragma solidity >=0.4.24;

import "../interfaces/IBinaryOptionMarket.sol";

contract IBinaryOptionMarketFactory {

    struct Durations {
        uint oracleMaturityWindow;
        uint exerciseDuration;
        uint creatorDestructionDuration;
        uint maxTimeToMaturity;
    }

    IBinaryOptionMarket.Fees public fees;
    Durations public durations;

    uint public minimumInitialLiquidity;
    bool public marketCreationEnabled;
    uint public totalDeposited;

    function numMarkets() external view returns (uint);
    function markets(uint index, uint pageSize) external view returns (address[] memory);
    function publiclyDestructibleTime(address market) public view returns (uint);

    function createMarket(
        uint biddingEnd, uint maturity,
        bytes32 oracleKey, uint targetPrice,
        uint longBid, uint shortBid
    ) external returns (IBinaryOptionMarket);

    function destroyMarket(address market) external;

    event MarketCreated(address market, address indexed creator, bytes32 indexed oracleKey, uint targetPrice, uint endOfBidding, uint maturity);
    event MarketDestroyed(address market, address indexed destroyer);
    event MarketsMigrated(IBinaryOptionMarketFactory receivingFactory, IBinaryOptionMarket[] markets);
    event MarketsReceived(IBinaryOptionMarketFactory migratingFactory, IBinaryOptionMarket[] markets);
    event MarketCreationEnabledUpdated(bool enabled);
    event OracleMaturityWindowUpdated(uint duration);
    event ExerciseDurationUpdated(uint duration);
    event CreatorDestructionDurationUpdated(uint duration);
    event MaxTimeToMaturityUpdated(uint duration);
    event MinimumInitialLiquidityUpdated(uint value);
    event PoolFeeUpdated(uint fee);
    event CreatorFeeUpdated(uint fee);
    event RefundFeeUpdated(uint fee);
}
