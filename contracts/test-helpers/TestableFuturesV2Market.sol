pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../FuturesV2Market.sol";
import "../interfaces/IFuturesV2MarketViews.sol";

contract TestableFuturesV2Market is FuturesV2Market, IFuturesV2MarketViews {
    constructor(
        address payable _proxy,
        address _marketState,
        address _owner,
        address _resolver
    ) public FuturesV2Market(_proxy, _marketState, _owner, _resolver) {}

    function entryDebtCorrection() external view returns (int) {
        return marketState.entryDebtCorrection();
    }

    function proportionalSkew() external view returns (int) {
        (uint price, ) = _assetPrice();
        return _proportionalSkew(price);
    }

    function maxFundingRate() external view returns (uint) {
        return _maxFundingRate(marketState.marketKey());
    }

    /*
     * The maximum size in base units of an order on each side of the market that will not exceed the max market value.
     */
    function maxOrderSizes()
        external
        view
        returns (
            uint long,
            uint short,
            bool invalid
        )
    {
        uint price;
        (price, invalid) = _assetPrice();
        int sizeLimit = int(_maxMarketValueUSD(marketState.marketKey())).divideDecimal(int(price));
        (uint longSize, uint shortSize) = _marketSizes();
        long = uint(sizeLimit.sub(_min(int(longSize), sizeLimit)));
        short = uint(sizeLimit.sub(_min(int(shortSize), sizeLimit)));
        return (long, short, invalid);
    }

    function _marketSizes() internal view returns (uint, uint) {
        int size = int(marketState.marketSize());
        int skew = marketState.marketSkew();
        return (_abs(size.add(skew).div(2)), _abs(size.sub(skew).div(2)));
    }

    /**
     * The minimal margin at which liquidation can happen. Is the sum of liquidationBuffer and liquidationFee.
     * Reverts if position size is 0.
     * @param account address of the position account
     * @return lMargin liquidation margin to maintain in sUSD fixed point decimal units
     */
    function liquidationMargin(address account) external view returns (uint lMargin) {
        require(marketState.getPosition(account).size != 0, "0 size position"); // reverts because otherwise minKeeperFee is returned
        (uint price, ) = _assetPrice();
        return _liquidationMargin(int(marketState.getPosition(account).size), price);
    }

    /*
     * Equivalent to the position's notional value divided by its remaining margin.
     */
    function currentLeverage(address account) external view returns (int leverage, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice();
        Position memory position = marketState.getPosition(account);
        uint remainingMargin_ = _remainingMargin(position, price);
        return (_currentLeverage(position, price, remainingMargin_), isInvalid);
    }

    // Empty views to implement interface
    function marketKey() external view returns (bytes32 key) {
        return "";
    }

    function baseAsset() external view returns (bytes32 key) {
        return "";
    }

    function marketSize() external view returns (uint128 size) {
        return 0;
    }

    function marketSkew() external view returns (int128 skew) {
        return 0;
    }

    function fundingLastRecomputed() external view returns (uint32 timestamp) {
        return 0;
    }

    // solhint-disable no-unused-vars
    function fundingSequence(uint index) external view returns (int128 netFunding) {
        return 0;
    }

    function positions(address account)
        external
        view
        returns (
            uint64 id,
            uint64 lastFundingIndex,
            uint128 margin,
            uint128 lastPrice,
            int128 size
        )
    {
        return (0, 0, 0, 0, 0);
    }

    function assetPrice() external view returns (uint price, bool invalid) {
        return (0, false);
    }

    function marketSizes() external view returns (uint long, uint short) {
        return (0, 0);
    }

    function marketDebt() external view returns (uint debt, bool isInvalid) {
        return (0, false);
    }

    function currentFundingRate() external view returns (int fundingRate) {
        return 0;
    }

    function unrecordedFunding() external view returns (int funding, bool invalid) {
        return (0, false);
    }

    function fundingSequenceLength() external view returns (uint length) {
        return 0;
    }

    /* ---------- Position Details ---------- */

    function notionalValue(address account) external view returns (int value, bool invalid) {
        return (0, false);
    }

    function profitLoss(address account) external view returns (int pnl, bool invalid) {
        return (0, false);
    }

    function accruedFunding(address account) external view returns (int funding, bool invalid) {
        return (0, false);
    }

    function remainingMargin(address account) external view returns (uint marginRemaining, bool invalid) {
        return (0, false);
    }

    function accessibleMargin(address account) external view returns (uint marginAccessible, bool invalid) {
        return (0, false);
    }

    function liquidationPrice(address account) external view returns (uint price, bool invalid) {
        return (0, false);
    }

    function liquidationFee(address account) external view returns (uint) {
        return 0;
    }

    function canLiquidate(address account) external view returns (bool) {
        return false;
    }

    function orderFee(int sizeDelta) external view returns (uint fee, bool invalid) {
        return (0, false);
    }

    function postTradeDetails(int sizeDelta, address sender)
        external
        view
        returns (
            uint margin,
            int size,
            uint price,
            uint liqPrice,
            uint fee,
            IFuturesV2MarketBaseTypes.Status status
        )
    {
        return (0, 0, 0, 0, 0, IFuturesV2MarketBaseTypes.Status.Ok);
    }
}
