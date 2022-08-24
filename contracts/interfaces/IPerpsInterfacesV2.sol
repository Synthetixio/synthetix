pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// for summary struct
import "./IFuturesMarketManager.sol";

interface IPerpsTypesV2 {
    enum Status {
        Ok,
        InvalidPrice,
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
        int size;
        uint lastPrice;
    }

    // next-price order storage
    struct NextPriceOrder {
        int128 sizeDelta; // difference in position to pass to trade()
        uint128 targetRoundId; // price oracle roundId using which price this order needs to executed
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

    struct PositionSummary {
        Position position;
        int profitLoss;
        int accruedFunding;
        uint remainingMargin;
        uint withdrawableMargin;
        int currentLeverage;
        bool canLiquidate;
        uint approxLiquidationPrice;
        uint approxLiquidationFee;
        bool priceInvalid;
    }

    struct MarketSummary {
        bytes32 marketKey;
        bytes32 baseAsset;
        uint price;
        uint marketSize;
        int marketSkew;
        uint marketDebt;
        int currentFundingRate;
        int unrecordedFunding;
        uint marketSizeLong;
        uint marketSizeShort;
        bool priceInvalid;
    }

    struct MarketConfig {
        uint baseFee;
        uint baseFeeNextPrice;
        uint nextPriceConfirmWindow;
        uint maxLeverage;
        uint maxSingleSideValueUSD;
        uint maxFundingRate;
        uint skewScaleUSD;
    }

    struct ExecutionOptions {
        uint feeAmount;
        int priceDelta;
        bytes32 trackingCode;
    }
}

interface IPerpsEngineV2External {
    // market views

    function assetPrice(bytes32 marketKey) external view returns (uint price, bool invalid);

    function maxOrderSizes(bytes32 marketKey) external view returns (uint long, uint short);

    function marketDebt(bytes32 marketKey) external view returns (uint debt, bool invalid);

    function marketSummary(bytes32 marketKey) external view returns (IPerpsTypesV2.MarketSummary memory);

    // position views

    function withdrawableMargin(bytes32 marketKey, address account) external view returns (uint);

    function positionSummary(bytes32 marketKey, address account)
        external
        view
        returns (IPerpsTypesV2.PositionSummary memory);

    // trade views

    function simulateTrade(
        bytes32 marketKey,
        address account,
        int sizeDelta,
        IPerpsTypesV2.ExecutionOptions calldata options
    )
        external
        view
        returns (
            uint margin,
            int size,
            IPerpsTypesV2.Status status
        );

    // low lever state contract (with more low level views)
    function stateContract() external view returns (IPerpsStorageV2External);

    // mutative
    function liquidatePosition(
        bytes32 marketKey,
        address account,
        address liquidator
    ) external;
}

interface IPerpsEngineV2Internal {
    // internal mutative

    // only manager
    function ensureInitialized(bytes32 marketKey, bytes32 baseAsset) external;

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
        IPerpsTypesV2.ExecutionOptions calldata options
    ) external;

    // only routers
    function managerPayFee(
        bytes32 marketKey,
        uint amount,
        bytes32 trackingCode
    ) external;

    // only routers
    function managerIssueSUSD(
        bytes32 marketKey,
        address to,
        uint amount
    ) external;
}

interface IPerpsStorageV2External {
    // views only, mostly autogenerated
    function marketScalars(bytes32 marketKey) external view returns (IPerpsTypesV2.MarketScalars memory);

    function lastFundingEntry(bytes32 marketKey) external view returns (IPerpsTypesV2.FundingEntry memory);

    function position(bytes32 marketKey, address account) external view returns (IPerpsTypesV2.Position memory);

    function positionIdToAccount(bytes32 marketKey, uint positionId) external view returns (address account);
}

interface IPerpsStorageV2Internal {
    // mutative restricted to engine contract

    function initMarket(bytes32 marketKey, bytes32 baseAsset) external;

    function positionWithInit(bytes32 marketKey, address account) external returns (IPerpsTypesV2.Position memory);

    function updateFunding(bytes32 marketKey, int funding) external;

    function storePosition(
        bytes32 marketKey,
        address account,
        uint newMargin,
        uint newLocked,
        int newSize,
        uint price
    ) external returns (IPerpsTypesV2.Position memory);

    function storeMarketAggregates(
        bytes32 marketKey,
        uint marketSize,
        int marketSkew,
        int entryDebtCorrection
    ) external;
}

interface IPerpsOrdersV2 {
    // VIEWS
    function engineContract() external view returns (IPerpsEngineV2External);

    function stateContract() external view returns (IPerpsStorageV2External);

    function nextPriceOrders(bytes32 marketKey, address account) external view returns (IPerpsTypesV2.NextPriceOrder memory);

