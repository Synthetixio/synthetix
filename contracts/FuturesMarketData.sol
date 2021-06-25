pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Internal references
import "./FuturesMarket.sol";
import "./FuturesMarketManager.sol";
import "./interfaces/IAddressResolver.sol";

contract FuturesMarketData {
    /* ========== TYPES ========== */

    struct MarketSummary {
        address market;
        bytes32 asset;
        uint maxLeverage;
        uint price;
        uint marketSize;
        int marketSkew;
        uint marketDebt;
        int currentFundingRate;
        int targetFundingRate;
        FeeRates feeRates;
    }

    struct MarketLimits {
        uint maxLeverage;
        uint maxMarketValue;
        uint minInitialMargin;
    }

    struct Sides {
        uint long;
        uint short;
    }

    struct MarketSizeDetails {
        uint marketSize;
        FuturesMarketData.Sides sides;
        uint marketDebt;
        int marketSkew;
        int proportionalSkew;
        int entryDebtCorrection;
    }

    struct PriceDetails {
        uint price;
        uint currentRoundId;
        bool invalid;
    }

    struct FeeRates {
        uint takerFee;
        uint makerFee;
    }

    struct FundingParameters {
        uint maxFundingRate;
        uint maxFundingRateSkew;
        uint maxFundingRateDelta;
    }

    struct FundingDetails {
        int currentFundingRate;
        int targetFundingRate;
        int unrecordedFunding;
        uint fundingLastRecomputed;
        FundingParameters parameters;
    }

    struct MarketData {
        address market;
        bytes32 baseAsset;
        FuturesMarketData.FeeRates feeRates;
        FuturesMarketData.MarketLimits limits;
        FuturesMarketData.FundingDetails fundingDetails;
        FuturesMarketData.MarketSizeDetails marketSizeDetails;
        FuturesMarketData.PriceDetails priceDetails;
    }

    struct PositionData {
        FuturesMarket.Order order;
        bool orderPending;
        FuturesMarket.Position position;
        int notionalValue;
        int profitLoss;
        int accruedFunding;
        uint remainingMargin;
        uint liquidationPrice;
    }

    /* ========== STORAGE VARIABLES ========== */

    IAddressResolver public resolverProxy;

    /* ========== CONSTRUCTOR ========== */

    constructor(IAddressResolver _resolverProxy) public {
        resolverProxy = _resolverProxy;
    }

    /* ========== VIEWS ========== */

    function _futuresMarketManager() internal view returns (FuturesMarketManager) {
        return
            FuturesMarketManager(
                resolverProxy.requireAndGetAddress("FuturesMarketManager", "Missing FuturesMarketManager Address")
            );
    }

    function _getParameters(FuturesMarket market) internal view returns (FuturesMarket.Parameters memory) {
        (
            uint takerFee,
            uint makerFee,
            uint maxLeverage,
            uint maxMarketValue,
            uint minInitialMargin,
            uint maxFundingRate,
            uint maxFundingRateSkew,
            uint maxFundingRateDelta
        ) = market.parameters();
        return
            FuturesMarket.Parameters(
                takerFee,
                makerFee,
                maxLeverage,
                maxMarketValue,
                minInitialMargin,
                maxFundingRate,
                maxFundingRateSkew,
                maxFundingRateDelta
            );
    }

    function _marketSummaries(address[] memory markets) internal view returns (MarketSummary[] memory) {
        uint numMarkets = markets.length;
        MarketSummary[] memory summaries = new MarketSummary[](numMarkets);
        for (uint i; i < numMarkets; i++) {
            FuturesMarket market = FuturesMarket(markets[i]);

            FuturesMarket.Parameters memory parameters = _getParameters(market);
            (uint price, ) = market.assetPrice();
            (uint debt, ) = market.marketDebt();

            summaries[i] = MarketSummary(
                address(market),
                market.baseAsset(),
                parameters.maxLeverage,
                price,
                market.marketSize(),
                market.marketSkew(),
                debt,
                market.currentFundingRate(),
                market.targetFundingRate(),
                FeeRates(parameters.takerFee, parameters.makerFee)
            );
        }

        return summaries;
    }

    function marketSummaries(address[] calldata markets) external view returns (MarketSummary[] memory) {
        return _marketSummaries(markets);
    }

    function marketSummariesForAssets(bytes32[] calldata assets) external view returns (MarketSummary[] memory) {
        return _marketSummaries(_futuresMarketManager().marketsForAssets(assets));
    }

    function allMarketSummaries() external view returns (MarketSummary[] memory) {
        return _marketSummaries(_futuresMarketManager().allMarkets());
    }

    function _fundingParameters(FuturesMarket.Parameters memory parameters)
        internal
        pure
        returns (FundingParameters memory)
    {
        return FundingParameters(parameters.maxFundingRate, parameters.maxFundingRateSkew, parameters.maxFundingRateDelta);
    }

    function _fundingDetails(FuturesMarket market, FuturesMarket.Parameters memory parameters)
        internal
        view
        returns (FundingDetails memory)
    {
        (int unrecordedFunding, ) = market.unrecordedFunding();
        return
            FundingDetails(
                market.currentFundingRate(),
                market.targetFundingRate(),
                unrecordedFunding,
                market.fundingLastRecomputed(),
                _fundingParameters(parameters)
            );
    }

    function _marketSizes(FuturesMarket market) internal view returns (Sides memory) {
        (uint long, uint short) = market.marketSizes();
        return Sides(long, short);
    }

    function _marketDetails(FuturesMarket market) internal view returns (MarketData memory) {
        (uint price, bool invalid) = market.assetPrice();
        (uint marketDebt, ) = market.marketDebt();

        FuturesMarket.Parameters memory parameters = _getParameters(market);

        return
            MarketData(
                address(market),
                market.baseAsset(),
                FeeRates(parameters.takerFee, parameters.makerFee),
                MarketLimits(parameters.maxLeverage, parameters.maxMarketValue, parameters.minInitialMargin),
                _fundingDetails(market, parameters),
                MarketSizeDetails(
                    market.marketSize(),
                    _marketSizes(market),
                    marketDebt,
                    market.marketSkew(),
                    market.proportionalSkew(),
                    market.entryDebtCorrection()
                ),
                PriceDetails(price, market.currentRoundId(), invalid)
            );
    }

    function marketDetails(FuturesMarket market) external view returns (MarketData memory) {
        return _marketDetails(market);
    }

    function marketDetailsForAsset(bytes32 asset) external view returns (MarketData memory) {
        return _marketDetails(FuturesMarket(_futuresMarketManager().marketForAsset(asset)));
    }

    function _notionalValue(FuturesMarket market, address account) internal view returns (int) {
        (int value, ) = market.notionalValue(account);
        return value;
    }

    function _profitLoss(FuturesMarket market, address account) internal view returns (int) {
        (int value, ) = market.profitLoss(account);
        return value;
    }

    function _accruedFunding(FuturesMarket market, address account) internal view returns (int) {
        (int value, ) = market.accruedFunding(account);
        return value;
    }

    function _remainingMargin(FuturesMarket market, address account) internal view returns (uint) {
        (uint value, ) = market.remainingMargin(account);
        return value;
    }

    function _order(FuturesMarket market, address account) internal view returns (FuturesMarket.Order memory) {
        (uint orderId, int orderLeverage, uint orderFee, uint orderRoundId) = market.orders(account);
        return FuturesMarket.Order(orderId, orderLeverage, orderFee, orderRoundId);
    }

    function _positionDetails(FuturesMarket market, address account) internal view returns (PositionData memory) {
        (uint positionMargin, int positionSize, uint positionEntryPrice, uint positionEntryIndex) =
            market.positions(account);
        (uint liquidationPrice, ) = market.liquidationPrice(account, true);
        return
            PositionData(
                _order(market, account),
                market.orderPending(account),
                FuturesMarket.Position(positionMargin, positionSize, positionEntryPrice, positionEntryIndex),
                _notionalValue(market, account),
                _profitLoss(market, account),
                _accruedFunding(market, account),
                _remainingMargin(market, account),
                liquidationPrice
            );
    }

    function positionDetails(FuturesMarket market, address account) external view returns (PositionData memory) {
        return _positionDetails(market, account);
    }

    function positionDetailsForAsset(bytes32 asset, address account) external view returns (PositionData memory) {
        return _positionDetails(FuturesMarket(_futuresMarketManager().marketForAsset(asset)), account);
    }
}
