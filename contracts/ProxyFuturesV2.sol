pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./Proxy.sol";
import "./interfaces/IFuturesV2MarketViews.sol";

// https://docs.synthetix.io/contracts/source/contracts/proxy
contract ProxyFuturesV2 is Proxy, IFuturesV2MarketViews {
    constructor(address _owner) public Proxy(_owner) {}

    /* ---------- Market Details ---------- */

    function marketKey() external view returns (bytes32 key) {
        // Immutable static call from target contract
        return IFuturesV2MarketViews(address(target)).marketKey();
    }

    function baseAsset() external view returns (bytes32 key) {
        // Immutable static call from target contract
        return IFuturesV2MarketViews(address(target)).baseAsset();
    }

    function marketSize() external view returns (uint128 size) {
        // Immutable static call from target contract
        return IFuturesV2MarketViews(address(target)).marketSize();
    }

    function marketSkew() external view returns (int128 skew) {
        // Immutable static call from target contract
        return IFuturesV2MarketViews(address(target)).marketSkew();
    }

    function fundingLastRecomputed() external view returns (uint32 timestamp) {
        // Immutable static call from target contract
        return IFuturesV2MarketViews(address(target)).fundingLastRecomputed();
    }

    function fundingSequence(uint index) external view returns (int128 netFunding) {
        // Immutable static call from target contract
        return IFuturesV2MarketViews(address(target)).fundingSequence(index);
    }

    /* ---------- Position Details ---------- */

    function positions(address account)
        external
        view
        returns (
            uint64 id,
            uint64 fundingIndex,
            uint128 margin,
            uint128 lastPrice,
            int128 size
        )
    {
        // Immutable static call from target contract
        return IFuturesV2MarketViews(address(target)).positions(account);
    }

    function assetPrice() external view returns (uint price, bool invalid) {
        // Immutable static call from target contract
        return IFuturesV2MarketViews(address(target)).assetPrice();
    }

    function marketSizes() external view returns (uint long, uint short) {
        // Immutable static call from target contract
        return IFuturesV2MarketViews(address(target)).marketSizes();
    }

    function marketDebt() external view returns (uint debt, bool isInvalid) {
        // Immutable static call from target contract
        return IFuturesV2MarketViews(address(target)).marketDebt();
    }

    function currentFundingRate() external view returns (int fundingRate) {
        // Immutable static call from target contract
        return IFuturesV2MarketViews(address(target)).currentFundingRate();
    }

    function unrecordedFunding() external view returns (int funding, bool invalid) {
        // Immutable static call from target contract
        return IFuturesV2MarketViews(address(target)).unrecordedFunding();
    }

    function fundingSequenceLength() external view returns (uint length) {
        // Immutable static call from target contract
        return IFuturesV2MarketViews(address(target)).fundingSequenceLength();
    }

    /* ---------- Position Details ---------- */

    function notionalValue(address account) external view returns (int value, bool invalid) {
        // Immutable static call from target contract
        return IFuturesV2MarketViews(address(target)).notionalValue(account);
    }

    function profitLoss(address account) external view returns (int pnl, bool invalid) {
        // Immutable static call from target contract
        return IFuturesV2MarketViews(address(target)).profitLoss(account);
    }

    function accruedFunding(address account) external view returns (int funding, bool invalid) {
        // Immutable static call from target contract
        return IFuturesV2MarketViews(address(target)).accruedFunding(account);
    }

    function remainingMargin(address account) external view returns (uint marginRemaining, bool invalid) {
        // Immutable static call from target contract
        return IFuturesV2MarketViews(address(target)).remainingMargin(account);
    }

    function accessibleMargin(address account) external view returns (uint marginAccessible, bool invalid) {
        // Immutable static call from target contract
        return IFuturesV2MarketViews(address(target)).accessibleMargin(account);
    }

    function liquidationPrice(address account) external view returns (uint price, bool invalid) {
        // Immutable static call from target contract
        return IFuturesV2MarketViews(address(target)).liquidationPrice(account);
    }

    function liquidationFee(address account) external view returns (uint) {
        // Immutable static call from target contract
        return IFuturesV2MarketViews(address(target)).liquidationFee(account);
    }

    function canLiquidate(address account) external view returns (bool) {
        // Immutable static call from target contract
        return IFuturesV2MarketViews(address(target)).canLiquidate(account);
    }

    function orderFee(int sizeDelta) external view returns (uint fee, bool invalid) {
        // Immutable static call from target contract
        return IFuturesV2MarketViews(address(target)).orderFee(sizeDelta);
    }

    function postTradeDetails(int sizeDelta, address sender)
        external
        view
        returns (
            uint margin,
            int size,
            uint price,
            uint liqPrice,
            uint fee,
            IFuturesV2MarketBaseTypes.Status status
        )
    {
        // Immutable static call from target contract
        return IFuturesV2MarketViews(address(target)).postTradeDetails(sizeDelta, sender);
    }
}
