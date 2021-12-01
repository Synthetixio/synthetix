pragma solidity ^0.5.16;

import "./IFuturesMarketBaseTypes.sol";

interface IFuturesMarket {
    /* ========== FUNCTION INTERFACE ========== */

    /* ---------- Market Details ---------- */

    function baseAsset() external view returns (bytes32 key);

    function marketSize() external view returns (uint size);

    function marketSkew() external view returns (int skew);

    function fundingLastRecomputed() external view returns (uint timestamp);

    function fundingSequence(uint index) external view returns (int netFunding);

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
            uint takerFeeNextPrice,
            uint makerFeeNextPrice,
            uint nextPriceConfirmWindow,
            uint maxLeverage,
            uint maxMarketValueUSD,
            uint maxFundingRate,
            uint skewScaleUSD,
            uint maxFundingRateDelta
        );

    function currentFundingRate() external view returns (int fundingRate);

    function unrecordedFunding() external view returns (int funding, bool invalid);

    function netFundingPerUnit(uint startIndex, uint endIndex) external view returns (int funding, bool invalid);

    function fundingSequenceLength() external view returns (uint length);

    /* ---------- Position Details ---------- */

    function notionalValue(address account) external view returns (int value, bool invalid);

    function profitLoss(address account) external view returns (int pnl, bool invalid);

    function accruedFunding(address account) external view returns (int funding, bool invalid);

    function remainingMargin(address account) external view returns (uint marginRemaining, bool invalid);

    function accessibleMargin(address account) external view returns (uint marginAccessible, bool invalid);

    function liquidationPrice(address account, bool includeFunding) external view returns (uint price, bool invalid);

    function liquidationMargin(address account) external view returns (uint lMargin);

    function liquidationFee(address account) external view returns (uint);

    function canLiquidate(address account) external view returns (bool);

    function currentLeverage(address account) external view returns (int leverage, bool invalid);

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
            IFuturesMarketBaseTypes.Status status
        );

    /* ---------- Market Operations ---------- */

    function recomputeFunding() external returns (uint lastIndex);

    function transferMargin(int marginDelta) external;

    function withdrawAllMargin() external;

    function modifyPosition(int sizeDelta) external;

    function submitNextPriceOrder(int sizeDelta) external;

    function cancelNextPriceOrder(address account) external;

    function executeNextPriceOrder(address account) external;

    function modifyPositionWithPriceBounds(
        int sizeDelta,
        uint minPrice,
        uint maxPrice
    ) external;

    function closePosition() external;

    function closePositionWithPriceBounds(uint minPrice, uint maxPrice) external;

    function liquidatePosition(address account) external;
}
