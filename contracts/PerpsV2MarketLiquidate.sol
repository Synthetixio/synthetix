pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./PerpsV2MarketProxyable.sol";
import "./interfaces/IPerpsV2MarketLiquidate.sol";

/*
 * Synthetic PerpsV2
 * =================
 *
 * PerpsV2 markets allow users leveraged exposure to an asset, long or short.
 * A user must post some margin in order to open a perpsV2 account, and profits/losses are
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
 * The contract architecture is as follows:
 *
 *     - FuturesMarketManager.sol:  the manager keeps track of which markets exist, and is the main window between
 *                                  futures and perpsV2 markets and the rest of the system. It accumulates the total debt
 *                                  over all markets, and issues and burns sUSD on each market's behalf.
 *
 *     - PerpsV2MarketSettings.sol: Holds the settings for each market in the global FlexibleStorage instance used
 *                                  by SystemSettings, and provides an interface to modify these values. Other than
 *                                  the base asset, these settings determine the behaviour of each market.
 *                                  See that contract for descriptions of the meanings of each setting.
 *
 * Each market is composed of the following pieces, one of each of this exists per asset:
 *
 *     - ProxyPerpsV2.sol:          The Proxy is the main entry point and visible, permanent address of the market.
 *                                  It acts as a combination of Proxy and Router sending the messages to the
 *                                  appropriate implementation (or fragment) of the Market.
 *                                  Margin is maintained isolated per market. each market is composed of several
 *                                  contracts (or fragments) accessed by this proxy:
 *                                  `base` contains all the common logic and is inherited by other fragments.
 *                                  It's treated as abstract and not deployed alone;
 *                                  `proxyable` is an extension of `base` that implements the proxyable interface
 *                                  and is used as base for fragments that require the messageSender.
 *                                  `mutations` contains the basic market behaviour
 *                                  `views` contains functions to provide visibility to different parameters and
 *                                  is used by external or manager contracts.
 *                                  `delayedOrders` contains the logic to implement the delayed order flows.
 *                                  `offchainDelayedOrders` contains the logic to implement the delayed order
 *                                  with off-chain pricing flows.
 *
 *     - PerpsV2State.sol:          The State contracts holds all the state for the market and is consumed/updated
 *                                  by the fragments.
 *                                  It provides access to the positions in case a migration is needed in the future.
 *
 *     - PerpsV2Market.sol:         Contains the core logic to implement the market and position flows.
 *
 *     - PerpsV2MarketViews.sol:    Contains the logic to access market and positions parameters by external or
 *                                  manager contracts
 *
 *     - PerpsV2MarketDelayedOrdersOffchain.sol: Contains the logic to implement delayed order with off-chain pricing flows
 *
 *
 * Technical note: internal functions within the PerpsV2Market contract assume the following:
 *
 *     - prices passed into them are valid;
 *     - funding has already been recomputed up to the current time (hence unrecorded funding is nil);
 *     - the account being managed was not liquidated in the same transaction;
 */

