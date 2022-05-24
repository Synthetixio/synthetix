pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// a contract / interface of this name is expected
interface IPerpsV2Market {
    struct Empty {
        bool empty;
    } // no empty blocks
}

interface IPerpsV2Types {
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

    struct PositionStatus {
        int profitLoss;
        int accruedFunding;
        uint remainingMargin;
        uint accessibleMargin;
        bool canLiquidate;
        uint approxLiquidationPrice;
        uint approxLiquidationFee;
        bool priceInvalid;
    }
}

interface IPerpsV2EngineExternal {
    // views
    function assetPrice(bytes32 marketKey) external view returns (uint price, bool invalid);

    function storageContract() external view returns (IPerpsV2StorageExternal);

    function marketSizes(bytes32 marketKey) external view returns (uint long, uint short);

    function marketDebt(bytes32 marketKey) external view returns (uint debt, bool invalid);

    function currentFundingRate(bytes32 marketKey) external view returns (int);

    function unrecordedFunding(bytes32 marketKey) external view returns (int funding, bool invalid);

    function positionDetails(bytes32 marketKey, address account)
        external
        view
        returns (IPerpsV2Types.Position memory position, IPerpsV2Types.PositionStatus memory positionStatus);

    function orderFee(
        bytes32 marketKey,
        int sizeDelta,
        uint feeRate
    ) external view returns (uint fee, bool invalid);

    function postTradeDetails(
        bytes32 marketKey,
        address account,
        int sizeDelta,
        uint feeRate
    )
        external
        view
        returns (
            uint margin,
            int size,
            uint fee,
            IPerpsV2Types.Status status
        );

    // mutative
    function liquidatePosition(
        bytes32 marketKey,
        address account,
        address liquidator
    ) external;
}

interface IPerpsV2EngineInternal {
    // internal mutative

    // only manager
    function initMarket(bytes32 marketKey, bytes32 baseAsset) external;

    // only settings
    function recomputeFunding(bytes32 marketKey) external;

    // only routers
    function transferMargin(
        bytes32 marketKey,
        address account,
        int amount
    ) external;

    // only routers
    function modifyLockedMargin(
        bytes32 marketKey,
        address account,
        int lockAmount,
        uint burnAmount
    ) external;

    // only routers
    function trade(
        bytes32 marketKey,
        address account,
        int sizeDelta,
        uint feeRate,
        bytes32 trackingCode
    ) external;
}

interface IPerpsV2StorageExternal {
    // views

    function marketScalars(bytes32 marketKey) external view returns (IPerpsV2Types.MarketScalars memory);

    function fundingSequences(bytes32 marketKey, uint index) external view returns (IPerpsV2Types.FundingEntry memory);

    function fundingSequenceLength(bytes32 marketKey) external view returns (uint);

    function lastFundingEntry(bytes32 marketKey) external view returns (IPerpsV2Types.FundingEntry memory);

    function positions(bytes32 marketKey, address account) external view returns (IPerpsV2Types.Position memory);

    function positionIdToAccount(bytes32 marketKey, uint positionId) external view returns (address account);
}

interface IPerpsV2StorageInternal {
    // mutative restricted to engine contract

    function initMarket(bytes32 marketKey, bytes32 baseAsset) external;

    function positionWithInit(bytes32 marketKey, address account) external returns (IPerpsV2Types.Position memory);

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

interface IFuturesMarketManagerInternal {
    function issueSUSD(address account, uint amount) external;

    function burnSUSD(address account, uint amount) external returns (uint postReclamationAmount);

    function payFee(uint amount, bytes32 trackingCode) external;

    function approvedRouter(
        address router,
        bytes32 marketKey,
        address account
    ) external returns (bool approved);
}

interface IPerpsV2Orders {
    // VIEWS
    function engineContract() external view returns (IPerpsV2EngineExternal);

    function storageContract() external view returns (IPerpsV2StorageExternal);

    function nextPriceOrders(bytes32 marketKey, address account) external view returns (IPerpsV2Types.NextPriceOrder memory);

    function baseFee(bytes32 marketKey) external view returns (uint feeRate);

    function baseFeeNextPrice(bytes32 marketKey) external view returns (uint feeRate);

    function currentRoundId(bytes32 marketKey) external view returns (uint);

    // MUTATIVE

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

interface IPerpsV2Settings {
    struct Parameters {
        uint baseFee;
        uint baseFeeNextPrice;
        uint nextPriceConfirmWindow;
        uint maxLeverage;
        uint maxSingleSideValueUSD;
        uint maxFundingRate;
        uint skewScaleUSD;
    }

    function baseFee(bytes32 _marketKey) external view returns (uint);

    function baseFeeNextPrice(bytes32 _marketKey) external view returns (uint);

    function nextPriceConfirmWindow(bytes32 _marketKey) external view returns (uint);

    function maxLeverage(bytes32 _marketKey) external view returns (uint);

    function maxSingleSideValueUSD(bytes32 _marketKey) external view returns (uint);

    function maxFundingRate(bytes32 _marketKey) external view returns (uint);

    function skewScaleUSD(bytes32 _marketKey) external view returns (uint);

    function parameters(bytes32 _marketKey) external view returns (Parameters memory);

    function minKeeperFee() external view returns (uint);

    function liquidationFeeRatio() external view returns (uint);

    function liquidationBufferRatio() external view returns (uint);

    function minInitialMargin() external view returns (uint);
}
