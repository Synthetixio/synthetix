pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Internal references
import "./interfaces/IFuturesMarket.sol";
import "./interfaces/IFuturesMarketBaseTypes.sol";
import "./interfaces/IFuturesMarketManager.sol";
import "./interfaces/IFuturesMarketSettings.sol";
import "./interfaces/IAddressResolver.sol";

// https://docs.synthetix.io/contracts/source/contracts/FuturesMarketData
// A utility contract to allow the front end to query market data in a single call.
contract FuturesMarketData {
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
        FuturesMarketData.Sides sides;
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
        uint maxFundingRateDelta;
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
        FuturesMarketData.FeeRates feeRates;
        FuturesMarketData.MarketLimits limits;
        FuturesMarketData.FundingParameters fundingParameters;
        FuturesMarketData.MarketSizeDetails marketSizeDetails;
        FuturesMarketData.PriceDetails priceDetails;
    }

    struct PositionData {
        IFuturesMarketBaseTypes.Position position;
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

    function globals() external view returns (FuturesGlobals memory) {
        IFuturesMarketSettings settings = _futuresMarketSettings();
        return
            FuturesGlobals({
                minInitialMargin: settings.minInitialMargin(),
                liquidationFeeRatio: settings.liquidationFeeRatio(),
                liquidationBufferRatio: settings.liquidationBufferRatio(),
                minKeeperFee: settings.minKeeperFee()
            });
    }

    function parameters(bytes32 baseAsset) external view returns (IFuturesMarketSettings.Parameters memory) {
        return _parameters(baseAsset);
    }

    function _parameters(bytes32 baseAsset) internal view returns (IFuturesMarketSettings.Parameters memory) {
        (
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
        ) = _futuresMarketSettings().parameters(baseAsset);
        return
            IFuturesMarketSettings.Parameters(
                takerFee,
                makerFee,
                takerFeeNextPrice,
                makerFeeNextPrice,
                nextPriceConfirmWindow,
                maxLeverage,
                maxMarketValueUSD,
                maxFundingRate,
                skewScaleUSD,
                maxFundingRateDelta
            );
    }

    function _marketSummaries(address[] memory markets) internal view returns (MarketSummary[] memory) {
        uint numMarkets = markets.length;
        MarketSummary[] memory summaries = new MarketSummary[](numMarkets);
        for (uint i; i < numMarkets; i++) {
            IFuturesMarket market = IFuturesMarket(markets[i]);
            bytes32 baseAsset = market.baseAsset();
            IFuturesMarketSettings.Parameters memory params = _parameters(baseAsset);

            (uint price, ) = market.assetPrice();
            (uint debt, ) = market.marketDebt();

            summaries[i] = MarketSummary(
                address(market),
                baseAsset,
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

    function marketSummariesForAssets(bytes32[] calldata assets) external view returns (MarketSummary[] memory) {
        return _marketSummaries(_futuresMarketManager().marketsForAssets(assets));
    }

    function allMarketSummaries() external view returns (MarketSummary[] memory) {
        return _marketSummaries(_futuresMarketManager().allMarkets());
    }

    function _fundingParameters(IFuturesMarketSettings.Parameters memory params)
        internal
        pure
        returns (FundingParameters memory)
    {
        return FundingParameters(params.maxFundingRate, params.skewScaleUSD, params.maxFundingRateDelta);
    }

    function _marketSizes(IFuturesMarket market) internal view returns (Sides memory) {
        (uint long, uint short) = market.marketSizes();
        return Sides(long, short);
    }

    function _marketDetails(IFuturesMarket market) internal view returns (MarketData memory) {
        (uint price, bool invalid) = market.assetPrice();
        (uint marketDebt, ) = market.marketDebt();
        bytes32 baseAsset = market.baseAsset();

        IFuturesMarketSettings.Parameters memory params = _parameters(baseAsset);

        return
            MarketData(
                address(market),
                baseAsset,
                FeeRates(params.takerFee, params.makerFee, params.takerFeeNextPrice, params.makerFeeNextPrice),
                MarketLimits(params.maxLeverage, params.maxMarketValueUSD),
                _fundingParameters(params),
                MarketSizeDetails(market.marketSize(), _marketSizes(market), marketDebt, market.marketSkew()),
                PriceDetails(price, invalid)
            );
    }

    function marketDetails(IFuturesMarket market) external view returns (MarketData memory) {
        return _marketDetails(market);
    }

    function marketDetailsForAsset(bytes32 asset) external view returns (MarketData memory) {
        return _marketDetails(IFuturesMarket(_futuresMarketManager().marketForAsset(asset)));
    }

    function _position(IFuturesMarket market, address account)
        internal
        view
        returns (IFuturesMarketBaseTypes.Position memory)
    {
        (uint positionId, uint positionMargin, int positionSize, uint positionEntryPrice, uint positionEntryIndex) =
            market.positions(account);
        return
            IFuturesMarketBaseTypes.Position(
                positionId,
                positionMargin,
                positionSize,
                positionEntryPrice,
                positionEntryIndex
            );
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

    function _accessibleMargin(IFuturesMarket market, address account) internal view returns (uint) {
        (uint value, ) = market.accessibleMargin(account);
        return value;
    }

    function _liquidationPrice(IFuturesMarket market, address account) internal view returns (uint) {
        (uint liquidationPrice, ) = market.liquidationPrice(account, true);
        return liquidationPrice;
    }

    function _positionDetails(IFuturesMarket market, address account) internal view returns (PositionData memory) {
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

    function positionDetails(IFuturesMarket market, address account) external view returns (PositionData memory) {
        return _positionDetails(market, account);
    }

    function positionDetailsForAsset(bytes32 asset, address account) external view returns (PositionData memory) {
        return _positionDetails(IFuturesMarket(_futuresMarketManager().marketForAsset(asset)), account);
    }
}
