pragma solidity ^0.5.16;

interface IFuturesMarket {
    /* ========== TYPES ========== */

    enum Status {
        Ok,
        NoOrderExists,
        AwaitingPriceUpdate,
        PriceOutOfBounds,
        InvalidPrice,
        CanLiquidate,
        CannotLiquidate,
        MaxMarketSizeExceeded,
        MaxLeverageExceeded,
        InsufficientMargin,
        NotPermitted
    }

    struct Order {
        uint id;
        int leverage;
        uint fee;
        uint roundId;
        uint minPrice;
        uint maxPrice;
    }

    // If margin/size are positive, the position is long; if negative then it is short.
    struct Position {
        uint margin;
        int size;
        uint lastPrice;
        uint fundingIndex;
    }

    /* ========== FUNCTION INTERFACE ========== */

    /* ---------- Market Details ---------- */

    function baseAsset() external view returns (bytes32 key);

    function marketSize() external view returns (uint size);

    function marketSkew() external view returns (int skew);

    function fundingLastRecomputed() external view returns (uint timestamp);

    function fundingSequence(uint index) external view returns (int netFunding);

    function orders(address account)
        external
        view
        returns (
            uint id,
            int leverage,
            uint fee,
            uint roundId,
            uint minPrice,
            uint maxPrice
        );

    function positions(address account)
        external
        view
        returns (
            uint margin,
            int size,
            uint lastPrice,
            uint fundingIndex
        );

    function assetPrice() external view returns (uint price, bool invalid);

    function currentRoundId() external view returns (uint roundId);

    function marketSizes() external view returns (uint long, uint short);

    function maxOrderSizes()
        external
        view
        returns (
            uint long,
            uint short,
            bool invalid
        );

    function marketDebt() external view returns (uint debt, bool isInvalid);

    function parameters()
        external
        view
        returns (
            uint takerFee,
            uint makerFee,
            uint closureFee,
            uint maxLeverage,
            uint maxMarketValue,
            uint maxFundingRate,
            uint maxFundingRateSkew,
            uint maxFundingRateDelta
        );

    function currentFundingRate() external view returns (int fundingRate);

    function unrecordedFunding() external view returns (int funding, bool invalid);

    function netFundingPerUnit(uint startIndex, uint endIndex) external view returns (int funding, bool invalid);

    function fundingSequenceLength() external view returns (uint length);

    /* ---------- Position Details ---------- */

    function orderPending(address account) external view returns (bool pending);

    function orderSize(address account) external view returns (int size, bool invalid);

    function orderStatus(address account) external view returns (Status);

    function canConfirmOrder(address account) external view returns (bool);

    function notionalValue(address account) external view returns (int value, bool invalid);

    function profitLoss(address account) external view returns (int pnl, bool invalid);

    function accruedFunding(address account) external view returns (int funding, bool invalid);

    function remainingMargin(address account) external view returns (uint marginRemaining, bool invalid);

    function liquidationPrice(address account, bool includeFunding) external view returns (uint price, bool invalid);

    function canLiquidate(address account) external view returns (bool);

    function currentLeverage(address account) external view returns (int leverage, bool invalid);

    function orderFee(address account, int leverage) external view returns (uint fee, bool invalid);

    function orderFeeWithMarginDelta(
        address account,
        int marginDelta,
        int leverage
    ) external view returns (uint fee, bool invalid);

    /* ---------- Market Operations ---------- */

    function recomputeFunding() external returns (uint lastIndex);

    function transferMargin(int marginDelta) external;

    function withdrawAllMargin() external;

    function cancelOrder() external;

    function submitOrderWithPriceBounds(
        int leverage,
        uint minPrice,
        uint maxPrice
    ) external;

    function submitOrder(int leverage) external;

    function closePosition() external;

    function transferMarginAndSubmitOrderWithPriceBounds(
        int marginDelta,
        int leverage,
        uint minPrice,
        uint maxPrice
    ) external;

    function transferMarginAndSubmitOrder(int marginDelta, int leverage) external;

    function confirmOrder(address account) external;

    function liquidatePosition(address account) external;
}
