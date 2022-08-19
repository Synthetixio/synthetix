pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./PerpsConfigGettersV2Mixin.sol";
import "./interfaces/IPerpsInterfacesV2.sol";
import "./interfaces/IFuturesMarketManager.sol";

// Libraries
import "openzeppelin-solidity-2.3.0/contracts/math/SafeMath.sol";
import "./SignedSafeMath.sol";
import "./SignedSafeDecimalMath.sol";
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/IExchangeCircuitBreaker.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/ISystemStatus.sol";
import "./interfaces/IERC20.sol";

contract PerpsEngineV2Base is PerpsConfigGettersV2Mixin, IPerpsTypesV2, IPerpsEngineV2Internal {
    /* ========== EVENTS ========== */

    event MarginModified(
        bytes32 indexed marketKey,
        address indexed account,
        int marginDelta,
        int transferAmount,
        int lockAmount,
        uint burnAmount
    );

    event PositionModified(
        bytes32 indexed marketKey,
        uint indexed id,
        address indexed account,
        uint margin,
        int size,
        int tradeSize,
        uint price,
        uint fee
    );

    event PositionLiquidated(
        bytes32 indexed marketKey,
        address indexed account,
        address indexed liquidator,
        int size,
        uint price,
        uint fee
    );

    event Tracking(bytes32 indexed trackingCode, bytes32 marketKey, address account, int sizeDelta, uint fee);

    /* ========== LIBRARIES ========== */

    using SafeMath for uint;
    using SignedSafeMath for int;
    using SignedSafeDecimalMath for int;
    using SafeDecimalMath for uint;

    /* ========== PUBLIC CONSTANTS ========== */

    bytes32 public constant CONTRACT_NAME = "PerpsEngineV2";

    /* ========== INTERNAL CONSTANTS ========== */

    // This is the same unit as used inside `SignedSafeDecimalMath`.
    int private constant _UNIT = int(10**uint(18));

    //slither-disable-next-line naming-convention
    bytes32 internal constant sUSD = "sUSD";

    mapping(uint8 => string) internal _errorMessages;

    // Address Resolver Configuration
    bytes32 internal constant CONTRACT_EXCHANGECIRCUITBREAKER = "ExchangeCircuitBreaker";
    bytes32 internal constant CONTRACT_PERPSMANAGERV2 = "PerpsManagerV2";
    bytes32 internal constant CONTRACT_PERPSTORAGEV2 = "PerpsStorageV2";
    bytes32 internal constant CONTRACT_SYSTEMSTATUS = "SystemStatus";

    /* ========== MODIFIERS ========== */

    modifier approvedRouterAndMarket(bytes32 marketKey) {
        // msg.sender is the calling order routers contract.
        // both the router and the marketKey (and possibly their combination)
        // need to be approved by the manager to ensure e.g. market amd routers were not removed, and router is
        // authorized to perform trades on behalf of users (and passing fee rates for those trades)
        bool approved = _manager().approvedRouterAndMarket(msg.sender, marketKey);
        _revertIfError(!approved, Status.NotPermitted);
        _;
    }

    modifier onlyManager() {
        _revertIfError(msg.sender != address(_manager()), Status.NotPermitted);
        _;
    }

    /* ========== CONSTRUCTOR ========== */

    constructor(address _resolver) public PerpsConfigGettersV2Mixin(_resolver) {
        // Set up the mapping between error codes and their revert messages.
        _errorMessages[uint8(Status.InvalidPrice)] = "Invalid price";
        _errorMessages[uint8(Status.CanLiquidate)] = "Position can be liquidated";
        _errorMessages[uint8(Status.CannotLiquidate)] = "Position cannot be liquidated";
        _errorMessages[uint8(Status.MaxMarketSizeExceeded)] = "Max market size exceeded";
        _errorMessages[uint8(Status.MaxLeverageExceeded)] = "Max leverage exceeded";
        _errorMessages[uint8(Status.InsufficientMargin)] = "Insufficient margin";
        _errorMessages[uint8(Status.NotPermitted)] = "Not permitted for this address";
        _errorMessages[uint8(Status.NilOrder)] = "Cannot submit empty order";
        _errorMessages[uint8(Status.NoPositionOpen)] = "No position open";
    }

    /* ========== EXTERNAL VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = PerpsConfigGettersV2Mixin.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](4);
        newAddresses[0] = CONTRACT_EXCHANGECIRCUITBREAKER;
        newAddresses[1] = CONTRACT_PERPSMANAGERV2;
        newAddresses[2] = CONTRACT_PERPSTORAGEV2;
        newAddresses[3] = CONTRACT_SYSTEMSTATUS;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    /*
     * The current base price from the oracle, and whether that price was invalid. Zero prices count as invalid.
     * Public because used both externally and internally
     */
    function assetPrice(bytes32 marketKey) public view returns (uint price, bool invalid) {
        bytes32 baseAsset = _marketScalars(marketKey).baseAsset;
        (price, invalid) = _exchangeCircuitBreaker().rateWithInvalid(baseAsset);
        return (price, invalid);
    }

    /* ========== EXTERNAL MUTATIVE METHODS ========== */

    function ensureInitialized(bytes32 marketKey, bytes32 baseAsset) external onlyManager {
        // load current stored market
        MarketScalars memory market = _stateViews().marketScalars(marketKey);
        if (market.baseAsset == bytes32(0)) {
            // market is not initialized yet, init its storage, this can only be done once in storage
            _stateMutative().initMarket(marketKey, baseAsset);
        } else {
            // market was previously initialized, ensure it was initialized to the same baseAsset
            // this behavior is important in order to allow manager to add previously removed markets
            // or for adding markets to a new manager that will call this method.
            require(market.baseAsset == baseAsset, "Initialized with different asset");
        }
    }

    /**
     * Updates funding entry with unrecorded funding.
     * @dev Admin only method accessible to PerpsManager. This is admin only because:
     * - When system parameters change, funding should be recomputed, but system may be paused
     *   during that time for any reason, so this method needs to work even if system is paused.
     *   But in that case, it shouldn't be accessible to external accounts.
     */
    function recomputeFunding(bytes32 marketKey) external onlyManager {
        if (_marketScalars(marketKey).marketSize == 0) {
            // short circuit in case of empty market (to avoid reverts on initial configuration)
            return;
        }
        // This method uses the view _assetPrice()
        // and not the mutative _assetPriceRequireSystemChecks() that reverts on system flags.
        // This is because this method is used by system settings when changing funding related
        // parameters, so needs to function even when system / market is paused. E.g. to facilitate
        // market migration.
        (uint price, bool invalid) = assetPrice(marketKey);
        // A check for a valid price is still in place, to ensure that a system settings action
        // doesn't take place when the price is invalid (e.g. some oracle issue).
        require(!invalid, "Invalid price");
        _recomputeFunding(marketKey, price);
    }

    /*
     * Alter the amount of margin in a position. A positive input triggers a deposit; a negative one, a
     * withdrawal. The margin will be burnt or issued directly into/out of the caller's sUSD wallet.
     * Reverts on deposit if the caller lacks a sufficient sUSD balance.
     * Reverts on withdrawal if the amount to be withdrawn would expose an open position to liquidation.
     */
    function transferMargin(
        bytes32 marketKey,
        address account,
        int amount
    ) external approvedRouterAndMarket(marketKey) {
        // allow topping up margin if this specific market is paused.
        // will still revert on all other checks (system, exchange, futures in general)
        bool allowMarketPaused = amount > 0;
        uint price = _assetPriceRequireSystemChecks(marketKey, allowMarketPaused);
        _recomputeFunding(marketKey, price);
        // handle the transfer and modify margin
        _transferMargin(marketKey, account, amount, price);
    }

    // used to lock funds from margin for future orders / payments according to order router logic
    // or refund back into margin
    function modifyLockedMargin(
        bytes32 marketKey,
        address account,
        int lockAmount,
        uint burnAmount
    ) external approvedRouterAndMarket(marketKey) {
        uint price = _assetPriceRequireSystemChecks(marketKey);
        _recomputeFunding(marketKey, price);
        _modifyMargin(marketKey, account, 0, lockAmount, burnAmount, price);
    }

    function trade(
        bytes32 marketKey,
        address account,
        int sizeDelta,
        ExecutionOptions calldata options
    ) external approvedRouterAndMarket(marketKey) {
        uint currentPrice = _assetPriceRequireSystemChecks(marketKey);
        // recompute funding using current price
        _recomputeFunding(marketKey, currentPrice);
        _trade(marketKey, account, _executionOptionsToTradeParams(sizeDelta, currentPrice, options));
    }

    /// allows order routers to pay fees with their internal logic (e.g. from previously locked margin)
    /// access controlled to only allowed routers for a market
    function managerPayFee(
        bytes32 marketKey,
        uint amount,
        bytes32 trackingCode
    ) external approvedRouterAndMarket(marketKey) {
        _manager().payFee(amount, trackingCode);
    }

    /// allows order routers to issue sUSD with their internal logic (e.g. from previously locked margin)
    /// access controlled to only allowed routers for a market
    function managerIssueSUSD(
        bytes32 marketKey,
        address to,
        uint amount
    ) external approvedRouterAndMarket(marketKey) {
        _manager().issueSUSD(to, amount);
    }

    /*
     * Liquidate a position if its remaining margin is below the liquidation fee. This succeeds if and only if
     * `canLiquidate(account)` is true, and reverts otherwise.
     * Upon liquidation, the position will be closed, and the liquidation fee minted into the liquidator's account.
     */
    function liquidatePosition(
        bytes32 marketKey,
        address account,
        address liquidator
    ) external {
        uint price = _assetPriceRequireSystemChecks(marketKey);
        _recomputeFunding(marketKey, price);
        _liquidatePosition(marketKey, account, price, liquidator);
    }

    /* ========== INTERNAL TYPES ========== */

    // internal convenience struct for passing params between position modification helper functions
    struct TradeParams {
        int sizeDelta;
        uint price;
        uint feeRate;
        bytes32 trackingCode; // tracking code for volume source fee sharing
    }

    /* ========== INTERNAL MUTATIVE LOGIC METHODS ========== */

    function _updateStoredPosition(
        bytes32 marketKey,
        address account,
        uint newMargin,
        uint newLocked,
        int newSize,
        uint price
    ) internal {
        // get previous values
        Position memory oldPosition = _stateViews().position(marketKey, account);
        // update position and ger the new state
        Position memory newPosition =
            _stateMutative().storePosition(marketKey, account, newMargin, newLocked, newSize, price);

        // load market scalars to update aggregates
        MarketScalars memory market = _marketScalars(marketKey);

        // update market size and skew
        int oldSize = oldPosition.size;
        int debtCorrectionDelta = _positionDebtCorrection(newPosition).sub(_positionDebtCorrection(oldPosition));

        _stateMutative().storeMarketAggregates(
            marketKey,
            market.marketSize.add(_abs(newSize)).sub(_abs(oldSize)),
            market.marketSkew.add(newSize).sub(oldSize),
            market.entryDebtCorrection.add(debtCorrectionDelta)
        );
    }

    /**
     * The current base price, reverting if it is invalid, or if system or synth is suspended.
     * This is mutative because the circuit breaker stores the last price on every invocation.
     * @param allowMarketPaused if true, checks everything except the specific market, if false
     *  checks only top level checks (system, exchange, futures)
     */
    function _assetPriceRequireSystemChecks(bytes32 marketKey, bool allowMarketPaused) internal returns (uint) {
        // check that market isn't suspended, revert with appropriate message
        if (allowMarketPaused) {
            // this will check system acivbe, exchange active, futures active
            _systemStatus().requireFuturesActive();
        } else {
            // this will check all of the above + that specific market is active
            _systemStatus().requireFuturesMarketActive(marketKey); // asset and market may be different
        }
        // TODO: refactor the following when circuit breaker is updated (SIP 230).
        // The reason both view and mutative are used is because the breaker, if attempting to suspend,
        // is trying to validate that the synth exists, and for perps - there is no synth,
        // so the suspension fails (reverts due to "No such synth"), but the happy path works ok

        // check the view first and revert if price is invalid or out deviation range
        bytes32 baseAsset = _marketScalars(marketKey).baseAsset;
        (uint price, bool invalid) = _exchangeCircuitBreaker().rateWithInvalid(baseAsset);
        _revertIfError(invalid, Status.InvalidPrice);

        // note: rateWithBreakCircuit (mutative) is used here in addition to rateWithInvalid (view).
        //  This is despite reverting above if circuit is broken, which may seem silly.
        //  This is in order to persist last-rate in exchangeCircuitBreaker in the happy case
        //  because last-rate is what used for measuring the deviation for subsequent trades.
        // This also means that the circuit will not be broken in unhappy case
        // because of the revert above.
        // The reason it has to revert instead of causing suspension is that perps
        // don't support no-op actions.
        _exchangeCircuitBreaker().rateWithBreakCircuit(baseAsset); // persist rate for next checks

        return price;
    }

    // default of allowMarketPaused is false, allow calling without this flag
    function _assetPriceRequireSystemChecks(bytes32 marketKey) internal returns (uint) {
        return _assetPriceRequireSystemChecks(marketKey, false);
    }

    function _recomputeFunding(bytes32 marketKey, uint price) internal {
        uint lastUpdated = _stateViews().lastFundingEntry(marketKey).timestamp;
        // only update once per block
        // funding is recorded for the time-passed, and no time passes within the block (for same timestamp)
        // note that updating only if funding amount changed is incorrect, because the fact that funding
        // hasn't changed in a period is also important to record (recorded in the updated timestamp)
        if (lastUpdated < block.timestamp) {
            int newFundingAmount = _nextFundingAmount(marketKey, price);
            _stateMutative().updateFunding(marketKey, newFundingAmount);
        }
    }

    function _transferMargin(
        bytes32 marketKey,
        address account,
        int transferDelta,
        uint price
    ) internal {
        // Transfer no tokens if transferDelta is 0
        uint absDelta = _abs(transferDelta);

        // if trying to add margin, handle reclamantion
        if (transferDelta > 0) {
            // Ensure we handle reclamation when burning tokens.
            uint postReclamationAmount = _manager().burnSUSD(account, absDelta);
            if (postReclamationAmount != absDelta) {
                // If balance was insufficient, the actual delta will be smaller
                transferDelta = int(postReclamationAmount);
            }
        } else if (transferDelta < 0) {
            // A negative margin delta corresponds to a withdrawal, which will be minted into
            // their sUSD balance, and debited from their margin account.
            _manager().issueSUSD(account, absDelta);
        }

        if (transferDelta == 0) {
            return; // no-op (side effect: maybe settles reclamation)
        } else {
            // now that account's sUSD was handled, modify the margin of the position
            _modifyMargin(marketKey, account, transferDelta, 0, 0, price);
        }
    }

    function _modifyMargin(
        bytes32 marketKey,
        address account,
        int transferAmount,
        int lockAmount,
        uint burnAmount,
        uint price
    ) internal {
        // prevent creating empty positions
        require(lockAmount != 0 || burnAmount != 0 || transferAmount != 0, "Zero modification amounts");
        // this ensures position is initialized so that it has the correct id (instead of zero) for events
        Position memory oldPosition = _stateMutative().positionWithInit(marketKey, account);

        // ensure we only burn as much as previously locked + newly locked
        // burn is always positive (uint), and lockedDelta can be positive or negative
        // but the old + delta - burn must be positive. If it's negative we're either unlocking
        // too much, or burning too much.
        int newLocked = int(oldPosition.lockedMargin).add(lockAmount).sub(int(burnAmount));
        require(newLocked >= 0, "New locked margin negative");

        // adding the unlocked margin to the margin delta
        // subtraction because lockedDelta is w.r.t to locked margin, so is negative w.r.t to margin
        // so marginDelta will increase if lockedDelta is negative
        int marginDelta = transferAmount.sub(lockAmount);

        // allow to add (unlock) some margin even if resulting position is still above max leverage
        bool checkLeverage = marginDelta < 0;
        // new realized margin, ensuring that the result is positive and non liquidatable
        (uint newMargin, Status status) = _realizedMarginAfterDelta(oldPosition, price, marginDelta, checkLeverage);

        // check result
        _revertIfError(status);

        // check min initial margin if position size is not 0
        if (oldPosition.size != 0 && newMargin < _minInitialMargin()) {
            _revertIfError(Status.InsufficientMargin);
        }

        _updateStoredPosition(marketKey, account, newMargin, uint(newLocked), oldPosition.size, price);

        emit MarginModified(marketKey, account, marginDelta, transferAmount, lockAmount, burnAmount);

        emit PositionModified({
            marketKey: marketKey,
            id: oldPosition.id,
            account: account,
            margin: newMargin,
            size: oldPosition.size,
            tradeSize: 0,
            price: price,
            fee: 0
        });
    }

    function _trade(
        bytes32 marketKey,
        address account,
        TradeParams memory params
    ) internal {
        Position memory oldPosition = _stateViews().position(marketKey, account);

        // Compute the new position after performing the trade
        (uint newMargin, int newSize, uint fee, Status status) = _postTradeDetails(oldPosition, params);

        // check result
        _revertIfError(status);

        // store change
        _updateStoredPosition(marketKey, account, newMargin, oldPosition.lockedMargin, newSize, params.price);

        // Send the fee to the fee pool
        if (0 < fee) {
            _manager().payFee(fee, params.trackingCode);
            // emit tracking code event
            if (params.trackingCode != bytes32(0)) {
                emit Tracking({
                    trackingCode: params.trackingCode,
                    marketKey: marketKey,
                    account: account,
                    sizeDelta: params.sizeDelta,
                    fee: fee
                });
            }
        }

        // emit the modification event
        emit PositionModified({
            marketKey: marketKey,
            id: oldPosition.id,
            account: account,
            margin: newMargin,
            size: newSize,
            tradeSize: params.sizeDelta,
            price: params.price,
            fee: fee
        });
    }

    function _liquidatePosition(
        bytes32 marketKey,
        address account,
        uint price,
        address liquidator
    ) internal {
        Position memory prevPosition = _stateViews().position(marketKey, account);

        // check can actually liquidate
        _revertIfError(!_canLiquidate(prevPosition, price), Status.CannotLiquidate);

        // get remaining margin for sending any leftover buffer to fee pool
        uint remMargin = _remainingMargin(prevPosition, price);

        // store the new position, don't touch the locked margin because it was locked
        // presumably for some other purpose by the orders-router (e.g. in next-price paying fees)
        _updateStoredPosition(marketKey, account, 0, prevPosition.lockedMargin, 0, price);

        // Issue the reward to the liquidator.
        uint liqFee = _liquidationFee(_notionalValue(prevPosition.size, price));
        _manager().issueSUSD(liquidator, liqFee);

        // Send any positive margin buffer to the fee pool
        if (remMargin > liqFee) {
            _manager().payFee(remMargin.sub(liqFee), bytes32(0));
        }

        emit PositionModified({
            marketKey: marketKey,
            id: prevPosition.id,
            account: account,
            margin: 0,
            size: 0,
            tradeSize: 0,
            price: price,
            fee: 0
        });
        emit PositionLiquidated({
            marketKey: marketKey,
            account: account,
            liquidator: liquidator,
            size: prevPosition.size,
            price: price,
            fee: liqFee
        });
    }

    /* ========== INTERNAL VIEWS ========== */

    function _exchangeCircuitBreaker() internal view returns (IExchangeCircuitBreaker) {
        return IExchangeCircuitBreaker(requireAndGetAddress(CONTRACT_EXCHANGECIRCUITBREAKER));
    }

    function _systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS));
    }

    function _manager() internal view returns (IPerpsManagerV2Internal) {
        return IPerpsManagerV2Internal(requireAndGetAddress(CONTRACT_PERPSMANAGERV2));
    }

    function _stateMutative() internal view returns (IPerpsStorageV2Internal) {
        return IPerpsStorageV2Internal(requireAndGetAddress(CONTRACT_PERPSTORAGEV2));
    }

    function _stateViews() internal view returns (IPerpsStorageV2External) {
        return IPerpsStorageV2External(requireAndGetAddress(CONTRACT_PERPSTORAGEV2));
    }

    /* ========== INTERNAL LOGIC VIEWS ========== */

    function _marketScalars(bytes32 marketKey) internal view returns (MarketScalars memory market) {
        market = _stateViews().marketScalars(marketKey);
        require(market.baseAsset != bytes32(0), "Market not initialised");
        return market;
    }

    /* ---------- Market Details ---------- */

    /*
     * The size of the skew relative to the size of the market skew scaler.
     * This value can be outside of [-1, 1] values.
     * Scaler used for skew is at skewScaleUSD to prevent extreme funding rates for small markets.
     */
    function _proportionalSkew(bytes32 marketKey, uint price) internal view returns (int) {
        int skew = _marketScalars(marketKey).marketSkew;
        if (skew == 0) {
            return 0;
        }
        // marketSize is in baseAsset units so we need to convert from USD units
        require(price > 0, "Price can't be zero");
        uint skewScaleBaseAsset = _skewScaleUSD(marketKey).divideDecimal(price);
        require(skewScaleBaseAsset != 0, "Skew scale is zero"); // don't divide by zero
        return skew.divideDecimal(int(skewScaleBaseAsset));
    }

    function _currentFundingRate(bytes32 marketKey, uint price) internal view returns (int) {
        int maxFundingRate = int(_maxFundingRate(marketKey));
        int propSkew = _proportionalSkew(marketKey, price);
        // Note the minus sign: funding flows in the opposite direction to the skew.
        return _min(_max(-_UNIT, -propSkew), _UNIT).multiplyDecimal(maxFundingRate);
    }

    function _unrecordedFunding(bytes32 marketKey, uint price) internal view returns (int funding) {
        uint lastTimestamp = _stateViews().lastFundingEntry(marketKey).timestamp;
        int elapsed = int(block.timestamp.sub(lastTimestamp));
        // The current funding rate, rescaled to a percentage per second.
        int currentFundingRatePerSecond = _currentFundingRate(marketKey, price) / 1 days;
        return currentFundingRatePerSecond.multiplyDecimal(int(price)).mul(elapsed);
    }

    /*
     * The funding is updated when recomputed. It is the sum of the
     * last entry and the unrecorded funding, so the last entry accumulates the running total over the market's lifetime.
     */
    function _nextFundingAmount(bytes32 marketKey, uint price) internal view returns (int funding) {
        return (_stateViews().lastFundingEntry(marketKey).funding).add(_unrecordedFunding(marketKey, price));
    }

    /*
     * The impact of a given position on the debt correction.
     */
    function _positionDebtCorrection(Position memory position) internal pure returns (int) {
        /**
        This method only returns the per position correction term for the debt calculation, and not it's
        the position full debt.
        This correction is part of tracking the total market to allow O(1) marketDebt calculation in _marketDebt().

        Explanation of the full market debt calculation from the SIP https://sips.synthetix.io/sips/sip-80/:

        The overall market debt is the sum of the remaining margin in all positions.
        The debt of a single position is the value withdrawn upon closing that position (+any fees paid):

        single-position-remaining-margin [note: q = position-size below]:
            = margin-deposit + profit-loss + accrued-funding
            = margin-deposit + q * (price - last-price) + q * funding-accrued-per-unit
            = margin-deposit + q * price - q * last-price + q * (funding - initial-funding)

        total-debt = sum ( single-position-remaining-margin ) when `sum` is over all the positions:
            = sum ( margin-deposit + q * price - q * last-price + q * (funding - initial-funding) )
            = sum( q * price ) + sum( q * funding ) + sum( margin-deposit - q * last-price - q * initial-funding )
            = sum( q ) * price + sum( q ) * funding + sum( margin-deposit - q * last-price - q * initial-funding )

        Because sum( q ) = skew, we continue: total-debt =
            = skew * price + skew * funding + sum( margin-deposit - q * ( last-price + initial-funding ) )
            = skew * (price + funding) + sum( margin-deposit - q * ( last-price + initial-funding ) )

        The last term: sum( margin-deposit - q * ( last-price + initial-funding ) ) being the position debt correction
            that is tracked with each position change using this method.

        The first term ( skew * (price + funding) ) and total debt calculation using current skew, price, and funding
        is calculated globally in _marketDebt().

        */
        int initialFunding = position.lastFundingEntry.funding;
        // both position margin and locked margin are counted as debt, since both can be withdrawn unless lost
        int marginDeposits = int(position.margin.add(position.lockedMargin));
        return marginDeposits.sub(position.size.multiplyDecimal(int(position.lastPrice).add(initialFunding)));
    }

    function _marketDebt(bytes32 marketKey, uint price) internal view returns (uint) {
        MarketScalars memory market = _marketScalars(marketKey);
        // short circuit and also convenient during setup
        if (market.marketSkew == 0 && market.entryDebtCorrection == 0) {
            // if these are 0, the resulting calculation is necessarily zero as well
            return 0;
        }
        // see comment explaining this calculation in _positionDebtCorrection()
        int priceWithFunding = int(price).add(_nextFundingAmount(marketKey, price));
        int totalDebt = market.marketSkew.multiplyDecimal(priceWithFunding).add(market.entryDebtCorrection);
        return uint(_max(totalDebt, 0));
    }

    /* ---------- Position Details ---------- */

    /*
     * Determines whether a change in a position's size would violate the max market value constraint.
     */
    function _orderSizeTooLarge(
        bytes32 marketKey,
        uint price,
        int oldSize,
        int newSize
    ) internal view returns (bool) {
        uint maxSizeUSD = _maxSingleSideValueUSD(marketKey);

        // Allow a bit of extra value in case of rounding errors.
        // Do not add if max size is 0 (closed market)
        if (maxSizeUSD > 0) {
            maxSizeUSD += 100 * uint(_UNIT); // 100 sUSD
        }

        uint maxSize = maxSizeUSD.divideDecimal(price);

        // Allow users to reduce an order no matter the market conditions.
        if (_sameSide(oldSize, newSize) && _abs(newSize) <= _abs(oldSize)) {
            return false;
        }

        // Either the user is flipping sides, or they are increasing an order on the same side they're already on;
        // we check that the side of the market their order is on would not break the limit.
        int newSkew = _marketScalars(marketKey).marketSkew.sub(oldSize).add(newSize);
        int newMarketSize = int(_marketScalars(marketKey).marketSize).sub(_signedAbs(oldSize)).add(_signedAbs(newSize));

        int newSideSize;
        if (0 < newSize) {
            // long case: marketSize + skew
            //            = (|longSize| + |shortSize|) + (longSize + shortSize)
            //            = 2 * longSize
            newSideSize = newMarketSize.add(newSkew);
        } else {
            // short case: marketSize - skew
            //            = (|longSize| + |shortSize|) - (longSize + shortSize)
            //            = 2 * -shortSize
            newSideSize = newMarketSize.sub(newSkew);
        }

        // newSideSize still includes an extra factor of 2 here, so we will divide by 2 in the actual condition
        if (maxSize < _abs(newSideSize.div(2))) {
            return true;
        }

        return false;
    }

    function _notionalValue(int positionSize, uint price) internal pure returns (int value) {
        return positionSize.multiplyDecimal(int(price));
    }

    function _profitLoss(Position memory position, uint price) internal pure returns (int pnl) {
        int priceShift = int(price).sub(int(position.lastPrice));
        return position.size.multiplyDecimal(priceShift);
    }

    function _accruedFunding(Position memory position, uint price) internal view returns (int funding) {
        if (position.size == 0) {
            return 0; // The position have no size
        }
        int startFunding = position.lastFundingEntry.funding;
        int net = _nextFundingAmount(position.marketKey, price).sub(startFunding);
        return position.size.multiplyDecimal(net);
    }

    /*
     * The initial margin of a position, plus any PnL and funding it has accrued. The resulting value may be negative.
     */
    function _marginPlusProfitFunding(Position memory position, uint price) internal view returns (int) {
        int funding = _accruedFunding(position, price);
        return int(position.margin).add(_profitLoss(position, price)).add(funding);
    }

    /*
     * The value in a position's margin after a deposit or withdrawal, accounting for funding and profit.
     * If the resulting margin would be negative or below the liquidation threshold, an appropriate error is returned.
     * If the result is not an error, callers of this function that use it to update a position's margin
     * must ensure that this is accompanied by a corresponding debt correction update, as per `_applyDebtCorrection`.
     */
    function _realizedMarginAfterDelta(
        Position memory position,
        uint price,
        int marginDelta,
        bool checkLeverage
    ) internal view returns (uint newMargin, Status statusCode) {
        int realizedMargin = _marginPlusProfitFunding(position, price);
        if (realizedMargin < 0) {
            return (0, Status.CanLiquidate);
        }

        int newMarginInt = realizedMargin.add(marginDelta);
        if (newMarginInt < 0) {
            return (0, Status.InsufficientMargin);
        }

        newMargin = uint(newMarginInt);

        int notional = _notionalValue(position.size, price);
        // position size is not 0 maybe check leverage and and liquidation margin
        if (notional != 0) {
            // minimum margin beyond which position can be liquidated
            if (newMargin <= _liquidationMargin(notional)) {
                return (newMargin, Status.CanLiquidate);
            }

            int curLeverage = _currentLeverage(notional, newMargin);
            // check leverage if check is needed (skipped for trade fee deltas, and checked after trade)
            if (checkLeverage && _abs(curLeverage) > _maxLeverage(position.marketKey)) {
                return (newMargin, Status.MaxLeverageExceeded);
            }
        }

        return (newMargin, Status.Ok);
    }

    function _remainingMargin(Position memory position, uint price) internal view returns (uint) {
        int remaining = _marginPlusProfitFunding(position, price);

        // If the margin went past zero, the position should have been liquidated - return zero remaining margin.
        return uint(_max(0, remaining));
    }

    /// assumes position was initilized (has valid marketKey)
    function _withdrawableMargin(Position memory position, uint price) internal view returns (uint) {
        if (position.margin == 0) {
            return 0; // there's no position
        }
        // Ugly solution to rounding safety: leave up to an extra tenth of a cent in the account/leverage
        // This should guarantee that the value returned here can always been withdrawn, but there may be
        // a little extra actually-accessible value left over, depending on the position size and margin.
        uint milli = uint(_UNIT / 1000);
        int maxLeverage = int(_maxLeverage(position.marketKey).sub(milli));
        uint inaccessible = _abs(_notionalValue(position.size, price).divideDecimal(maxLeverage));

        // If the user has a position open, we'll enforce a min initial margin requirement.
        if (0 < inaccessible) {
            uint minInitialMargin = _minInitialMargin();
            if (inaccessible < minInitialMargin) {
                inaccessible = minInitialMargin;
            }
            inaccessible = inaccessible.add(milli);
        }

        uint remaining = _remainingMargin(position, price);
        if (remaining <= inaccessible) {
            return 0;
        }

        return remaining.sub(inaccessible);
    }

    /**
     * The fee charged from the margin during liquidation. Fee is proportional to position size
     * but is at least the _minKeeperFee() of sUSD to prevent underincentivising
     * liquidations of small positions.
     * @param notionalValue value of position
     * @return lFee liquidation fee to be paid to liquidator in sUSD fixed point decimal units
     */
    function _liquidationFee(int notionalValue) internal view returns (uint lFee) {
        // size * price * fee-ratio
        uint proportionalFee = _abs(notionalValue).multiplyDecimal(_liquidationFeeRatio());
        uint minFee = _minKeeperFee();
        // max(proportionalFee, minFee) - to prevent not incentivising liquidations enough
        return proportionalFee > minFee ? proportionalFee : minFee; // not using _max() helper because it's for signed ints
    }

    /**
     * The minimal margin at which liquidation can happen. Is the sum of liquidationBuffer and liquidationFee
     * @param notionalValue USD value of size of position in fixed point decimal baseAsset units
     * @return lMargin liquidation margin to maintain in sUSD fixed point decimal units
     * @dev The liquidation margin contains a buffer that is proportional to the position
     * size. The buffer should prevent liquidation happenning at negative margin (due to next price being worse)
     * so that stakers would not leak value to liquidators through minting rewards that are not from the
     * account's margin.
     */
    function _liquidationMargin(int notionalValue) internal view returns (uint lMargin) {
        uint liquidationBuffer = _abs(notionalValue).multiplyDecimal(_liquidationBufferRatio());
        return liquidationBuffer.add(_liquidationFee(notionalValue));
    }

    function _canLiquidate(Position memory position, uint price) internal view returns (bool) {
        // No liquidating empty positions.
        if (position.size == 0) {
            return false;
        }

        return _remainingMargin(position, price) <= _liquidationMargin(_notionalValue(position.size, price));
    }

    /// Equivalent to the position's notional value divided by its remaining margin.
    function _currentLeverage(int notionalValue, uint remainingMargin_) internal pure returns (int leverage) {
        // No position is open, or it is ready to be liquidated; leverage goes to nil
        if (remainingMargin_ == 0) {
            return 0;
        }

        return notionalValue.divideDecimal(int(remainingMargin_));
    }

    function _orderFee(TradeParams memory params) internal pure returns (uint fee) {
        // usd value of the difference in position
        int notionalDiff = params.sizeDelta.multiplyDecimal(int(params.price));
        return _abs(notionalDiff.multiplyDecimal(int(params.feeRate)));
    }

    function _postTradeDetails(Position memory oldPos, TradeParams memory params)
        internal
        view
        returns (
            uint newMargin,
            int newSize,
            uint fee,
            Status status
        )
    {
        bytes32 marketKey = oldPos.marketKey;
        uint oldMargin = oldPos.margin;
        int oldSize = oldPos.size;

        // Reverts if the user is trying to submit a size-zero order.
        if (params.sizeDelta == 0) {
            return (oldMargin, oldSize, 0, Status.NilOrder);
        }

        // The order is not submitted if the user's existing position needs to be liquidated.
        if (_canLiquidate(oldPos, params.price)) {
            return (oldMargin, oldSize, 0, Status.CanLiquidate);
        }

        newSize = oldPos.size.add(params.sizeDelta);

        // calculate the total fee for exchange
        fee = _orderFee(params);

        // Deduct the fee
        // It is an error if the realised margin minus the fee is negative or subject to liquidation.
        // min margin is only checked if position is increasing
        // leverage check is skipped because it's checked later for the position after the trade
        (newMargin, status) = _realizedMarginAfterDelta(oldPos, params.price, -int(fee), false);
        if (_isError(status)) {
            return (oldMargin, oldSize, 0, status);
        }

        // check that new position margin is above liquidation margin
        // (above, in _realizedMarginAfterDelta() we checked the old position, here we check the new one)
        // Liquidation margin is considered without a fee, because it wouldn't make sense to allow
        // a trade that will make the position liquidatable.
        if (newMargin <= _liquidationMargin(_notionalValue(newSize, params.price))) {
            return (oldMargin, oldSize, 0, Status.CanLiquidate);
        }

        // stack too deep
        {
            // consider leverage limit and min initial margin limit with the paid fees (for easier UX)
            uint marginBeforeFee = newMargin.add(fee);

            // Check that the maximum leverage is not exceeded when considering new margin including the paid fee.
            // The paid fee is considered for the benefit of UX of allowed max leverage, otherwise, the actual
            // max leverage is always below the max leverage parameter since the fee paid for a trade reduces the margin.
            // We'll allow a little extra headroom for rounding errors.
            int leverage = newSize.multiplyDecimal(int(params.price)).divideDecimal(int(marginBeforeFee));
            if (_maxLeverage(marketKey).add(uint(_UNIT) / 100) < _abs(leverage)) {
                return (oldMargin, oldSize, 0, Status.MaxLeverageExceeded);
            }

            // always allow to decrease a position, otherwise a margin of minInitialMargin can never
            // decrease a position as the price goes against them.
            // we also add the paid out fee for the minInitialMargin because otherwise minInitialMargin
            // is never the actual minMargin, because the first trade will always deduct
            // a fee (so the margin that otherwise would need to be transferred would have to include the future
            // fee as well, making the UX and definition of min-margin confusing).
            bool positionDecreasing = _sameSide(oldPos.size, newSize) && _abs(newSize) < _abs(oldPos.size);

            // check that min margin is kept if position is non-zero and is not decreasing
            bool checkMinMargin = newSize != 0 && !positionDecreasing;
            if (checkMinMargin && marginBeforeFee < _minInitialMargin()) {
                return (oldMargin, oldSize, 0, Status.InsufficientMargin);
            }
        }

        // Check that the order isn't too large for the market.
        if (_orderSizeTooLarge(marketKey, params.price, oldPos.size, newSize)) {
            return (oldMargin, oldSize, 0, Status.MaxMarketSizeExceeded);
        }

        // only here return the new size and new margin
        return (newMargin, newSize, fee, Status.Ok);
    }

    /* ---------- Utilities ---------- */

    // helper method to translate the external struct to internal struct in a consistent way
    function _executionOptionsToTradeParams(
        int sizeDelta,
        uint currentPrice,
        ExecutionOptions memory options
    ) internal pure returns (TradeParams memory) {
        return
            TradeParams({
                sizeDelta: sizeDelta,
                price: _addDelta(currentPrice, options.priceDelta),
                feeRate: options.feeRate,
                trackingCode: options.trackingCode
            });
    }

    /// adds an int delta to a uint value, reverts if overflows / underflow
    function _addDelta(uint value, int delta) internal pure returns (uint) {
        // adjust price according to the input
        return delta > 0 ? value.add(uint(delta)) : value.sub(uint(-delta));
    }

    /*
     * Absolute value of the input, returned as a signed number.
     */
    function _signedAbs(int x) internal pure returns (int) {
        return x < 0 ? -x : x;
    }

    /*
     * Absolute value of the input, returned as an unsigned number.
     */
    function _abs(int x) internal pure returns (uint) {
        return uint(_signedAbs(x));
    }

    function _max(int x, int y) internal pure returns (int) {
        return x < y ? y : x;
    }

    function _min(int x, int y) internal pure returns (int) {
        return x < y ? x : y;
    }

    // True if and only if two positions a and b are on the same side of the market;
    // that is, if they have the same sign, or either of them is zero.
    function _sameSide(int a, int b) internal pure returns (bool) {
        return (a >= 0) == (b >= 0);
    }

    /*
     * True if and only if the given status indicates an error.
     */
    function _isError(Status status) internal pure returns (bool) {
        return status != Status.Ok;
    }

    /*
     * Revert with an appropriate message if the first argument is true.
     */
    function _revertIfError(bool isError, Status status) internal view {
        if (isError) {
            revert(_errorMessages[uint8(status)]);
        }
    }

    /*
     * Revert with an appropriate message if the input is an error.
     */
    function _revertIfError(Status status) internal view {
        if (_isError(status)) {
            revert(_errorMessages[uint8(status)]);
        }
    }
}
