pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../PerpsV2Market.sol";
import "../interfaces/IPerpsV2MarketViews.sol";
import "../interfaces/IPerpsV2MarketBaseTypes.sol";

contract TestablePerpsV2Market is PerpsV2Market, IPerpsV2MarketViews {
    constructor(
        address payable _proxy,
        address _marketState,
        address _owner,
        address _resolver
    ) public PerpsV2Market(_proxy, _marketState, _owner, _resolver) {}

    function entryDebtCorrection() external view returns (int) {
        return marketState.entryDebtCorrection();
    }

    function proportionalSkew() external view returns (int) {
        return _proportionalSkew();
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
        (, bool invalid) = _assetPrice();
        int sizeLimit = int(_maxMarketValue(_marketKey()));

        int size = int(marketState.marketSize());
        int skew = marketState.marketSkew();
        (uint longSize, uint shortSize) = (_abs(size.add(skew).div(2)), _abs(size.sub(skew).div(2)));

        long = uint(sizeLimit.sub(_min(int(longSize), sizeLimit)));
        short = uint(sizeLimit.sub(_min(int(shortSize), sizeLimit)));
        return (long, short, invalid);
    }

    /**
     * The minimal margin at which liquidation can happen. Is the sum of liquidationBuffer and liquidationFee.
     * Reverts if position size is 0.
     * @param account address of the position account
     * @return lMargin liquidation margin to maintain in sUSD fixed point decimal units
     */
    function liquidationMargin(address account) external view returns (uint lMargin) {
        (uint price, ) = _assetPrice();
        require(marketState.positions(account).size != 0, "0 size position"); // reverts because otherwise minKeeperFee is returned
        return _liquidationMargin(int(marketState.positions(account).size), price);
    }

    /*
     * Equivalent to the position's notional value divided by its remaining margin.
     */
    function currentLeverage(address account) external view returns (int leverage, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice();
        Position memory position = marketState.positions(account);
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

    function positions(address account) external view returns (IPerpsV2MarketBaseTypes.Position memory) {
        return Position(0, 0, 0, 0, 0);
    }

    function assetPrice() external view returns (uint price, bool invalid) {
        return (0, false);
    }

    /* @dev Given the size and basePrice (e.g. current off-chain price), return the expected fillPrice */
    function fillPriceWithBasePrice(int sizeDelta, uint basePrice) external view returns (uint, bool) {
        uint price = basePrice;
        bool invalid;
        if (basePrice == 0) {
            (price, invalid) = _assetPrice();
        }
        return (_fillPrice(sizeDelta, price), invalid);
    }

    /* @dev Given an account, find the associated position and return the netFundingPerUnit. */
    function netFundingPerUnit(address account) external view returns (int) {
        (uint price, ) = _assetPrice();
        return _netFundingPerUnit(marketState.positions(account).lastFundingIndex, price);
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

    function currentFundingVelocity() external view returns (int fundingVelocity) {
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

    function orderFee(int sizeDelta, IPerpsV2MarketBaseTypes.OrderType orderType)
        external
        view
        returns (uint fee, bool invalid)
    {
        return (0, false);
    }

    function postTradeDetails(
        int sizeDelta,
        uint tradePrice,
        IPerpsV2MarketBaseTypes.OrderType orderType,
        address sender
    )
        external
        view
        returns (
            uint margin,
            int size,
            uint price,
            uint liqPrice,
            uint fee,
            IPerpsV2MarketBaseTypes.Status status
        )
    {
        return (0, 0, 0, 0, 0, IPerpsV2MarketBaseTypes.Status.Ok);
    }
}
