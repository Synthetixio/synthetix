pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

interface IPerpsV2BaseTypes {
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
        NoPositionOpen,
        PriceTooVolatile
    }

    // If margin/size are positive, the position is long; if negative then it is short.
    struct Position {
        bytes32 marketKey;
        uint id;
        FundingEntry lastFundingEntry;
        uint margin;
        // locked margin is used to withhold margin for
        // possible future operations (e.g. orders) or possible payments (fees)
        // it is tracked in order to correctly account for market debt instead of just burning
        // and minting sUSD without tracking the amounts, and in order to only allow locking/unlocking
        // correct amounts of already transferred amounts
        uint lockedMargin;
        uint lastPrice;
        int size;
    }

    // next-price order storage
    struct NextPriceOrder {
        int128 sizeDelta; // difference in position to pass to modifyPosition
        uint128 targetRoundId; // price oracle roundId using which price this order needs to exucted
        uint128 commitDeposit; // the commitDeposit paid upon submitting that needs to be refunded if order succeeds
        uint128 keeperDeposit; // the keeperDeposit paid upon submitting that needs to be paid / refunded on tx confirmation
        bytes32 trackingCode; // tracking code to emit on execution for volume source fee sharing
    }

    struct MarketScalars {
        bytes32 baseAsset;
        uint marketSize;
        int marketSkew;
        int entryDebtCorrection;
        uint lastPositionId;
    }

    struct FundingEntry {
        int funding;
        uint timestamp;
    }
}

interface IPerpsV2Storage {
    // views

    function marketScalars(bytes32 marketKey) external view returns (IPerpsV2BaseTypes.MarketScalars memory);

    function fundingSequences(bytes32 marketKey, uint index) external view returns (IPerpsV2BaseTypes.FundingEntry memory);

    function fundingSequenceLength(bytes32 marketKey) external view returns (uint);

    function lastFundingEntry(bytes32 marketKey) external view returns (IPerpsV2BaseTypes.FundingEntry memory);

    function positions(bytes32 marketKey, address account) external view returns (IPerpsV2BaseTypes.Position memory);

    function positionIdToAccount(bytes32 marketKey, uint positionId) external view returns (address account);

    // mutative restricted to engine contract

    function initMarket(bytes32 marketKey, bytes32 baseAsset) external;

    function positionWithInit(bytes32 marketKey, address account) external returns (IPerpsV2BaseTypes.Position memory);

    function pushFundingEntry(bytes32 marketKey, int funding) external;

    function storePosition(
        bytes32 marketKey,
        address account,
        uint newMargin,
        uint newLocked,
        int newSize,
        uint price
    ) external;

    function storeMarketAggregates(
        bytes32 marketKey,
        uint marketSize,
        int marketSkew,
        int entryDebtCorrection
    ) external;
}

interface IPerpsV2Market {
    /* ========== FUNCTION INTERFACE ========== */

    /* ---------- Market Details ---------- */

    function marketKey() external view returns (bytes32 key);

    function baseAsset() external view returns (bytes32 key);

    function marketSize() external view returns (uint128 size);

    function marketSkew() external view returns (int128 skew);

    function fundingLastRecomputed() external view returns (uint32 timestamp);

    function fundingSequence(uint index) external view returns (int128 netFunding);

    function positions(address account)
        external
        view
        returns (
            uint64 id,
            uint64 fundingIndex,
            uint128 margin,
            uint128 lastPrice,
            int128 size
        );

    function assetPrice() external view returns (uint price, bool invalid);

    function marketSizes() external view returns (uint long, uint short);

    function marketDebt() external view returns (uint debt, bool isInvalid);

    function currentFundingRate() external view returns (int fundingRate);

    function unrecordedFunding() external view returns (int funding, bool invalid);

    function fundingSequenceLength() external view returns (uint length);

    function lastPositionId() external view returns (uint);

    function positionIdToAccount(uint id) external view returns (address);

    /* ---------- Position Details ---------- */

    function notionalValue(address account) external view returns (int value, bool invalid);

    function profitLoss(address account) external view returns (int pnl, bool invalid);

    function accruedFunding(address account) external view returns (int funding, bool invalid);

    function remainingMargin(address account) external view returns (uint marginRemaining, bool invalid);

    function accessibleMargin(address account) external view returns (uint marginAccessible, bool invalid);

    function approxLiquidationPriceAndFee(address account)
        external
        view
        returns (
            uint price,
            uint fee,
            bool invalid
        );

    function canLiquidate(address account) external view returns (bool);

    function orderFee(int sizeDelta) external view returns (uint fee, bool invalid);

    function postTradeDetails(int sizeDelta, address sender)
        external
        view
        returns (
            uint margin,
            int size,
            uint price,
            uint liqPrice,
            uint fee,
            IPerpsV2BaseTypes.Status status
        );

    /* ---------- Market Operations ---------- */

    function recomputeFunding() external returns (uint lastIndex);

    function transferMargin(int marginDelta) external;

    function withdrawAllMargin() external;

    function modifyPosition(int sizeDelta) external;

    function modifyPositionWithTracking(int sizeDelta, bytes32 trackingCode) external;

    function submitNextPriceOrder(int sizeDelta) external;

    function submitNextPriceOrderWithTracking(int sizeDelta, bytes32 trackingCode) external;

    function cancelNextPriceOrder(address account) external;

    function executeNextPriceOrder(address account) external;

    function closePosition() external;

    function closePositionWithTracking(bytes32 trackingCode) external;

    function liquidatePosition(address account) external;
}
