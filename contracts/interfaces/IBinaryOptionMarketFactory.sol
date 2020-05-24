pragma solidity ^0.5.16;

import "./IBinaryOptionMarket.sol";

contract IBinaryOptionMarketFactory {
    uint256 public oracleMaturityWindow;
    uint256 public exerciseDuration;
    uint256 public creatorDestructionDuration;

    uint256 public poolFee;
    uint256 public creatorFee;
    uint256 public refundFee;

    uint256 public minimumInitialLiquidity;
    uint256 public totalDeposited;

    bool public marketCreationEnabled;
    address[] public markets;
    function allMarkets() public view returns (address[] memory);
    function numMarkets() public view returns (uint256);
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

    event BinaryOptionMarketCreated(address market, address indexed creator, bytes32 indexed oracleKey, uint256 targetPrice, uint256 endOfBidding, uint256 maturity);
    event BinaryOptionMarketDestroyed(address market, address indexed destroyer);
    event ExerciseDurationChanged(uint256 duration);
    event CreatorDestructionDurationChanged(uint256 duration);
    event MinimumInitialLiquidityChanged(uint256 value);
    event PoolFeeChanged(uint256 fee);
    event CreatorFeeChanged(uint256 fee);
    event RefundFeeChanged(uint256 fee);
}
