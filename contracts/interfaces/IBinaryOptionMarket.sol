pragma solidity >=0.4.24;

import "../interfaces/IBinaryOptionMarketFactory.sol";
import "../interfaces/IBinaryOption.sol";

contract IBinaryOptionMarket {
    enum Phase { Bidding, Trading, Maturity, Destruction }
    enum Side { Long, Short }

    struct Options {
        IBinaryOption long;
        IBinaryOption short;
    }

    struct Prices {
        uint long;
        uint short;
    }

    struct Times {
        uint biddingEnd;
        uint maturity;
        uint destruction;
    }

    struct OracleDetails {
        bytes32 key;
        uint targetPrice;
        uint finalPrice;
        uint maturityWindow;
    }

    struct Fees {
        uint poolFee;
        uint creatorFee;
        uint refundFee;
        uint creatorFeesCollected;
    }

    address public creator;
    IBinaryOptionMarketFactory public factory;

    Options public options;
    Prices public prices;
    Times public times;
    OracleDetails public oracleDetails;
    Fees public fees;

    uint public deposited;
    uint public minimumInitialLiquidity;
    bool public resolved;

    function phase() external view returns (Phase);
    function oraclePriceAndTimestamp() public view returns (uint price, uint updatedAt);
    function canResolve() external view returns (bool);
    function result() public view returns (Side);
    function destructionReward() external view returns (uint);

    function bidsOf(address account) public view returns (uint long, uint short);
    function totalBids() public view returns (uint long, uint short);
    function claimableBy(address account) public view returns (uint long, uint short);
    function totalClaimable() external view returns (uint long, uint short);
    function balancesOf(address account) public view returns (uint long, uint short);
    function totalSupplies() external view returns (uint long, uint short);
    function totalExercisable() external view returns (uint long, uint short);

    function bid(Side side, uint value) external;
    function refund(Side side, uint value) external returns (uint refundMinusFee);

    function resolve() public;
    function claimOptions() public returns (uint longClaimed, uint shortClaimed);
    function exerciseOptions() external returns (uint);

    function selfDestruct(address payable beneficiary) external;

    event Bid(Side side, address indexed account, uint value);
    event Refund(Side side, address indexed account, uint value, uint fee);
    event PricesUpdated(uint longPrice, uint shortPrice);
    event MarketResolved(Side result, uint oraclePrice, uint oracleTimestamp);
    event OptionsClaimed(address indexed account, uint longOptions, uint shortOptions);
    event OptionsExercised(address indexed account, uint value);
}
