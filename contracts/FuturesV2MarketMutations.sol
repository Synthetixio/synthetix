pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./Proxyable.sol";

// Inheritance
import "./FuturesV2MarketBase.sol";

// Libraries
import "openzeppelin-solidity-2.3.0/contracts/math/SafeMath.sol";
import "./SignedSafeMath.sol";
import "./SignedSafeDecimalMath.sol";
import "./SafeDecimalMath.sol";

/*
 * Synthetic Futures
 * =================
 *
 * Futures markets allow users leveraged exposure to an asset, long or short.
 * A user must post some margin in order to open a futures account, and profits/losses are
 * continually tallied against this margin. If a user's margin runs out, then their position is closed
 * by a liquidation keeper, which is rewarded with a flat fee extracted from the margin.
 *
 * The Synthetix debt pool is effectively the counterparty to each trade, so if a particular position
 * is in profit, then the debt pool pays by issuing sUSD into their margin account,
 * while if the position makes a loss then the debt pool burns sUSD from the margin, reducing the
 * debt load in the system.
 *
 * As the debt pool underwrites all positions, the debt-inflation risk to the system is proportional to the
 * long-short skew in the market. It is therefore in the interest of the system to reduce the skew.
 * To encourage the minimisation of the skew, each position is charged a funding rate, which increases with
 * the size of the skew. The funding rate is charged continuously, and positions on the heavier side of the
 * market are charged the current funding rate times the notional value of their position, while positions
 * on the lighter side are paid at the same rate to keep their positions open.
 * As the funding rate is the same (but negated) on both sides of the market, there is an excess quantity of
 * funding being charged, which is collected by the debt pool, and serves to reduce the system debt.
 *
 * To combat front-running, the system does not confirm a user's order until the next price is received from
 * the oracle. Therefore opening a position is a three stage procedure: depositing margin, submitting an order,
 * and waiting for that order to be confirmed. The last transaction is performed by a keeper,
 * once a price update is detected.
 *
 * The contract architecture is as follows:
 *
 *     - FuturesV2Market.sol:         one of these exists per asset. Margin is maintained isolated per market.
 *
 *     - FuturesV2MarketManager.sol:  the manager keeps track of which markets exist, and is the main window between
 *                                  futures markets and the rest of the system. It accumulates the total debt
 *                                  over all markets, and issues and burns sUSD on each market's behalf.
 *
 *     - FuturesV2MarketSettings.sol: Holds the settings for each market in the global FlexibleStorage instance used
 *                                  by SystemSettings, and provides an interface to modify these values. Other than
 *                                  the base asset, these settings determine the behaviour of each market.
 *                                  See that contract for descriptions of the meanings of each setting.
 *
 * Each futures market and the manager operates behind a proxy, and for efficiency they communicate with one another
 * using their underlying implementations.
 *
 * Technical note: internal functions within the FuturesV2Market contract assume the following:
 *
 *     - prices passed into them are valid;
 *
 *     - funding has already been recomputed up to the current time (hence unrecorded funding is nil);
 *
 *     - the account being managed was not liquidated in the same transaction;
 */