// https://docs.synthetix.io/contracts/source/contracts/PerpsV2MarketLiquidate
contract PerpsV2MarketLiquidate is IPerpsV2MarketLiquidate, PerpsV2MarketProxyable {
    /* ========== CONSTRUCTOR ========== */

    constructor(
        address payable _proxy,
        address _marketState,
        address _owner,
        address _resolver
    ) public PerpsV2MarketProxyable(_proxy, _marketState, _owner, _resolver) {}

    /* ========== MUTATIVE FUNCTIONS ========== */
    /*
     * Liquidate a position if its remaining margin is below the liquidation fee. This succeeds if and only if
     * `canLiquidate(account)` is true, and reverts otherwise.
     * Upon liquidation, the position will be closed, and the liquidation fee minted into the liquidator's account.
     */
    function flagPosition(address account) external onlyProxy notFlagged(account) {
        uint price = _assetPriceRequireSystemChecks(false);
        _recomputeFunding(price);

        _revertIfError(!_canLiquidate(marketState.positions(account), price), Status.CannotLiquidate);

        _flagPosition(account, messageSender);
    }

    /*
     * Liquidate a position if its remaining margin is below the liquidation fee. This succeeds if and only if
     * `canLiquidate(account)` is true, and reverts otherwise.
     * Upon liquidation, the position will be closed, and the liquidation fee minted into the liquidator's account.
     */
    function liquidatePosition(address account) external onlyProxy flagged(account) {
        Position memory position = marketState.positions(account);
        uint price = _assetPriceRequireSystemChecks(false);
        _recomputeFunding(price);

        bytes32 marketKey = _marketKey();
        uint skewScale = _skewScale(marketKey);

        // Check price impact of liquidation
        require(
            _maxLiquidationDelta(marketKey) > _abs(position.size).divideDecimal(skewScale),
            "price impact of liquidation exceeded"
        );

        // Check Instantaneous P/D
        require(_maxPD(marketKey) > _abs(marketState.marketSkew()).divideDecimal(skewScale), "instantaneous P/D exceeded");

        // Liquidate and get remaining margin
        _liquidatePosition(position, account, messageSender, price, _keeperLiquidationFee());
    }

    function forceLiquidatePosition(address account) external onlyProxy flagged(account) {
        Position memory position = marketState.positions(account);
        uint price = _assetPriceRequireSystemChecks(false);
        _recomputeFunding(price);

        // Check if sender is endorsed
        require(_manager().isEndorsed(messageSender), "address not endorsed");

        // Liquidate and get remaining margin
        _liquidatePosition(position, account, messageSender, price, 0);
    }

    function _flagPosition(address account, address flagger) internal {
        Position memory position = marketState.positions(account);

        // Flag position
        marketState.flag(account, flagger);

        // Cleanup any outstanding delayed order
        DelayedOrder memory order = marketState.delayedOrders(account);
        if (order.sizeDelta != 0) {
            Position memory position = marketState.positions(account);
            uint price = _assetPriceRequireSystemChecks(false);
            uint fundingIndex = _recomputeFunding(price);
            _updatePositionMargin(account, position, order.sizeDelta, price, int(order.commitDeposit + order.keeperDeposit));
            emitPositionModified(position.id, account, position.margin, position.size, 0, price, fundingIndex, 0);

            marketState.deleteDelayedOrder(account);
        }

        emitPositionFlagged(position.id, account, flagger, block.timestamp);
    }

    function _liquidatePosition(
        Position memory position,
        address account,
        address liquidator,
        uint price,
        uint liquidatorFee
    ) internal {
        int128 positionSize = position.size;
        uint positionId = position.id;

        // Get remaining margin for sending any leftover buffer to fee pool
        //
        // note: we do _not_ use `_remainingLiquidatableMargin` here as we want to send this premium to the fee pool
        // upon liquidation to give back to stakers.
        uint remainingMargin = _remainingMargin(position, price);

        // Get fees to pay to flagger, liquidator and feepooland/or feePool)
        // Pay fee to flagger
        uint flaggerFee = _liquidationFee(positionSize, price);

        uint totalFees = flaggerFee.add(liquidatorFee);

        // update remaining margin
        remainingMargin = remainingMargin > totalFees ? remainingMargin.sub(totalFees) : 0;

        // Record updates to market size and debt.
        marketState.setMarketSkew(int128(int(marketState.marketSkew()).sub(positionSize)));
        marketState.setMarketSize(uint128(uint(marketState.marketSize()).sub(_abs(positionSize))));

        uint fundingIndex = _latestFundingIndex();
        _applyDebtCorrection(
            Position(0, uint64(fundingIndex), 0, uint128(price), 0),
            Position(0, position.lastFundingIndex, position.margin, position.lastPrice, positionSize)
        );

        // Issue the reward to the flagger.
        _manager().issueSUSD(marketState.positionFlagger(account), flaggerFee);

        // Issue the reward to the liquidator (keeper).
        if (liquidatorFee > 0) {
            _manager().issueSUSD(liquidator, liquidatorFee);
        }

        // Pay the remaining to feePool
        if (remainingMargin > 0) {
            _manager().payFee(remainingMargin);
        }

        // Close the position itself.
        marketState.deletePosition(account);

        // Unflag position.
        marketState.unflag(account);

        emitPositionModified(positionId, account, 0, 0, 0, price, fundingIndex, 0);

        emitPositionLiquidated(position.id, account, messageSender, position.size, price, totalFees);
    }

    /* ========== EVENTS ========== */

    event PositionFlagged(uint id, address account, address flagger, uint timestamp);
    bytes32 internal constant POSITIONFLAGGED_SIG = keccak256("PositionFlagged(uint256,address,address,uint256)");

    function emitPositionFlagged(
        uint id,
        address account,
        address flagger,
        uint timestamp
    ) internal {
        proxy._emit(abi.encode(id, account, flagger, timestamp), 1, POSITIONFLAGGED_SIG, 0, 0, 0);
    }

    event PositionLiquidated(uint id, address account, address liquidator, int size, uint price, uint fee);
    bytes32 internal constant POSITIONLIQUIDATED_SIG =
        keccak256("PositionLiquidated(uint256,address,address,int256,uint256,uint256)");

    function emitPositionLiquidated(
        uint id,
        address account,
        address liquidator,
        int size,
        uint price,
        uint fee
    ) internal {
        proxy._emit(abi.encode(id, account, liquidator, size, price, fee), 1, POSITIONLIQUIDATED_SIG, 0, 0, 0);
    }
}
