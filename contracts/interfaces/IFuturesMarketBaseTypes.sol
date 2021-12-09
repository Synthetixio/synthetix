pragma solidity ^0.5.16;

interface IFuturesMarketBaseTypes {
    /* ========== TYPES ========== */

    enum Status {
        Ok,
        InvalidPrice,
        PriceOutOfBounds,
        CanLiquidate,
        CannotLiquidate,
        MaxMarketSizeExceeded,
        MaxLeverageExceeded,
        InsufficientMargin,
        NotPermitted,
        NilOrder,
        NoPositionOpen
    }

    // If margin/size are positive, the position is long; if negative then it is short.
    struct Position {
        uint id;
        uint margin;
        int size;
        uint lastPrice;
        uint fundingIndex;
    }

    // next-price order storage
    struct NextPriceOrder {
        int sizeDelta; // difference in position to pass to modifyPosition
        uint targetRoundId; // price oracle roundId using which price this order needs to exucted
        uint commitDeposit; // the commitDeposit paid upon submitting that needs to be refunded if order succeeds
        uint keeperDeposit; // the keeperDeposit paid upon submitting that needs to be paid / refunded on tx confirmation
    }
}