// https://docs.synthetix.io/contracts/source/contracts/FuturesV2MarketMutations
contract FuturesV2MarketMutations is FuturesV2MarketBase, Proxyable {
    /* ========== CONSTRUCTOR ========== */

    constructor(
        address payable _proxy,
        address _marketState,
        address _owner,
        address _resolver
    ) public FuturesV2MarketBase(_marketState, _owner, _resolver) Proxyable(_proxy) {}

    /* ========== MUTATIVE FUNCTIONS ========== */

    /* ---------- Market Operations ---------- */

    /*
     * The current base price, reverting if it is invalid, or if system or synth is suspended.
     * This is mutative because the circuit breaker stores the last price on every invocation.
     */
    function _assetPriceRequireSystemChecks() internal returns (uint) {
        // check that futures market isn't suspended, revert with appropriate message
        _systemStatus().requireFuturesMarketActive(marketState.marketKey()); // asset and market may be different
        // check that synth is active, and wasn't suspended, revert with appropriate message
        _systemStatus().requireSynthActive(marketState.baseAsset());
        // check if circuit breaker if price is within deviation tolerance and system & synth is active
        // note: rateWithBreakCircuit (mutative) is used here instead of rateWithInvalid (view). This is
        //  despite reverting immediately after if circuit is broken, which may seem silly.
        //  This is in order to persist last-rate in exchangeCircuitBreaker in the happy case
        //  because last-rate is what used for measuring the deviation for subsequent trades.
        (uint price, bool circuitBroken) = _exchangeCircuitBreaker().rateWithBreakCircuit(marketState.baseAsset());
        // revert if price is invalid or circuit was broken
        // note: we revert here, which means that circuit is not really broken (is not persisted), this is
        //  because the futures methods and interface are designed for reverts, and do not support no-op
        //  return values.
        _revertIfError(circuitBroken, Status.InvalidPrice);
        return price;
    }

    function _recomputeFunding(uint price) internal returns (uint lastIndex) {
        uint sequenceLengthBefore = marketState.fundingSequenceLength();

        int funding = _nextFundingEntry(price);
        marketState.pushFundingSequence(int128(funding));
        marketState.setFundingLastRecomputed(uint32(block.timestamp));
        proxy._emit(
            abi.encode(funding, sequenceLengthBefore, marketState.fundingLastRecomputed()),
            1,
            FUNDINGRECOMPUTED_SIG,
            0,
            0,
            0
        );

        return sequenceLengthBefore;
    }

    /**
     * Pushes a new entry to the funding sequence at the current price and funding rate.
     * @dev Admin only method accessible to FuturesV2MarketSettings. This is admin only because:
     * - When system parameters change, funding should be recomputed, but system may be paused
     *   during that time for any reason, so this method needs to work even if system is paused.
     *   But in that case, it shouldn't be accessible to external accounts.
     */
    function recomputeFunding() external returns (uint lastIndex) {
        // only FuturesV2MarketSettings is allowed to use this method (calling it directly, not via proxy)
        _revertIfError(messageSender != _settings(), Status.NotPermitted);
        // This method is the only mutative method that uses the view _assetPrice()
        // and not the mutative _assetPriceRequireSystemChecks() that reverts on system flags.
        // This is because this method is used by system settings when changing funding related
        // parameters, so needs to function even when system / market is paused. E.g. to facilitate
        // market migration.
        (uint price, bool invalid) = _assetPrice();
        // A check for a valid price is still in place, to ensure that a system settings action
        // doesn't take place when the price is invalid (e.g. some oracle issue).
        require(!invalid, "Invalid price");
        return _recomputeFunding(price);
    }

    /*
     * The impact of a given position on the debt correction.
     */
    function _positionDebtCorrection(Position memory position) internal view returns (int) {
        /**
        This method only returns the correction term for the debt calculation of the position, and not it's 
        debt. This is needed for keeping track of the _marketDebt() in an efficient manner to allow O(1) marketDebt
        calculation in _marketDebt().

        Explanation of the full market debt calculation from the SIP https://sips.synthetix.io/sips/sip-80/:

        The overall market debt is the sum of the remaining margin in all positions. The intuition is that
        the debt of a single position is the value withdrawn upon closing that position.

        single position remaining margin = initial-margin + profit-loss + accrued-funding =
            = initial-margin + q * (price - last-price) + q * funding-accrued-per-unit
            = initial-margin + q * price - q * last-price + q * (funding - initial-funding)

        Total debt = sum ( position remaining margins )
            = sum ( initial-margin + q * price - q * last-price + q * (funding - initial-funding) )
            = sum( q * price ) + sum( q * funding ) + sum( initial-margin - q * last-price - q * initial-funding )
            = skew * price + skew * funding + sum( initial-margin - q * ( last-price + initial-funding ) )
            = skew (price + funding) + sum( initial-margin - q * ( last-price + initial-funding ) )

        The last term: sum( initial-margin - q * ( last-price + initial-funding ) ) being the position debt correction
            that is tracked with each position change using this method. 
        
        The first term and the full debt calculation using current skew, price, and funding is calculated globally in _marketDebt().
         */
        return
            int(position.margin).sub(
                int(position.size).multiplyDecimal(
                    int(position.lastPrice).add(marketState.fundingSequence(position.lastFundingIndex))
                )
            );
    }

    /*
     * Alter the debt correction to account for the net result of altering a position.
     */
    function _applyDebtCorrection(Position memory newPosition, Position memory oldPosition) internal {
        int newCorrection = _positionDebtCorrection(newPosition);
        int oldCorrection = _positionDebtCorrection(oldPosition);
        marketState.setEntryDebtCorrection(
            int128(int(marketState.entryDebtCorrection()).add(newCorrection).sub(oldCorrection))
        );
    }

    function _transferMargin(
        int marginDelta,
        uint price,
        address sender
    ) internal {
        // Transfer no tokens if marginDelta is 0
        uint absDelta = _abs(marginDelta);
        if (marginDelta > 0) {
            // A positive margin delta corresponds to a deposit, which will be burnt from their
            // sUSD balance and credited to their margin account.

            // Ensure we handle reclamation when burning tokens.
            uint postReclamationAmount = _manager().burnSUSD(sender, absDelta);
            if (postReclamationAmount != absDelta) {
                // If balance was insufficient, the actual delta will be smaller
                marginDelta = int(postReclamationAmount);
            }
        } else if (marginDelta < 0) {
            // A negative margin delta corresponds to a withdrawal, which will be minted into
            // their sUSD balance, and debited from their margin account.
            _manager().issueSUSD(sender, absDelta);
        } else {
            // Zero delta is a no-op
            return;
        }

        Position memory position = marketState.getPosition(sender);

        _updatePositionMargin(sender, position, price, marginDelta);

        proxy._emit(abi.encode(marginDelta), 2, MARGINTRANSFERRED_SIG, addressToBytes32(sender), 0, 0);

        emitPositionModified(position.id, sender, position.margin, position.size, 0, price, _latestFundingIndex(), 0);
    }

    // updates the stored position margin in place (on the stored position)
    function _updatePositionMargin(
        address account,
        Position memory position,
        uint price,
        int marginDelta
    ) internal {
        Position memory oldPosition = position;
        // Determine new margin, ensuring that the result is positive.
        (uint margin, Status status) = _recomputeMarginWithDelta(oldPosition, price, marginDelta);
        _revertIfError(status);

        // Update the debt correction.
        int positionSize = position.size;
        uint fundingIndex = _latestFundingIndex();
        _applyDebtCorrection(
            Position(0, uint64(fundingIndex), uint128(margin), uint128(price), int128(positionSize)),
            Position(0, position.lastFundingIndex, position.margin, position.lastPrice, int128(positionSize))
        );

        // Update the account's position with the realised margin.
        position.margin = uint128(margin);
        // We only need to update their funding/PnL details if they actually have a position open
        if (positionSize != 0) {
            position.lastPrice = uint128(price);
            position.lastFundingIndex = uint64(fundingIndex);

            // The user can always decrease their margin if they have no position, or as long as:
            //     * they have sufficient margin to do so
            //     * the resulting margin would not be lower than the liquidation margin or min initial margin
            //     * the resulting leverage is lower than the maximum leverage
            if (marginDelta < 0) {
                _revertIfError(
                    (margin < _minInitialMargin()) ||
                        (margin <= _liquidationMargin(position.size, price)) ||
                        (_maxLeverage(marketState.marketKey()) < _abs(_currentLeverage(position, price, margin))),
                    Status.InsufficientMargin
                );
            }
        }

        // persist position changes
        marketState.updatePosition(
            account,
            position.id,
            position.lastFundingIndex,
            position.margin,
            position.lastPrice,
            position.size
        );
    }

    /*
     * Alter the amount of margin in a position. A positive input triggers a deposit; a negative one, a
     * withdrawal. The margin will be burnt or issued directly into/out of the caller's sUSD wallet.
     * Reverts on deposit if the caller lacks a sufficient sUSD balance.
     * Reverts on withdrawal if the amount to be withdrawn would expose an open position to liquidation.
     */
    function transferMargin(int marginDelta) external onlyProxy {
        uint price = _assetPriceRequireSystemChecks();
        _recomputeFunding(price);
        _transferMargin(marginDelta, price, messageSender);
    }

    /*
     * Withdraws all accessible margin in a position. This will leave some remaining margin
     * in the account if the caller has a position open. Equivalent to `transferMargin(-accessibleMargin(sender))`.
     */
    function withdrawAllMargin() external onlyProxy {
        address sender = messageSender;
        uint price = _assetPriceRequireSystemChecks();
        _recomputeFunding(price);
        int marginDelta = -int(_accessibleMargin(marketState.getPosition(sender), price));
        _transferMargin(marginDelta, price, sender);
    }

    function _trade(address sender, TradeParams memory params) internal {
        Position memory position = marketState.getPosition(sender);
        Position memory oldPosition =
            Position({
                id: position.id,
                lastFundingIndex: position.lastFundingIndex,
                margin: position.margin,
                lastPrice: position.lastPrice,
                size: position.size
            });

        // Compute the new position after performing the trade
        (Position memory newPosition, uint fee, Status status) = _postTradeDetails(oldPosition, params);
        _revertIfError(status);

        // Update the aggregated market size and skew with the new order size
        marketState.setMarketSkew(int128(int(marketState.marketSkew()).add(newPosition.size).sub(oldPosition.size)));
        marketState.setMarketSize(
            uint128(uint(marketState.marketSize()).add(_abs(newPosition.size)).sub(_abs(oldPosition.size)))
        );

        // Send the fee to the fee pool
        if (0 < fee) {
            _manager().payFee(fee);
            // emit tracking code event
            if (params.trackingCode != bytes32(0)) {
                proxy._emit(
                    abi.encode(marketState.baseAsset(), marketState.marketKey(), params.sizeDelta, fee),
                    2,
                    FUTURESTRACKING_SIG,
                    params.trackingCode,
                    0,
                    0
                );
            }
        }

        // Update the margin, and apply the resulting debt correction
        position.margin = newPosition.margin;
        _applyDebtCorrection(newPosition, oldPosition);

        // Record the trade
        uint64 id = oldPosition.id;
        uint fundingIndex = _latestFundingIndex();
        if (newPosition.size == 0) {
            // If the position is being closed, we no longer need to track these details.
            delete position.id;
            delete position.size;
            delete position.lastPrice;
            delete position.lastFundingIndex;
        } else {
            if (oldPosition.size == 0) {
                // New positions get new ids.
                id = marketState.nextPositionId();
                marketState.setNextPositionId(id + 1);
            }
            position.id = id;
            position.size = newPosition.size;
            position.lastPrice = uint128(params.price);
            position.lastFundingIndex = uint64(fundingIndex);
        }

        // persist position changes
        marketState.updatePosition(
            sender,
            position.id,
            position.lastFundingIndex,
            position.margin,
            position.lastPrice,
            position.size
        );

        // emit the modification event
        emitPositionModified(
            id,
            sender,
            newPosition.margin,
            newPosition.size,
            params.sizeDelta,
            params.price,
            fundingIndex,
            fee
        );
    }

    /*
     * Adjust the sender's position size.
     * Reverts if the resulting position is too large, outside the max leverage, or is liquidating.
     */
    function modifyPosition(int sizeDelta) external {
        _modifyPosition(sizeDelta, bytes32(0));
    }

    /*
     * Same as modifyPosition, but emits an event with the passed tracking code to
     * allow offchain calculations for fee sharing with originating integrations
     */
    function modifyPositionWithTracking(int sizeDelta, bytes32 trackingCode) external {
        _modifyPosition(sizeDelta, trackingCode);
    }

    function _modifyPosition(int sizeDelta, bytes32 trackingCode) internal onlyProxy {
        uint price = _assetPriceRequireSystemChecks();
        _recomputeFunding(price);
        _trade(
            messageSender,
            TradeParams({
                sizeDelta: sizeDelta,
                price: price,
                takerFee: _takerFee(marketState.marketKey()),
                makerFee: _makerFee(marketState.marketKey()),
                trackingCode: trackingCode
            })
        );
    }

    /*
     * Submit an order to close a position.
     */
    function closePosition() external {
        _closePosition(bytes32(0));
    }

    /// Same as closePosition, but emits an even with the trackingCode for volume source fee sharing
    function closePositionWithTracking(bytes32 trackingCode) external {
        _closePosition(trackingCode);
    }

    function _closePosition(bytes32 trackingCode) internal onlyProxy {
        int size = marketState.getPosition(messageSender).size;
        _revertIfError(size == 0, Status.NoPositionOpen);
        uint price = _assetPriceRequireSystemChecks();
        _recomputeFunding(price);
        _trade(
            messageSender,
            TradeParams({
                sizeDelta: -size,
                price: price,
                takerFee: _takerFee(marketState.marketKey()),
                makerFee: _makerFee(marketState.marketKey()),
                trackingCode: trackingCode
            })
        );
    }

    function _liquidatePosition(
        address account,
        address liquidator,
        uint price
    ) internal {
        Position memory position = marketState.getPosition(account);

        // get remaining margin for sending any leftover buffer to fee pool
        uint remMargin = _remainingMargin(position, price);

        // Record updates to market size and debt.
        int positionSize = position.size;
        uint positionId = position.id;
        marketState.setMarketSkew(int128(int(marketState.marketSkew()).sub(positionSize)));
        marketState.setMarketSize(uint128(uint(marketState.marketSize()).sub(_abs(positionSize))));

        uint fundingIndex = _latestFundingIndex();
        _applyDebtCorrection(
            Position(0, uint64(fundingIndex), 0, uint128(price), 0),
            Position(0, position.lastFundingIndex, position.margin, position.lastPrice, int128(positionSize))
        );

        // Close the position itself.
        marketState.deletePosition(account);

        // Issue the reward to the liquidator.
        uint liqFee = _liquidationFee(positionSize, price);
        _manager().issueSUSD(liquidator, liqFee);

        emitPositionModified(positionId, account, 0, 0, 0, price, fundingIndex, 0);
        proxy._emit(
            abi.encode(positionId, account, liquidator, positionSize, price, liqFee),
            1,
            POSITIONLIQUIDATED_SIG,
            0,
            0,
            0
        );

        // Send any positive margin buffer to the fee pool
        if (remMargin > liqFee) {
            _manager().payFee(remMargin.sub(liqFee));
        }
    }

    /*
     * Liquidate a position if its remaining margin is below the liquidation fee. This succeeds if and only if
     * `canLiquidate(account)` is true, and reverts otherwise.
     * Upon liquidation, the position will be closed, and the liquidation fee minted into the liquidator's account.
     */
    function liquidatePosition(address account) external onlyProxy {
        uint price = _assetPriceRequireSystemChecks();
        _recomputeFunding(price);

        _revertIfError(!_canLiquidate(marketState.getPosition(account), price), Status.CannotLiquidate);

        _liquidatePosition(account, messageSender, price);
    }

    /* ========== EVENTS ========== */
    function addressToBytes32(address input) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(input)));
    }

    event MarginTransferred(address indexed account, int marginDelta);
    bytes32 internal constant MARGINTRANSFERRED_SIG = keccak256("MarginTransferred(address,int256)");

    event PositionModified(
        uint indexed id,
        address indexed account,
        uint margin,
        int size,
        int tradeSize,
        uint lastPrice,
        uint fundingIndex,
        uint fee
    );
    bytes32 internal constant POSITIONMODIFIED_SIG =
        keccak256("PositionModified(uint256,address,uint256,int256,int256,uint256,uint256,uint256)");

    function emitPositionModified(
        uint id,
        address account,
        uint margin,
        int size,
        int tradeSize,
        uint lastPrice,
        uint fundingIndex,
        uint fee
    ) internal {
        proxy._emit(
            abi.encode(margin, size, tradeSize, lastPrice, fundingIndex, fee),
            3,
            POSITIONMODIFIED_SIG,
            bytes32(id),
            addressToBytes32(account),
            0
        );
    }

    event PositionLiquidated(uint id, address account, address liquidator, int size, uint price, uint fee);
    bytes32 internal constant POSITIONLIQUIDATED_SIG =
        keccak256("PositionLiquidated(uint256,address,address,int256,uint256,uint256)");

    event FundingRecomputed(int funding, uint index, uint timestamp);
    bytes32 internal constant FUNDINGRECOMPUTED_SIG = keccak256("FundingRecomputed(int256,uint256,uint256)");

    event FuturesTracking(bytes32 indexed trackingCode, bytes32 baseAsset, bytes32 marketKey, int sizeDelta, uint fee);
    bytes32 internal constant FUTURESTRACKING_SIG = keccak256("FuturesTracking(bytes32,bytes32,bytes32,int256,uint256)");
}
