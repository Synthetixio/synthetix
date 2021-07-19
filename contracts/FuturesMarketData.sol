pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Internal references
import "./interfaces/IFuturesMarket.sol";
import "./interfaces/IFuturesMarketManager.sol";
import "./interfaces/IFuturesMarketSettings.sol";
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
        FeeRates feeRates;
    }

    struct MarketLimits {
        uint maxLeverage;
        uint maxMarketValue;
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
    }

    struct PriceDetails {
        uint price;
        uint currentRoundId;
        bool invalid;
    }

    struct FundingParameters {
        uint maxFundingRate;
        uint maxFundingRateSkew;
        uint maxFundingRateDelta;
    }

    struct FeeRates {
        uint takerFee;
        uint makerFee;
    }

    struct FundingDetails {
        int currentFundingRate;
        int unrecordedFunding;
        uint fundingLastRecomputed;
    }

    struct MarketData {
        address market;
        bytes32 baseAsset;
        FuturesMarketData.FeeRates feeRates;
        FuturesMarketData.MarketLimits limits;
        FuturesMarketData.FundingParameters fundingParameters;
        FuturesMarketData.MarketSizeDetails marketSizeDetails;
        FuturesMarketData.PriceDetails priceDetails;
    }

    struct PositionData {
        IFuturesMarket.Order order;
        bool orderPending;
        IFuturesMarket.Position position;
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

    function _futuresMarketManager() internal view returns (IFuturesMarketManager) {
        return
            IFuturesMarketManager(
                resolverProxy.requireAndGetAddress("FuturesMarketManager", "Missing FuturesMarketManager Address")
            );
    }

    function _futuresMarketSettings() internal view returns (IFuturesMarketSettings) {
        return
            IFuturesMarketSettings(
                resolverProxy.requireAndGetAddress("FuturesMarketSettings", "Missing FuturesMarketSettings Address")
            );
    }

    function _getParameters(bytes32 baseAsset) internal view returns (IFuturesMarketSettings.Parameters memory) {
        (
            uint takerFee,
            uint makerFee,
            uint maxLeverage,
            uint maxMarketValue,
            uint maxFundingRate,
            uint maxFundingRateSkew,
            uint maxFundingRateDelta
        ) = _futuresMarketSettings().getAllParameters(baseAsset);
        return
            IFuturesMarketSettings.Parameters(
                takerFee,
                makerFee,
                maxLeverage,
                maxMarketValue,
                maxFundingRate,
                maxFundingRateSkew,
                maxFundingRateDelta
            );
    }

    function _marketSummaries(address[] memory markets) internal view returns (MarketSummary[] memory) {
        uint numMarkets = markets.length;
        MarketSummary[] memory summaries = new MarketSummary[](numMarkets);
        for (uint i; i < numMarkets; i++) {
            IFuturesMarket market = IFuturesMarket(markets[i]);

            IFuturesMarketSettings.Parameters memory parameters = _getParameters(market.baseAsset());
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

    function _fundingParameters(IFuturesMarketSettings.Parameters memory parameters)
        internal
        pure
        returns (FundingParameters memory)
    {
        return FundingParameters(parameters.maxFundingRate, parameters.maxFundingRateSkew, parameters.maxFundingRateDelta);
    }

    function _marketSizes(IFuturesMarket market) internal view returns (Sides memory) {
        (uint long, uint short) = market.marketSizes();
        return Sides(long, short);
    }

    function _marketDetails(IFuturesMarket market) internal view returns (MarketData memory) {
        (uint price, bool invalid) = market.assetPrice();
        (uint marketDebt, ) = market.marketDebt();

        IFuturesMarketSettings.Parameters memory parameters = _getParameters(market.baseAsset());

        return
            MarketData(
                address(market),
                market.baseAsset(),
                FeeRates(parameters.takerFee, parameters.makerFee),
                MarketLimits(parameters.maxLeverage, parameters.maxMarketValue),
                _fundingParameters(parameters),
                MarketSizeDetails(market.marketSize(), _marketSizes(market), marketDebt, market.marketSkew()),
                PriceDetails(price, market.currentRoundId(), invalid)
            );
    }

    function marketDetails(IFuturesMarket market) external view returns (MarketData memory) {
        return _marketDetails(market);
    }

    function marketDetailsForAsset(bytes32 asset) external view returns (MarketData memory) {
        return _marketDetails(IFuturesMarket(_futuresMarketManager().marketForAsset(asset)));
    }

    function _notionalValue(IFuturesMarket market, address account) internal view returns (int) {
        (int value, ) = market.notionalValue(account);
        return value;
    }

    function _profitLoss(IFuturesMarket market, address account) internal view returns (int) {
        (int value, ) = market.profitLoss(account);
        return value;
    }

    function _accruedFunding(IFuturesMarket market, address account) internal view returns (int) {
        (int value, ) = market.accruedFunding(account);
        return value;
    }

    function _remainingMargin(IFuturesMarket market, address account) internal view returns (uint) {
        (uint value, ) = market.remainingMargin(account);
        return value;
    }

    function _order(IFuturesMarket market, address account) internal view returns (IFuturesMarket.Order memory) {
        (uint orderId, int orderLeverage, uint orderFee, uint orderRoundId) = market.orders(account);
        return IFuturesMarket.Order(orderId, orderLeverage, orderFee, orderRoundId);
    }

    function _positionDetails(IFuturesMarket market, address account) internal view returns (PositionData memory) {
        (uint positionMargin, int positionSize, uint positionEntryPrice, uint positionEntryIndex) =
            market.positions(account);
        (uint liquidationPrice, ) = market.liquidationPrice(account, true);
        return
            PositionData(
                _order(market, account),
                market.orderPending(account),
                IFuturesMarket.Position(positionMargin, positionSize, positionEntryPrice, positionEntryIndex),
                _notionalValue(market, account),
                _profitLoss(market, account),
                _accruedFunding(market, account),
                _remainingMargin(market, account),
                liquidationPrice
            );
    }

    function positionDetails(IFuturesMarket market, address account) external view returns (PositionData memory) {
        return _positionDetails(market, account);
    }

    function positionDetailsForAsset(bytes32 asset, address account) external view returns (PositionData memory) {
        return _positionDetails(IFuturesMarket(_futuresMarketManager().marketForAsset(asset)), account);
    }
}
