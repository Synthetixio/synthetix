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
        uint exchangeFee;
    }

    struct MarketLimits {
        uint maxLeverage;
        uint maxTotalMargin;
        uint minInitialMargin;
    }

    struct Sides {
        uint short;
        uint long;
    }

    struct MarketSizeDetails {
        uint marketSize;
        FuturesMarketData.Sides sides;
        uint marketDebt;
        int marketSkew;
        int proportionalSkew;
        int entryMarginMinusNotionalSkewSum;
        uint pendingOrderValue;
    }

    struct PriceDetails {
        uint price;
        uint currentRoundId;
        bool isInvalid;
    }

    struct FundingDetails {
        int currentFundingRate;
        int unrecordedFunding;
        uint fundingLastRecomputed;
    }

    struct MarketData {
        address market;
        bytes32 baseAsset;
        uint exchangeFee;
        FuturesMarketData.MarketLimits limits;
        FuturesMarket.FundingParameters fundingParameters;
        FuturesMarketData.MarketSizeDetails marketSizeDetails;
        FuturesMarketData.PriceDetails priceDetails;
    }

    struct PositionData {
        FuturesMarket.Order order;
        FuturesMarket.Position position;
        int notionalValue;
        int profitLoss;
        int accruedFunding;
        int remainingMargin;
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

    function _marketSummaries(address[] memory markets) internal view returns (MarketSummary[] memory) {
        uint numMarkets = markets.length;
        MarketSummary[] memory summaries = new MarketSummary[](numMarkets);
        for (uint i; i < numMarkets; i++) {
            FuturesMarket market = FuturesMarket(markets[i]);

            (uint price, ) = market.priceAndInvalid();
            (uint debt, ) = market.marketDebt();

            summaries[i] = MarketSummary(
                address(market),
                market.baseAsset(),
                market.maxLeverage(),
                price,
                market.marketSize(),
                market.marketSkew(),
                debt,
                market.currentFundingRate(),
                market.exchangeFee()
            );
        }

        return summaries;
    }

    function marketSummaryForMarkets(address[] calldata markets) external view returns (MarketSummary[] memory) {
        return _marketSummaries(markets);
    }

    function marketSummaryForAssets(bytes32[] calldata assets) external view returns (MarketSummary[] memory) {
        return _marketSummaries(_futuresMarketManager().marketsForAssets(assets));
    }

    function allMarketSummaries() external view returns (MarketSummary[] memory) {
        return _marketSummaries(_futuresMarketManager().allMarkets());
    }

    function marketDetails(FuturesMarket market) external view returns (MarketData memory) {
        (uint maxFundingRate, uint maxFundingRateSkew, uint maxFundingRateDelta) = market.fundingParameters();
        (uint short, uint long) = market.marketSizes();
        (uint price, bool isInvalid) = market.priceAndInvalid();

        (uint marketDebt, ) = market.marketDebt();

        return
            MarketData(
                address(market),
                market.baseAsset(),
                market.exchangeFee(),
                MarketLimits(market.maxLeverage(), market.maxTotalMargin(), market.minInitialMargin()),
                FuturesMarket.FundingParameters(maxFundingRate, maxFundingRateSkew, maxFundingRateDelta),
                MarketSizeDetails(
                    market.marketSize(),
                    Sides(short, long),
                    marketDebt,
                    market.marketSkew(),
                    market.proportionalSkew(),
                    market.entryMarginMinusNotionalSkewSum(),
                    market.pendingOrderValue()
                ),
                PriceDetails(price, market.currentRoundId(), isInvalid)
            );
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

    function _remainingMargin(FuturesMarket market, address account) internal view returns (int) {
        (int value, ) = market.remainingMargin(account);
        return value;
    }

    function positionDetails(FuturesMarket market, address account) external view returns (PositionData memory) {
        (bool orderPending, int orderMargin, uint orderLeverage, uint orderFee, uint orderRoundId) = market.orders(account);
        (int positionMargin, int positionSize, uint positionEntryPrice, uint positionEntryIndex) = market.positions(account);

        return
            PositionData(
                FuturesMarket.Order(orderPending, orderMargin, orderLeverage, orderFee, orderRoundId),
                FuturesMarket.Position(positionMargin, positionSize, positionEntryPrice, positionEntryIndex),
                _notionalValue(market, account),
                _profitLoss(market, account),
                _accruedFunding(market, account),
                _remainingMargin(market, account),
                market.liquidationPrice(account, true)
            );
    }
}
