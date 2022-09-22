pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Internal references
import "./interfaces/IFuturesV2MarketViews.sol";
import "./interfaces/IFuturesV2MarketBaseTypes.sol";
import "./interfaces/IFuturesV2MarketManager.sol";
import "./interfaces/IFuturesV2MarketSettings.sol";
import "./interfaces/IAddressResolver.sol";

// https://docs.synthetix.io/contracts/source/contracts/FuturesV2MarketData
// A utility contract to allow the front end to query market data in a single call.
contract FuturesV2MarketData {
    /* ========== TYPES ========== */

    struct FuturesGlobals {
        uint minInitialMargin;
        uint liquidationFeeRatio;
        uint liquidationBufferRatio;
        uint minKeeperFee;
    }

    struct MarketSummary {
        address market;
        bytes32 asset;
        bytes32 key;
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
        uint maxMarketValueUSD;
    }

    struct Sides {
        uint long;
        uint short;
    }

    struct MarketSizeDetails {
        uint marketSize;
        FuturesV2MarketData.Sides sides;
        uint marketDebt;
        int marketSkew;
    }

    struct PriceDetails {
        uint price;
        bool invalid;
    }

    struct FundingParameters {
        uint maxFundingRate;
        uint skewScaleUSD;
    }

    struct FeeRates {
        uint takerFee;
        uint makerFee;
        uint takerFeeNextPrice;
        uint makerFeeNextPrice;
    }

    struct FundingDetails {
        int currentFundingRate;
        int unrecordedFunding;
        uint fundingLastRecomputed;
    }

    struct MarketData {
        address market;
        bytes32 baseAsset;
        bytes32 marketKey;
        FuturesV2MarketData.FeeRates feeRates;
        FuturesV2MarketData.MarketLimits limits;
        FuturesV2MarketData.FundingParameters fundingParameters;
        FuturesV2MarketData.MarketSizeDetails marketSizeDetails;
        FuturesV2MarketData.PriceDetails priceDetails;
    }

    struct PositionData {
        IFuturesV2MarketBaseTypes.Position position;
        int notionalValue;
        int profitLoss;
        int accruedFunding;
        uint remainingMargin;
        uint accessibleMargin;
        uint liquidationPrice;
        bool canLiquidatePosition;
    }

    /* ========== STORAGE VARIABLES ========== */

    IAddressResolver public resolverProxy;

    /* ========== CONSTRUCTOR ========== */

    constructor(IAddressResolver _resolverProxy) public {
        resolverProxy = _resolverProxy;
    }

    /* ========== VIEWS ========== */

    function _futuresMarketManager() internal view returns (IFuturesV2MarketManager) {
        return
            IFuturesV2MarketManager(
                resolverProxy.requireAndGetAddress("FuturesV2MarketManager", "Missing FuturesV2MarketManager Address")
            );
    }

    function _futuresMarketSettings() internal view returns (IFuturesV2MarketSettings) {
        return
            IFuturesV2MarketSettings(
                resolverProxy.requireAndGetAddress("FuturesV2MarketSettings", "Missing FuturesV2MarketSettings Address")
            );
    }

    function globals() external view returns (FuturesGlobals memory) {
        IFuturesV2MarketSettings settings = _futuresMarketSettings();
        return
            FuturesGlobals({
                minInitialMargin: settings.minInitialMargin(),
                liquidationFeeRatio: settings.liquidationFeeRatio(),
                liquidationBufferRatio: settings.liquidationBufferRatio(),
                minKeeperFee: settings.minKeeperFee()
            });
    }

    function parameters(bytes32 marketKey) external view returns (IFuturesV2MarketSettings.Parameters memory) {
        return _parameters(marketKey);
    }

    function _parameters(bytes32 marketKey) internal view returns (IFuturesV2MarketSettings.Parameters memory) {
        (
            uint takerFee,
            uint makerFee,
            uint takerFeeNextPrice,
            uint makerFeeNextPrice,
            uint nextPriceConfirmWindow,
            uint maxLeverage,
            uint maxMarketValueUSD,
            uint maxFundingRate,
            uint skewScaleUSD
        ) = _futuresMarketSettings().parameters(marketKey);
        return
            IFuturesV2MarketSettings.Parameters(
                takerFee,
                makerFee,
                takerFeeNextPrice,
                makerFeeNextPrice,
                nextPriceConfirmWindow,
                maxLeverage,
                maxMarketValueUSD,
                maxFundingRate,
                skewScaleUSD
            );
    }

    function _marketSummaries(address[] memory markets) internal view returns (MarketSummary[] memory) {
        uint numMarkets = markets.length;
        MarketSummary[] memory summaries = new MarketSummary[](numMarkets);
        for (uint i; i < numMarkets; i++) {
            IFuturesV2MarketViews market = IFuturesV2MarketViews(markets[i]);
            bytes32 marketKey = market.marketKey();
            bytes32 baseAsset = market.baseAsset();
            IFuturesV2MarketSettings.Parameters memory params = _parameters(marketKey);

            (uint price, ) = market.assetPrice();
            (uint debt, ) = market.marketDebt();

            summaries[i] = MarketSummary(
                address(market),
                baseAsset,
                marketKey,
                params.maxLeverage,
                price,
                market.marketSize(),
                market.marketSkew(),
                debt,
                market.currentFundingRate(),
                FeeRates(params.takerFee, params.makerFee, params.takerFeeNextPrice, params.makerFeeNextPrice)
            );
        }

        return summaries;
    }

    function marketSummaries(address[] calldata markets) external view returns (MarketSummary[] memory) {
        return _marketSummaries(markets);
    }

    function marketSummariesForKeys(bytes32[] calldata marketKeys) external view returns (MarketSummary[] memory) {
        return _marketSummaries(_futuresMarketManager().marketsForKeys(marketKeys));
    }

    function allMarketSummaries() external view returns (MarketSummary[] memory) {
        return _marketSummaries(_futuresMarketManager().allMarkets());
    }

    function _fundingParameters(IFuturesV2MarketSettings.Parameters memory params)
        internal
        pure
        returns (FundingParameters memory)
    {
        return FundingParameters(params.maxFundingRate, params.skewScaleUSD);
    }

    function _marketSizes(IFuturesV2MarketViews market) internal view returns (Sides memory) {
        (uint long, uint short) = market.marketSizes();
        return Sides(long, short);
    }

    function _marketDetails(IFuturesV2MarketViews market) internal view returns (MarketData memory) {
        (uint price, bool invalid) = market.assetPrice();
        (uint marketDebt, ) = market.marketDebt();
        bytes32 baseAsset = market.baseAsset();
        bytes32 marketKey = market.marketKey();

        IFuturesV2MarketSettings.Parameters memory params = _parameters(marketKey);

        return
            MarketData(
                address(market),
                baseAsset,
                marketKey,
                FeeRates(params.takerFee, params.makerFee, params.takerFeeNextPrice, params.makerFeeNextPrice),
                MarketLimits(params.maxLeverage, params.maxMarketValueUSD),
                _fundingParameters(params),
                MarketSizeDetails(market.marketSize(), _marketSizes(market), marketDebt, market.marketSkew()),
                PriceDetails(price, invalid)
            );
    }

    function marketDetails(IFuturesV2MarketViews market) external view returns (MarketData memory) {
        return _marketDetails(market);
    }

    function marketDetailsForKey(bytes32 marketKey) external view returns (MarketData memory) {
        return _marketDetails(IFuturesV2MarketViews(_futuresMarketManager().marketForKey(marketKey)));
    }

    function _position(IFuturesV2MarketViews market, address account)
        internal
        view
        returns (IFuturesV2MarketBaseTypes.Position memory)
    {
        return market.positions(account);
    }

    function _notionalValue(IFuturesV2MarketViews market, address account) internal view returns (int) {
        (int value, ) = market.notionalValue(account);
        return value;
    }

    function _profitLoss(IFuturesV2MarketViews market, address account) internal view returns (int) {
        (int value, ) = market.profitLoss(account);
        return value;
    }

    function _accruedFunding(IFuturesV2MarketViews market, address account) internal view returns (int) {
        (int value, ) = market.accruedFunding(account);
        return value;
    }

    function _remainingMargin(IFuturesV2MarketViews market, address account) internal view returns (uint) {
        (uint value, ) = market.remainingMargin(account);
        return value;
    }

    function _accessibleMargin(IFuturesV2MarketViews market, address account) internal view returns (uint) {
        (uint value, ) = market.accessibleMargin(account);
        return value;
    }

    function _liquidationPrice(IFuturesV2MarketViews market, address account) internal view returns (uint) {
        (uint liquidationPrice, ) = market.liquidationPrice(account);
        return liquidationPrice;
    }

    function _positionDetails(IFuturesV2MarketViews market, address account) internal view returns (PositionData memory) {
        return
            PositionData(
                _position(market, account),
                _notionalValue(market, account),
                _profitLoss(market, account),
                _accruedFunding(market, account),
                _remainingMargin(market, account),
                _accessibleMargin(market, account),
                _liquidationPrice(market, account),
                market.canLiquidate(account)
            );
    }

    function positionDetails(IFuturesV2MarketViews market, address account) external view returns (PositionData memory) {
        return _positionDetails(market, account);
    }

    function positionDetailsForMarketKey(bytes32 marketKey, address account) external view returns (PositionData memory) {
        return _positionDetails(IFuturesV2MarketViews(_futuresMarketManager().marketForKey(marketKey)), account);
    }
}
