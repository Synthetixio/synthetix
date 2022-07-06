pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./PerpsEngineV2Base.sol";

/**
 * A mixin that implements vairous useful views that are used externally but
 * aren't used inside the core contract (so don't need to clutter the contract file)
 */
contract PerpsEngineV2ViewsMixin is PerpsEngineV2Base {
    /*
     * Sizes of the long and short sides of the market (in sUSD)
     */
    function marketSizes(bytes32 marketKey) external view returns (uint long, uint short) {
        MarketScalars memory market = _marketScalars(marketKey);
        int size = int(market.marketSize);
        int skew = market.marketSkew;
        return (_abs(size.add(skew).div(2)), _abs(size.sub(skew).div(2)));
    }

    /*
     * The debt contributed by this market to the overall system.
     * The total market debt is equivalent to the sum of remaining margins in all open positions.
     */
    function marketDebt(bytes32 marketKey) external view returns (uint debt, bool invalid) {
        (uint price, bool isInvalid) = assetPrice(marketKey);
        return (_marketDebt(marketKey, price), isInvalid);
    }

    /*
     * The current funding rate as determined by the market skew; this is returned as a percentage per day.
     * If this is positive, shorts pay longs, if it is negative, longs pay shorts.
     */
    function currentFundingRate(bytes32 marketKey) external view returns (int) {
        (uint price, ) = assetPrice(marketKey);
        return _currentFundingRate(marketKey, price);
    }

    /*
     * The funding per base unit accrued since the funding rate was last recomputed, which has not yet
     * been persisted in the funding sequence.
     */
    function unrecordedFunding(bytes32 marketKey) external view returns (int funding, bool invalid) {
        (uint price, bool isInvalid) = assetPrice(marketKey);
        return (_unrecordedFunding(marketKey, price), isInvalid);
    }

    /*
     * The price at which a position is subject to liquidation, and the expected liquidation fees at that price; o
     * When they have just enough margin left to pay a liquidator, then they are liquidated.
     * If a position is long, then it is safe as long as the current price is above the liquidation price; if it is
     * short, then it is safe whenever the current price is below the liquidation price.
     * A position's accurate liquidation price can move around slightly due to accrued funding.
     */
    function positionSummary(bytes32 marketKey, address account) external view returns (PositionSummary memory) {
        (uint price, bool isInvalid) = assetPrice(marketKey);
        Position memory position = _stateViews().positions(marketKey, account);
        uint liqPrice = _approxLiquidationPrice(position, price);
        // if position cannot be liquidated at any price (no leverage), return 0 as possible fee
        uint liqFee = liqPrice > 0 ? _liquidationFee(_notionalValue(int(position.size), liqPrice)) : 0;
        return
            PositionSummary({
                position: position,
                profitLoss: _profitLoss(position, price),
                accruedFunding: _accruedFunding(position, price),
                remainingMargin: _remainingMargin(position, price),
                accessibleMargin: _accessibleMargin(position, price),
                canLiquidate: _canLiquidate(position, price),
                approxLiquidationPrice: liqPrice,
                approxLiquidationFee: liqFee,
                priceInvalid: isInvalid
            });
    }

    function stateContract() external view returns (IPerpsStorageV2External) {
        return _stateViews();
    }

    /**
     * Reports the fee for submitting an order of a given size.
     * @param sizeDelta size of the order in baseAsset units (negative numbers for shorts / selling)
     * @return fee in sUSD decimal, and invalid boolean flag for invalid rates.
     */
    function orderFee(
        bytes32 marketKey,
        int sizeDelta,
        uint feeRate
    ) external view returns (uint fee, bool invalid) {
        (uint price, bool isInvalid) = assetPrice(marketKey);
        TradeParams memory params =
            TradeParams({sizeDelta: sizeDelta, price: price, feeRate: feeRate, trackingCode: bytes32(0)});
        return (_orderFee(params), isInvalid);
    }

    /*
     * Returns all new position details if a given order from `sender` was confirmed at the current price.
     */
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
            Status status
        )
    {
        (uint price, bool invalid) = assetPrice(marketKey);
        if (invalid) {
            return (0, 0, 0, Status.InvalidPrice);
        }

        Position memory position = _stateViews().positions(marketKey, account);

        TradeParams memory params =
            TradeParams({sizeDelta: sizeDelta, price: price, feeRate: feeRate, trackingCode: bytes32(0)});
        return _postTradeDetails(position, params);
    }

    /// helper methods calculates the approximate liquidation price
    function _approxLiquidationPrice(Position memory position, uint currentPrice) internal view returns (uint) {
        int positionSize = int(position.size);

        // short circuit
        if (positionSize == 0) {
            return 0;
        }

        int netFunding = _accruedFunding(position, currentPrice);

        // minimum margin beyond which position can be liqudiated
        uint liqMargin = _liquidationMargin(_notionalValue(positionSize, currentPrice));

        // price = lastPrice + (liquidationMargin - margin) / positionSize - netFunding
        // A position can be liquidated whenever:
        //     remainingMargin <= liquidationMargin
        // Hence, expanding the definition of remainingMargin the price
        // at which a position can first be liquidated is:
        //     margin + profitLoss + funding = liquidationMargin
        //     substitute with: profitLoss = (price - last-price) * positionSize
        //     we get: margin + (price - last-price) * positionSize + netFunding =  liquidationMargin
        //     moving around: price  = lastPrice + (liquidationMargin - margin - netFunding) / positionSize
        int result =
            int(position.lastPrice).add(
                int(liqMargin).sub(int(position.margin).sub(netFunding)).divideDecimal(positionSize)
            );

        // If the user has leverage less than 1, their liquidation price may actually be negative; return 0 instead.
        return uint(_max(0, result));
    }
}
