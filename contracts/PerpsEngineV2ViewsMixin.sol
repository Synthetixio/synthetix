pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./PerpsEngineV2Base.sol";

/**
 A mixin that implements various useful views that are used externally but
 aren't used inside the base contract (so don't need to clutter the contract file)
*/
contract PerpsEngineV2ViewsMixin is PerpsEngineV2Base {
    /// view for returning max possible order size in baseAsset terms
    /// that take into account existing positions (and the per side OI caps in sUSD terms)
    function maxOrderSizes(bytes32 marketKey) external view returns (uint long, uint short) {
        (uint price, ) = assetPrice(marketKey);
        (uint longSize, uint shortSize) = _sideSizes(_marketScalars(marketKey));
        uint sizeLimit = _maxSingleSideValueUSD(marketKey).divideDecimal(price);
        long = longSize < sizeLimit ? sizeLimit.sub(longSize) : 0;
        short = shortSize < sizeLimit ? sizeLimit.sub(shortSize) : 0;
        return (long, short);
    }

    /// The debt contributed by this market to the overall system.
    /// The total market debt is equivalent to the sum of remaining margins in all open positions.
    function marketDebt(bytes32 marketKey) external view returns (uint debt, bool invalid) {
        (uint price, bool isInvalid) = assetPrice(marketKey);
        return (_marketDebt(marketKey, price), isInvalid);
    }

    /// Summary view of a market
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
                currentFundingRate: _currentFundingRatePerDay(marketKey, price),
                unrecordedFunding: _unrecordedFunding(marketKey, price),
                priceInvalid: invalid
            });
    }

    /// Summary view of a position
    function positionSummary(bytes32 marketKey, address account) external view returns (PositionSummary memory) {
        (uint curPrice, bool isInvalid) = assetPrice(marketKey);
        Position memory position = _stateViews().position(marketKey, account);
        uint liqPrice = _approxLiquidationPrice(position, curPrice);
        // _liquidationFee is taking _notionalValue calculated using liqPrice and not curPrice.
        // This is not accurate (because liqPrice itself is an estimate, but is more accurate than using curPrice)
        // If position cannot be liquidated at any price, return 0 as possible fee
        uint liqFee = liqPrice > 0 ? _liquidationFee(_notionalValue(int(position.size), liqPrice)) : 0;
        uint remainingMargin = _remainingMargin(position, curPrice);
        return
            PositionSummary({
                position: position,
                profitLoss: _profitLoss(position, curPrice),
                accruedFunding: _accruedFunding(position, curPrice),
                remainingMargin: remainingMargin,
                withdrawableMargin: _withdrawableMargin(position, curPrice),
                currentLeverage: _currentLeverage(_notionalValue(position.size, curPrice), remainingMargin),
                canLiquidate: _canLiquidate(position, curPrice),
                approxLiquidationPrice: liqPrice,
                approxLiquidationFee: liqFee,
                priceInvalid: isInvalid
            });
    }

    /// this is a separate view (in addition to being part of position summary) because
    /// is used on-chain to get withdrawable amount
    function withdrawableMargin(bytes32 marketKey, address account) external view returns (uint) {
        (uint price, ) = assetPrice(marketKey);
        return _withdrawableMargin(_stateViews().position(marketKey, account), price);
    }

    // view that returns the storage contract (that contains additional useful data views)
    function stateContract() external view returns (IPerpsStorageV2External) {
        return _stateViews();
    }

    /// view that returns an array of bools indication for each account if can be liquidated
    function canLiquidate(bytes32 marketKey, address[] calldata accounts)
        external
        view
        returns (bool[] memory liquidatables)
    {
        (uint price, bool isInvalid) = assetPrice(marketKey);
        liquidatables = new bool[](accounts.length);

        for (uint i = 0; i < accounts.length; i++) {
            Position memory position = _stateViews().position(marketKey, accounts[i]);
            liquidatables[i] = !isInvalid && _canLiquidate(position, price);
        }
        return liquidatables;
    }

    /// simulates a trade including checks and results (as it would be done in trade())
    function simulateTrade(
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
            Status status
        )
    {
        (uint price, bool invalid) = assetPrice(marketKey);
        if (invalid) {
            return (0, 0, Status.InvalidPrice);
        }

        Position memory position = _stateViews().position(marketKey, account);
        TradeParams memory params = _executionOptionsToTradeParams(sizeDelta, price, options);
        return _tradeResults(position, params);
    }

    ////// Helper views

    // converts from marketSize & marketSkew to marketSizeLong & marketSizeShort
    function _sideSizes(MarketScalars memory marketScalars) internal pure returns (uint long, uint short) {
        int size = int(marketScalars.marketSize);
        int skew = marketScalars.marketSkew;
        return (_abs(size.add(skew).div(2)), _abs(size.sub(skew).div(2)));
    }

    /// calculates approximate liquidation price, with the following approximations:
    ///     1. Liquidation margin is assumed to be for current price instead of the liquidation price.
    ///     this is because liq-margin is non linear because of the max(min-keeper-fee, liq-fee) component,
    ///     so solving for it precisely is not worth the complexity and coupling.
    ///     2. Funding accrued at some future time is unknown, and current funding is used to adjust the
    ///     current margin.
    /// During the actual liquidation this computation is not used, and instead the actual position margin
    /// is calculated using the profit loss and actual funding accrued.
    function _approxLiquidationPrice(Position memory position, uint currentPrice) internal view returns (uint) {
        int positionSize = int(position.size);

        // short circuit
        if (positionSize == 0) {
            return 0;
        }

        // liquidation margin at current price
        uint liqMargin = _liquidationMargin(_notionalValue(positionSize, currentPrice));

        // accrued funding with current price and market funding
        int netFunding = _accruedFunding(position, currentPrice);

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
