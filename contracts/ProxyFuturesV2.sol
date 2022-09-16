pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./Proxy.sol";
import "./interfaces/IFuturesV2MarketViews.sol";

// https://docs.synthetix.io/contracts/source/contracts/proxy
contract ProxyFuturesV2 is Proxy, IFuturesV2MarketViews {
    constructor(address _owner) public Proxy(_owner) {}

    IFuturesV2MarketViews public viewsTarget;

    function setViewsTarget(IFuturesV2MarketViews _target) external onlyOwner {
        viewsTarget = _target;
        emit ViewsTargetUpdated(_target);
    }

    /* ---------- Market Details ---------- */

    function marketKey() external view returns (bytes32 key) {
        // Immutable static call from target contract
        return viewsTarget.marketKey();
    }

    function baseAsset() external view returns (bytes32 key) {
        // Immutable static call from target contract
        return viewsTarget.baseAsset();
    }

    function marketSize() external view returns (uint128 size) {
        // Immutable static call from target contract
        return viewsTarget.marketSize();
    }

    function marketSkew() external view returns (int128 skew) {
        // Immutable static call from target contract
        return viewsTarget.marketSkew();
    }

    function fundingLastRecomputed() external view returns (uint32 timestamp) {
        // Immutable static call from target contract
        return viewsTarget.fundingLastRecomputed();
    }

    function fundingSequence(uint index) external view returns (int128 netFunding) {
        // Immutable static call from target contract
        return viewsTarget.fundingSequence(index);
    }

    /* ---------- Position Details ---------- */

    function positions(address account)
        external
        view
        returns (
            uint64 id,
            uint64 lastFundingIndex,
            uint128 margin,
            uint128 lastPrice,
            int128 size
        )
    {
        // Immutable static call from target contract
        return viewsTarget.positions(account);
    }

    function assetPrice() external view returns (uint price, bool invalid) {
        // Immutable static call from target contract
        return viewsTarget.assetPrice();
    }

    function marketSizes() external view returns (uint long, uint short) {
        // Immutable static call from target contract
        return viewsTarget.marketSizes();
    }

    function marketDebt() external view returns (uint debt, bool isInvalid) {
        // Immutable static call from target contract
        return viewsTarget.marketDebt();
    }

    function currentFundingRate() external view returns (int fundingRate) {
        // Immutable static call from target contract
        return viewsTarget.currentFundingRate();
    }

    function unrecordedFunding() external view returns (int funding, bool invalid) {
        // Immutable static call from target contract
        return viewsTarget.unrecordedFunding();
    }

    function fundingSequenceLength() external view returns (uint length) {
        // Immutable static call from target contract
        return viewsTarget.fundingSequenceLength();
    }

    /* ---------- Position Details ---------- */

    function notionalValue(address account) external view returns (int value, bool invalid) {
        // Immutable static call from target contract
        return viewsTarget.notionalValue(account);
    }

    function profitLoss(address account) external view returns (int pnl, bool invalid) {
        // Immutable static call from target contract
        return viewsTarget.profitLoss(account);
    }

    function accruedFunding(address account) external view returns (int funding, bool invalid) {
        // Immutable static call from target contract
        return viewsTarget.accruedFunding(account);
    }

    function remainingMargin(address account) external view returns (uint marginRemaining, bool invalid) {
        // Immutable static call from target contract
        return viewsTarget.remainingMargin(account);
    }

    function accessibleMargin(address account) external view returns (uint marginAccessible, bool invalid) {
        // Immutable static call from target contract
        return viewsTarget.accessibleMargin(account);
    }

    function liquidationPrice(address account) external view returns (uint price, bool invalid) {
        // Immutable static call from target contract
        return viewsTarget.liquidationPrice(account);
    }

    function liquidationFee(address account) external view returns (uint) {
        // Immutable static call from target contract
        return viewsTarget.liquidationFee(account);
    }

    function canLiquidate(address account) external view returns (bool) {
        // Immutable static call from target contract
        return viewsTarget.canLiquidate(account);
    }

    function orderFee(int sizeDelta) external view returns (uint fee, bool invalid) {
        // Immutable static call from target contract
        return viewsTarget.orderFee(sizeDelta);
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
        return viewsTarget.postTradeDetails(sizeDelta, sender);
    }

    event ViewsTargetUpdated(IFuturesV2MarketViews newTarget);
}
