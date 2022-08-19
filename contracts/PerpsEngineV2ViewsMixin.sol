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
    function marketSizes(bytes32 marketKey) public view returns (uint long, uint short) {
        return _sideSizes(_marketScalars(marketKey));
    }

    /// view for returning max possible order size that take into account existing positions
    function maxOrderSizes(bytes32 marketKey) external view returns (uint long, uint short) {
        (uint price, ) = assetPrice(marketKey);
        (uint longSize, uint shortSize) = marketSizes(marketKey);
        uint sizeLimit = _maxSingleSideValueUSD(marketKey).divideDecimal(price);
        long = longSize < sizeLimit ? sizeLimit.sub(longSize) : 0;
        short = shortSize < sizeLimit ? sizeLimit.sub(shortSize) : 0;
        return (long, short);
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
     *
     */
    function marketSummary(bytes32 marketKey) external view returns (MarketSummary memory) {
        MarketScalars memory marketScalars = _stateViews().marketScalars(marketKey);
        (uint price, bool invalid) = assetPrice(marketKey);
        uint debt = _marketDebt(marketKey, price);
        (uint long, uint short) = _sideSizes(marketScalars);
        return
            MarketSummary({
                marketKey: marketKey,
                baseAsset: marketScalars.baseAsset,
                price: price,
                marketSize: marketScalars.marketSize,
                marketSkew: marketScalars.marketSkew,
                marketSizeLong: long,
                marketSizeShort: short,
                marketDebt: debt,
                currentFundingRate: _currentFundingRate(marketKey, price),
                unrecordedFunding: _unrecordedFunding(marketKey, price),
                priceInvalid: invalid
            });
    }

    /// this is a separate view (in addition to being part of position summary) because
    /// is used on-chain to get withdrawable amount
    function withdrawableMargin(bytes32 marketKey, address account) external view returns (uint) {
        (uint price, ) = assetPrice(marketKey);
        return _withdrawableMargin(_stateViews().position(marketKey, account), price);
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
        Position memory position = _stateViews().position(marketKey, account);
        uint liqPrice = _approxLiquidationPrice(position, price);
        // if position cannot be liquidated at any price, return 0 as possible fee
        uint liqFee = liqPrice > 0 ? _liquidationFee(_notionalValue(int(position.size), liqPrice)) : 0;
        uint remainingMargin = _remainingMargin(position, price);
        return
            PositionSummary({
                position: position,
                profitLoss: _profitLoss(position, price),
                accruedFunding: _accruedFunding(position, price),
                remainingMargin: remainingMargin,
                withdrawableMargin: _withdrawableMargin(position, price),
                currentLeverage: _currentLeverage(_notionalValue(position.size, price), remainingMargin),
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
        ExecutionOptions calldata options
    ) external view returns (uint fee, bool invalid) {
        (uint price, bool isInvalid) = assetPrice(marketKey);
        TradeParams memory params = _executionOptionsToTradeParams(sizeDelta, price, options);
        return (_orderFee(params), isInvalid);
    }

    /*
     * Returns all new position details if a given order from `sender` was confirmed at the current price.
     */
    function postTradeDetails(
        bytes32 marketKey,
        address account,
        int sizeDelta,
        ExecutionOptions calldata options
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

        Position memory position = _stateViews().position(marketKey, account);
        TradeParams memory params = _executionOptionsToTradeParams(sizeDelta, price, options);
        return _postTradeDetails(position, params);
    }

    ////// Helper views

    function _sideSizes(MarketScalars memory marketScalars) internal pure returns (uint long, uint short) {
        int size = int(marketScalars.marketSize);
        int skew = marketScalars.marketSkew;
        return (_abs(size.add(skew).div(2)), _abs(size.sub(skew).div(2)));
    }

    /// calculates approximate liquidation price, with the following approximations:
    ///     1. Liquidation margin is assumed to be for current price instead of the liquidation price.
    ///     this is because liq-margin is non linear because of the max(min-keeper-fee, liq-fee) component,
    ///     so solving for it precisely is not straight forward.
    ///     2. Funding accrued at some future time is unknown, and current funding is used to adjust the
    ///     current margin.
    /// During the actual liquidation this computation is not used, and instead the actual position margin
    /// is calculated (using the profit loss and actual funding accrued.
    function _approxLiquidationPrice(Position memory position, uint currentPrice) internal view returns (uint) {
        int positionSize = int(position.size);

        // short circuit
        if (positionSize == 0) {
            return 0;
        }

        int netFunding = _accruedFunding(position, currentPrice);

        // minimum margin beyond which position can be liquidated
        uint liqMargin = _liquidationMargin(_notionalValue(positionSize, currentPrice));

        // price = lastPrice + (liquidationMargin - margin) / positionSize - netFunding
        // A position can be liquidated whenever:
        //     remainingMargin <= liquidationMargin
        // Hence, expanding the definition of remainingMargin the price
        // at which a position can first be liquidated is:
        //     margin + profitLoss + funding = liquidationMargin
        //     substitute with: profitLoss = (price - last-price) * positionSize
        //     we get: margin + (price - last-price) * positionSize + netFunding =  liquidationMargin
        //     moving around: price = lastPrice + (liquidationMargin - (margin + netFunding)) / positionSize
        int result =
            int(position.lastPrice).add(
                int(liqMargin).sub(int(position.margin).add(netFunding)).divideDecimal(positionSize)
            );

        // If the user has leverage less than 1, their liquidation price may actually be negative; return 0 instead.
        return uint(_max(0, result));
    }
}