    function baseFee(bytes32 marketKey) external view returns (uint);

    function feeRate(bytes32 marketKey) external view returns (uint);

    function orderFee(bytes32 marketKey, int sizeDelta) external view returns (uint fee, bool invalid);

    function dynamicFeeRate(bytes32 marketKey) external view returns (uint rate, bool tooVolatile);

    function baseFeeNextPrice(bytes32 marketKey) external view returns (uint);

    function feeRateNextPrice(bytes32 marketKey) external view returns (uint);

    function orderFeeNextPrice(bytes32 marketKey, int sizeDelta) external view returns (uint fee, bool invalid);

    function currentRoundId(bytes32 marketKey) external view returns (uint);

    function maxOrderSizes(bytes32 marketKey) external view returns (uint long, uint short);

    // forwarded views
    function positionSummary(bytes32 marketKey, address account)
        external
        view
        returns (IPerpsTypesV2.PositionSummary memory);

    function marketSummary(bytes32 marketKey) external view returns (IPerpsTypesV2.MarketSummary memory);

    // MUTATIVE

    function transferMargin(bytes32 marketKey, int marginDelta) external;

    function withdrawMaxMargin(bytes32 marketKey) external;

    function trade(bytes32 marketKey, int sizeDelta) external;

    function transferAndTrade(
        bytes32 marketKey,
        int marginDelta,
        int sizeDelta,
        bytes32 trackingCode
    ) external;

    function tradeAndTransfer(
        bytes32 marketKey,
        int marginDelta,
        int sizeDelta,
        bytes32 trackingCode
    ) external;

    function tradeWithTracking(
        bytes32 marketKey,
        int sizeDelta,
        bytes32 trackingCode
    ) external;

    function submitNextPriceOrder(bytes32 marketKey, int sizeDelta) external;

    function submitNextPriceOrderWithTracking(
        bytes32 marketKey,
        int sizeDelta,
        bytes32 trackingCode
    ) external;

    function cancelNextPriceOrder(bytes32 marketKey, address account) external;

    function executeNextPriceOrder(bytes32 marketKey, address account) external;

    function closePosition(bytes32 marketKey) external;

    function closePositionWithTracking(bytes32 marketKey, bytes32 trackingCode) external;
}

interface IPerpsConfigSettersV2 {
    function baseFee(bytes32 _marketKey) external view returns (uint);

    function baseFeeNextPrice(bytes32 _marketKey) external view returns (uint);

    function nextPriceConfirmWindow(bytes32 _marketKey) external view returns (uint);

    function maxLeverage(bytes32 _marketKey) external view returns (uint);

    function maxSingleSideValueUSD(bytes32 _marketKey) external view returns (uint);

    function maxFundingRate(bytes32 _marketKey) external view returns (uint);

    function skewScaleUSD(bytes32 _marketKey) external view returns (uint);

    function marketConfig(bytes32 _marketKey) external view returns (IPerpsTypesV2.MarketConfig memory);

    function minKeeperFee() external view returns (uint);

    function liquidationFeeRatio() external view returns (uint);

    function liquidationBufferRatio() external view returns (uint);

    function minInitialMargin() external view returns (uint);
}

interface IPerpsManagerV2 {
    function numMarkets() external view returns (uint);

    function totalDebt() external view returns (uint debt, bool isInvalid);

    function isMarket(bytes32 marketKey) external view returns (bool);

    function markets(uint index, uint pageSize) external view returns (bytes32[] memory);

    function allMarkets() external view returns (bytes32[] memory);

    function allMarketSummaries() external view returns (IPerpsTypesV2.MarketSummary[] memory);

    function marketSummaries(bytes32[] calldata marketKeys) external view returns (IPerpsTypesV2.MarketSummary[] memory);
}

interface IPerpsManagerV2Internal {
    // view
    function approvedRouterAndMarket(address router, bytes32 marketKey) external view returns (bool approved);

    // Mutative V2 owner actions
    function addMarkets(bytes32[] calldata marketKeys, bytes32[] calldata assets) external;

    function removeMarkets(bytes32[] calldata marketKeys) external;

    // Mutative internal for engine & order methods
    function issueSUSD(
        bytes32 marketKey,
        address account,
        uint amount
    ) external;

    function burnSUSD(
        bytes32 marketKey,
        address account,
        uint amount
    ) external returns (uint postReclamationAmount);

    function payFee(
        bytes32 marketKey,
        uint amount,
        bytes32 trackingCode
    ) external;
}

// a contract / interface matching the filename is expected for compilation
interface IPerpsInterfacesV2 {
    function noEmptyBlocks() external; // no empty blocks (post commit checks)
}
