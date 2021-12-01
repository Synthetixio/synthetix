pragma solidity ^0.5.16;

// Inheritance
import "./FuturesMarketBase.sol";

/**
 * A mixin that implements vairous useful views that are used externally but
 * aren't used inside the core contract (so don't need to clutter the contract file)
 */
contract MixinFuturesViews is FuturesMarketBase {
    /*
     * The current base price from the oracle, and whether that price was invalid. Zero prices count as invalid.
     */
    function assetPrice() external view returns (uint price, bool invalid) {
        return _assetPrice();
    }

    function _marketSizes() internal view returns (uint long, uint short) {
        int size = int(marketSize);
        int skew = marketSkew;
        return (_abs(size.add(skew).div(2)), _abs(size.sub(skew).div(2)));
    }

    /*
     * The total number of base units on each side of the market.
     */
    function marketSizes() external view returns (uint long, uint short) {
        return _marketSizes();
    }

    /*
     * The remaining units on each side of the market left to be filled before hitting the cap.
     */
    function _maxOrderSizes(uint price) internal view returns (uint, uint) {
        (uint long, uint short) = _marketSizes();
        int sizeLimit = int(_maxMarketValueUSD(baseAsset)).divideDecimal(int(price));
        return (uint(sizeLimit.sub(_min(int(long), sizeLimit))), uint(sizeLimit.sub(_min(int(short), sizeLimit))));
    }

    /*
     * The maximum size in base units of an order on each side of the market that will not exceed the max market value.
     */
    function maxOrderSizes()
        external
        view
        returns (
            uint long,
            uint short,
            bool invalid
        )
    {
        (uint price, bool isInvalid) = _assetPrice();
        (uint longSize, uint shortSize) = _maxOrderSizes(price);
        return (longSize, shortSize, isInvalid);
    }

    function _marketDebt(uint price) internal view returns (uint) {
        // see comment explaining this calculation in _positionDebtCorrection()
        int totalDebt =
            int(marketSkew).multiplyDecimal(int(price).add(_nextFundingEntry(fundingSequence.length, price))).add(
                _entryDebtCorrection
            );

        return uint(_max(totalDebt, 0));
    }

    /*
     * The debt contributed by this market to the overall system.
     * The total market debt is equivalent to the sum of remaining margins in all open positions.
     */
    function marketDebt() external view returns (uint debt, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice();
        return (_marketDebt(price), isInvalid);
    }

    /*
     * The basic settings of this market, which determine trading fees and funding rate behaviour.
     */
    function parameters()
        external
        view
        returns (
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
        )
    {
        return _parameters(baseAsset);
    }

    /*
     * The current funding rate as determined by the market skew; this is returned as a percentage per day.
     * If this is positive, shorts pay longs, if it is negative, longs pay shorts.
     */
    function currentFundingRate() external view returns (int) {
        (uint price, ) = _assetPrice();
        return _currentFundingRate(price);
    }

    /*
     * The funding per base unit accrued since the funding rate was last recomputed, which has not yet
     * been persisted in the funding sequence.
     */
    function unrecordedFunding() external view returns (int funding, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice();
        return (_unrecordedFunding(price), isInvalid);
    }

    /*
     * Computes the net funding that was accrued between any two funding sequence indices.
     * If endIndex is equal to the funding sequence length, then unrecorded funding will be included.
     */
    function netFundingPerUnit(uint startIndex, uint endIndex) external view returns (int funding, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice();
        return (_netFundingPerUnit(startIndex, endIndex, fundingSequence.length, price), isInvalid);
    }

    /*
     * The number of entries in the funding sequence.
     */
    function fundingSequenceLength() external view returns (uint) {
        return fundingSequence.length;
    }

    /*
     * The notional value of a position is its size multiplied by the current price. Margin and leverage are ignored.
     */
    function notionalValue(address account) external view returns (int value, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice();
        return (_notionalValue(positions[account], price), isInvalid);
    }

    /*
     * The PnL of a position is the change in its notional value. Funding is not taken into account.
     */
    function profitLoss(address account) external view returns (int pnl, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice();
        return (_profitLoss(positions[account], price), isInvalid);
    }

    /*
     * The funding accrued in a position since it was opened; this does not include PnL.
     */
    function accruedFunding(address account) external view returns (int funding, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice();
        return (_accruedFunding(positions[account], fundingSequence.length, price), isInvalid);
    }

    /*
     * The initial margin plus profit and funding; returns zero balance if losses exceed the initial margin.
     */
    function remainingMargin(address account) external view returns (uint marginRemaining, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice();
        return (_remainingMargin(positions[account], fundingSequence.length, price), isInvalid);
    }

    /*
     * The approximate amount of margin the user may withdraw given their current position; this underestimates the
     * true value slightly.
     */
    function accessibleMargin(address account) external view returns (uint marginAccessible, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice();
        return (_accessibleMargin(positions[account], fundingSequence.length, price), isInvalid);
    }

    /**
     * The minimal margin at which liquidation can happen. Is the sum of liquidationBuffer and liquidationFee.
     * Reverts if position size is 0.
     * @param account address of the position account
     * @return lMargin liquidation margin to maintain in sUSD fixed point decimal units
     */
    function liquidationMargin(address account) external view returns (uint lMargin) {
        require(positions[account].size != 0, "0 size position");
        (uint price, ) = _assetPrice();
        return _liquidationMargin(int(positions[account].size), price);
    }

    /*
     * The price at which a position is subject to liquidation; otherwise the price at which the user's remaining
     * margin has run out. When they have just enough margin left to pay a liquidator, then they are liquidated.
     * If a position is long, then it is safe as long as the current price is above the liquidation price; if it is
     * short, then it is safe whenever the current price is below the liquidation price.
     * A position's accurate liquidation price can move around slightly due to accrued funding - this contribution
     * can be omitted by passing false to includeFunding.
     */
    function liquidationPrice(address account, bool includeFunding) external view returns (uint price, bool invalid) {
        (uint aPrice, bool isInvalid) = _assetPrice();
        uint liqPrice = _liquidationPrice(positions[account], includeFunding, aPrice);
        return (liqPrice, isInvalid);
    }

    /**
     * The fee paid to liquidator in the event of successful liquidation of an account at current price.
     * Returns 0 if account cannot be liquidated right now.
     * @param account address of the trader's account
     * @return fee that will be paid for liquidating the account if it can be liquidated
     *  in sUSD fixed point decimal units or 0 if account is not liquidatable.
     */
    function liquidationFee(address account) external view returns (uint) {
        (uint price, bool invalid) = _assetPrice();
        if (!invalid && _canLiquidate(positions[account], fundingSequence.length, price)) {
            return _liquidationFee(int(positions[account].size), price);
        } else {
            // theoretically we can calculate a value, but this value is always incorrect because
            // it's for a price at which liquidation cannot happen - so is misleading, because
            // it won't be paid, and what will be paid is a different fee (for a different price)
            return 0;
        }
    }

    /*
     * True if and only if a position is ready to be liquidated.
     */
    function canLiquidate(address account) external view returns (bool) {
        (uint price, bool invalid) = _assetPrice();
        return !invalid && _canLiquidate(positions[account], fundingSequence.length, price);
    }

    /*
     * Equivalent to the position's notional value divided by its remaining margin.
     */
    function currentLeverage(address account) external view returns (int leverage, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice();
        Position storage position = positions[account];
        uint remainingMargin_ = _remainingMargin(position, fundingSequence.length, price);
        return (_currentLeverage(position, price, remainingMargin_), isInvalid);
    }

    /*
     * Reports the fee for submitting an order of a given size. Orders that increase the skew will be more
     * expensive than ones that decrease it; closing positions implies a different fee rate.
     */
    function orderFee(int sizeDelta) external view returns (uint fee, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice();
        TradeParams memory params =
            TradeParams({
                sizeDelta: sizeDelta,
                price: price,
                fundingIndex: 0, // doesn't matter for fee calculation
                takerFee: _takerFee(baseAsset),
                makerFee: _makerFee(baseAsset)
            });
        return (_orderFee(params), isInvalid);
    }

    /*
     * Returns all new position details if a given order from `sender` was confirmed at the current price.
     */
    function postTradeDetails(int sizeDelta, address sender)
        external
        view
        returns (
            uint margin,
            int size,
            uint price,
            uint liqPrice,
            uint fee,
            Status status
        )
    {
        bool invalid;
        (price, invalid) = _assetPrice();
        if (invalid) {
            return (0, 0, 0, 0, 0, Status.InvalidPrice);
        }

        TradeParams memory params =
            TradeParams({
                sizeDelta: sizeDelta,
                price: price,
                fundingIndex: fundingSequence.length,
                takerFee: _takerFee(baseAsset),
                makerFee: _makerFee(baseAsset)
            });
        (Position memory newPosition, uint fee_, Status status_) = _postTradeDetails(positions[sender], params);

        liqPrice = _liquidationPrice(newPosition, true, newPosition.lastPrice);
        return (newPosition.margin, newPosition.size, newPosition.lastPrice, liqPrice, fee_, status_);
    }
}
