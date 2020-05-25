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

    struct Times {
        uint256 biddingEnd;
        uint256 maturity;
        uint256 destruction;
    }

    struct OracleDetails {
        bytes32 key;
        uint256 targetPrice;
        uint256 finalPrice;
        uint256 maturityWindow;
    }

    struct Fees {
        uint256 poolFee;
        uint256 creatorFee;
        uint256 refundFee;
    }

    struct FeesCollected {
        uint256 pool;
        uint256 creator;
    }

    address public creator;
    IBinaryOptionMarketFactory public factory;

    Options public options;
    Prices public prices;
    Times public times;
    OracleDetails public oracleDetails;
    Fees public fees;
    FeesCollected public feesCollected;

    uint256 public deposited;
    uint256 public minimumInitialLiquidity;
    bool public resolved;

    function phase() external view returns (Phase);
    function oraclePriceAndTimestamp() public view returns (uint256 price, uint256 updatedAt);
    function canResolve() external view returns (bool);
    function result() public view returns (Side);
    function destructionFunds() public view returns (uint256);

    function bidsOf(address account) public view returns (uint256 long, uint256 short);
    function totalBids() public view returns (uint256 long, uint256 short);
    function claimableBy(address account) public view returns (uint256 long, uint256 short);
    function totalClaimable() external view returns (uint256 long, uint256 short);
    function balancesOf(address account) public view returns (uint256 long, uint256 short);
    function totalSupplies() external view returns (uint256 long, uint256 short);
    function totalExercisable() external view returns (uint256 long, uint256 short);

    function bid(Side side, uint256 _bid) external;
    function refund(Side side, uint256 _refund) external returns (uint256 refundMinusFee);

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
