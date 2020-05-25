pragma solidity ^0.5.16;

import "./IBinaryOptionMarketFactory.sol";
import "./IBinaryOption.sol";

contract IBinaryOptionMarket {
    enum Phase { Bidding, Trading, Maturity, Destruction }
    enum Side { Long, Short }

    struct Options {
        IBinaryOption long;
        IBinaryOption short;
    }

    struct Prices {
        uint256 long;
        uint256 short;
    }

    address public creator;
    IBinaryOptionMarketFactory public factory;

    Options public options;
    Prices public prices;

    uint256 public deposited;
    uint256 public minimumInitialLiquidity;

    uint256 public endOfBidding;
    uint256 public maturity;
    uint256 public destruction;

    bytes32 public oracleKey;
    uint256 public targetOraclePrice;
    uint256 public finalOraclePrice;
    uint256 public oracleMaturityWindow;
    bool public resolved;
    uint256 public poolFee;
    uint256 public creatorFee;
    uint256 public refundFee;
    uint256 public creatorFeesCollected;
    uint256 public poolFeesCollected;

    function phase() external view returns (Phase);
    function oraclePriceAndTimestamp() public view returns (uint256 price, uint256 updatedAt);
    function canResolve() external view returns (bool);
    function result() public view returns (Side);
    function destructionFunds() public view returns (uint256);

    function bidsOf(address account) public view returns (uint256 long, uint256 short);
    function totalBids() external view returns (uint256 long, uint256 short);
    function claimableBy(address account) public view returns (uint256 long, uint256 short);
    function totalClaimable() external view returns (uint256 long, uint256 short);
    function balancesOf(address account) public view returns (uint256 long, uint256 short);
    function totalSupplies() external view returns (uint256 long, uint256 short);
    function totalExercisable() external view returns (uint256 long, uint256 short);

    function bidLong(uint256 bid) external;
    function bidShort(uint256 bid) external;
    function refundLong(uint256 refund) external returns (uint256);
    function refundShort(uint256 refund) external returns (uint256);

    function resolve() public;
    function claimOptions() public returns (uint256 longClaimed, uint256 shortClaimed);
    function exerciseOptions() public returns (uint256);

    event Bid(Side side, address indexed bidder, uint256 bid);
    event Refund(Side side, address indexed refunder, uint256 refund, uint256 fee);
    event PricesUpdated(uint256 longPrice, uint256 shortPrice);
    event MarketResolved(Side result, uint256 oraclePrice, uint256 oracleTimestamp);
    event OptionsClaimed(address indexed claimant, uint256 longOptions, uint256 shortOptions);
    event OptionsExercised(address indexed claimant, uint256 payout);
}
