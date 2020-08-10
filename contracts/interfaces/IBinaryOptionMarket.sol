pragma solidity >=0.4.24;

import "../interfaces/IBinaryOptionMarketManager.sol";
import "../interfaces/IBinaryOption.sol";


interface IBinaryOptionMarket {
    /* ========== TYPES ========== */

    enum Phase {Bidding, Trading, Maturity, Expiry}
    enum Side {Long, Short}

    /* ========== VIEWS / VARIABLES ========== */

    function options() external view returns (IBinaryOption long, IBinaryOption short);

    function prices() external view returns (uint long, uint short);

    function times()
        external
        view
        returns (
            uint biddingEnd,
            uint maturity,
            uint destructino
        );

    function oracleDetails()
        external
        view
        returns (
            bytes32 key,
            uint strikePrice,
            uint finalPrice
        );

    function fees()
        external
        view
        returns (
            uint poolFee,
            uint creatorFee,
            uint refundFee
        );

    function creatorLimits() external view returns (uint capitalRequirement, uint skewLimit);

    function deposited() external view returns (uint);

    function creator() external view returns (address);

    function resolved() external view returns (bool);

    function refundsEnabled() external view returns (bool);

    function phase() external view returns (Phase);

    function oraclePriceAndTimestamp() external view returns (uint price, uint updatedAt);

    function canResolve() external view returns (bool);

    function result() external view returns (Side);

    function pricesAfterBidOrRefund(
        Side side,
        uint value,
        bool refund
    ) external view returns (uint long, uint short);

    function bidOrRefundForPrice(
        Side bidSide,
        Side priceSide,
        uint price,
        bool refund
    ) external view returns (uint);

    function bidsOf(address account) external view returns (uint long, uint short);

    function totalBids() external view returns (uint long, uint short);

    function claimableBalancesOf(address account) external view returns (uint long, uint short);

    function totalClaimableSupplies() external view returns (uint long, uint short);

    function balancesOf(address account) external view returns (uint long, uint short);

    function totalSupplies() external view returns (uint long, uint short);

    function exercisableDeposits() external view returns (uint);

    /* ========== MUTATIVE FUNCTIONS ========== */

    function bid(Side side, uint value) external;

    function refund(Side side, uint value) external returns (uint refundMinusFee);

    function claimOptions() external returns (uint longClaimed, uint shortClaimed);

    function exerciseOptions() external returns (uint);
}
