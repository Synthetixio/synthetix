pragma solidity ^0.5.16;

// Inheritance
import "./PerpsV2SettingsMixin.sol";
import "./interfaces/IPerpsV2Market.sol";

// Libraries
import "openzeppelin-solidity-2.3.0/contracts/math/SafeMath.sol";
import "./SignedSafeMath.sol";
import "./SignedSafeDecimalMath.sol";
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/IExchangeCircuitBreaker.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/IExchanger.sol";
import "./interfaces/ISystemStatus.sol";
import "./interfaces/IERC20.sol";

/*
 *
 */
interface IFuturesMarketManagerInternal {
    function issueSUSD(address account, uint amount) external;

    function burnSUSD(address account, uint amount) external returns (uint postReclamationAmount);

    function payFee(uint amount, bytes32 trackingCode) external;

    function approvedRouter(
        address router,
        bytes32 marketKey,
        address account
    ) external returns (bool approved);
}

contract PerpsV2EngineBase is PerpsV2SettingsMixin, IPerpsV2BaseTypes {
    /* ========== LIBRARIES ========== */

    using SafeMath for uint;
    using SignedSafeMath for int;
    using SignedSafeDecimalMath for int;
    using SafeDecimalMath for uint;

    /* ========== PUBLIC STATE ========== */

    mapping(bytes32 => Market) public markets;

    mapping(uint8 => string) internal _errorMessages;

    bytes32 public constant CONTRACT_NAME = "PerpsV2Engine";

    /* ========== INTERNAL STATE ========== */

    // This is the same unit as used inside `SignedSafeDecimalMath`.
    int private constant _UNIT = int(10**uint(18));

    //slither-disable-next-line naming-convention
    bytes32 internal constant sUSD = "sUSD";

    // Address Resolver Configuration
    bytes32 internal constant CONTRACT_CIRCUIT_BREAKER = "ExchangeCircuitBreaker";
    bytes32 internal constant CONTRACT_EXCHANGER = "Exchanger";
    bytes32 internal constant CONTRACT_FUTURESMARKETMANAGER = "FuturesMarketManager";
    bytes32 internal constant CONTRACT_PERPSV2SETTINGS = "PerpsV2Settings";
    bytes32 internal constant CONTRACT_SYSTEMSTATUS = "SystemStatus";

    /* ========== EVENTS ========== */

    event MarginModified(bytes32 indexed marketKey, address indexed account, int marginDelta);

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

    event FundingRecomputed(bytes32 indexed marketKey, int funding, uint timestamp);

    event Tracking(bytes32 indexed trackingCode, bytes32 marketKey, address account, int sizeDelta, uint fee);

    /* ========== MODIFIERS ========== */

    modifier onlyRouters(bytes32 marketKey, address account) {
        bool approved = _manager().approvedRouter(msg.sender, marketKey, account);
        _revertIfError(!approved, Status.NotPermitted);
        _;
    }

    /* ========== CONSTRUCTOR ========== */

    constructor(address _resolver) public PerpsV2SettingsMixin(_resolver) {
        // Set up the mapping between error codes and their revert messages.
        _errorMessages[uint8(Status.InvalidPrice)] = "Invalid price";
        _errorMessages[uint8(Status.PriceOutOfBounds)] = "Price out of acceptable range";
        _errorMessages[uint8(Status.CanLiquidate)] = "Position can be liquidated";
        _errorMessages[uint8(Status.CannotLiquidate)] = "Position cannot be liquidated";
        _errorMessages[uint8(Status.MaxMarketSizeExceeded)] = "Max market size exceeded";
        _errorMessages[uint8(Status.MaxLeverageExceeded)] = "Max leverage exceeded";
        _errorMessages[uint8(Status.InsufficientMargin)] = "Insufficient margin";
        _errorMessages[uint8(Status.NotPermitted)] = "Not permitted for this address";
        _errorMessages[uint8(Status.NilOrder)] = "Cannot submit empty order";
        _errorMessages[uint8(Status.NoPositionOpen)] = "No position open";
        _errorMessages[uint8(Status.PriceTooVolatile)] = "Price too volatile";
    }

    /* ========== EXTERNAL VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = PerpsV2SettingsMixin.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](5);
        newAddresses[0] = CONTRACT_EXCHANGER;
        newAddresses[1] = CONTRACT_CIRCUIT_BREAKER;
        newAddresses[2] = CONTRACT_FUTURESMARKETMANAGER;
        newAddresses[3] = CONTRACT_PERPSV2SETTINGS;
        newAddresses[4] = CONTRACT_SYSTEMSTATUS;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    /*
     * The current base price from the oracle, and whether that price was invalid. Zero prices count as invalid.
     * Public because used both externally and internally
     */
    function assetPrice(bytes32 marketKey) public view returns (uint price, bool invalid) {
        bytes32 baseAsset = _loadMarket(marketKey).baseAsset;
        (price, invalid) = _exchangeCircuitBreaker().rateWithInvalid(baseAsset);
        return (price, invalid);
    }

    /* ========== EXTERNAL MUTATIVE METHODS ========== */

    /**
     * Pushes a new entry to the funding sequence at the current price and funding rate.
     * @dev Admin only method accessible to FuturesMarketSettings. This is admin only because:
     * - When system parameters change, funding should be recomputed, but system may be paused
     *   during that time for any reason, so this method needs to work even if system is paused.
     *   But in that case, it shouldn't be accessible to external accounts.
     */
    function recomputeFunding(bytes32 marketKey) external {
        // only FuturesMarketSettings is allowed to use this method
        _revertIfError(msg.sender != _settings(), Status.NotPermitted);
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
        int marginDelta
    ) external onlyRouters(marketKey, account) {
        // allow topping up margin if this specific market is paused.
        // will still revert on all other checks (system, exchange, futures in general)
        bool allowMarketPaused = marginDelta > 0;
        uint price = _assetPriceRequireSystemChecks(marketKey, allowMarketPaused);
        _recomputeFunding(marketKey, price);
        _transferMargin(marketKey, account, marginDelta, price);
    }

    function modifyMarginWithoutTransfer(
        bytes32 marketKey,
        address account,
        int marginDelta
    ) external onlyRouters(marketKey, account) {
        uint price = _assetPriceRequireSystemChecks(marketKey);
        _recomputeFunding(marketKey, price);
        _modifyMargin(marketKey, account, marginDelta, price);
    }

    function trade(
        bytes32 marketKey,
        address account,
        int sizeDelta,
        uint feeRate,
        bytes32 trackingCode
    ) external onlyRouters(marketKey, account) {
        uint price = _assetPriceRequireSystemChecks(marketKey);
        _recomputeFunding(marketKey, price);
        _trade(
            marketKey,
            account,
            TradeParams({sizeDelta: sizeDelta, price: price, feeRate: feeRate, trackingCode: trackingCode})
        );
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

    /* ========== EXTERNAL STORAGE MUTATIVE (to be refactored) ========== */

    function initMarket(bytes32 marketKey, bytes32 baseAsset) external {
        // only manager can call
        _revertIfError(msg.sender != address(_manager()), Status.NotPermitted);
        // validate input
        require(marketKey != bytes32(0), "market key cannot be empty");
        require(baseAsset != bytes32(0), "asset key cannot be empty");
        // load market
        Market storage market = markets[marketKey];
        // check is not initialized already
        require(market.baseAsset == bytes32(0), "already initialized");
        // set asset
        market.baseAsset = baseAsset;
        // initialise the funding sequence with 0 initially accrued, so that the first usable funding index is 1.
        market.fundingSequence.push(FundingEntry(0, block.timestamp));
    }

    /* ========== INTERNAL STORAGE MUTATIVE (to be refactored) ========== */

    function _loadOrInitPosition(bytes32 marketKey, address account) internal returns (Position memory position) {
        Market storage market = _loadMarket(marketKey);
        position = market.positions[account];

        // if position has no id, it wasn't initialized, initialize it:
        if (position.id == 0) {
            // set marketKey
            position.marketKey = marketKey;
            // id
            market.lastPositionId++; // increment position id
            uint id = market.lastPositionId;
            position.id = id;
            // update owner mapping
            market.positionIdOwner[id] = account;
        }
    }

    function _pushFundingEntry(bytes32 marketKey, FundingEntry memory newEntry) internal {
        _loadMarket(marketKey).fundingSequence.push(newEntry);
    }

    function _storePosition(
        bytes32 marketKey,
        address account,
        uint newMargin,
        int newSize,
        uint price
    ) internal {
        // ensure it's initialized
        _loadOrInitPosition(marketKey, account);
        // load the storage
        Position storage position = _loadMarket(marketKey).positions[account];
        // update
        position.margin = newMargin;
        position.size = newSize;
        position.lastPrice = price;
        position.lastFundingEntry = _lastFundingEntry(marketKey);
    }

    function _storeMarketAggregates(bytes32 marketKey, MarketAggregates memory marketAggs) internal view {
        Market storage market = _loadMarket(marketKey);
        market.marketSize = marketAggs.marketSize;
        market.marketSkew = marketAggs.marketSkew;
        market.entryDebtCorrection = marketAggs.entryDebtCorrection;
    }

    /* ========== INTERNAL TYPES ========== */

    // internal convenience struct for passing params between position modification helper functions
    struct TradeParams {
        int sizeDelta;
        uint price;
        uint feeRate;
        bytes32 trackingCode; // tracking code for volume source fee sharing
    }

    // internal convenience struct for stored market aggregate values
    struct MarketAggregates {
        uint marketSize;
        int marketSkew;
        int entryDebtCorrection;
    }

    /* ========== INTERNAL MUTATIVE LOGIC METHODS ========== */

    function _updateStorage(
        bytes32 marketKey,
        address account,
        uint newMargin,
        int newSize,
        uint price
    ) internal {
        // get previous values
        Position memory oldPosition = _loadOrInitPosition(marketKey, account);
        // update position
        _storePosition(marketKey, account, newMargin, newSize, price);
        // load new position
        Position memory newPosition = _loadOrInitPosition(marketKey, account);

        // update aggregates
        MarketAggregates memory marketAggs = _loadMarketAggregates(marketKey);

        // apply the resulting debt correction
        int delta = _positionDebtCorrection(newPosition).sub(_positionDebtCorrection(oldPosition));
        marketAggs.entryDebtCorrection = marketAggs.entryDebtCorrection.add(delta);

        // update market size and skew
        int oldSize = oldPosition.size;
        int newSize = newPosition.size;
        if (oldSize != newSize) {
            // Update the aggregated market size and skew with the new order size
            marketAggs.marketSkew = marketAggs.marketSkew.add(newSize).sub(oldSize);
            marketAggs.marketSize = marketAggs.marketSize.add(_abs(newSize)).sub(_abs(oldSize));
        }

        _storeMarketAggregates(marketKey, marketAggs);
    }

    /* ---------- Market Operations ---------- */

    /**
     * The current base price, reverting if it is invalid, or if system or synth is suspended.
     * This is mutative because the circuit breaker stores the last price on every invocation.
     * @param allowMarketPaused if true, checks everything except the specific market, if false
     *  checks only top level checks (system, exchange, futures)
     */
    function _assetPriceRequireSystemChecks(bytes32 marketKey, bool allowMarketPaused) internal returns (uint) {
        // check that market isn't suspended, revert with appropriate message
        if (allowMarketPaused) {
            // this will check system activbe, exchange active, futures active
            _systemStatus().requireFuturesActive();
        } else {
            // this will check all of the above + that specific market is active
            _systemStatus().requireFuturesMarketActive(marketKey); // asset and market may be different
        }
        // TODO: refactor the following when circuit breaker is updated.
        // The reason both view and mutative are used is because the breaker validates that the
        // synth exists, and for perps - the there is no synth, so in case of attempting to suspend
        // the suspension fails (reverts due to "No such synth")

        // check the view first and revert if price is invalid or out deviation range
        bytes32 baseAsset = _loadMarket(marketKey).baseAsset;
        (uint price, bool invalid) = _exchangeCircuitBreaker().rateWithInvalid(baseAsset);
        _revertIfError(invalid, Status.InvalidPrice);
        // note: rateWithBreakCircuit (mutative) is used here in addition to rateWithInvalid (view).
        //  This is despite reverting immediately after if circuit is broken, which may seem silly.
        //  This is in order to persist last-rate in exchangeCircuitBreaker in the happy case
        //  because last-rate is what used for measuring the deviation for subsequent trades.
        // This also means that the circuit will not be broken in unhappy case (synth suspended)
        // because this method will revert above. The reason it has to revert is that perps
        // don't support no-op actions.
        _exchangeCircuitBreaker().rateWithBreakCircuit(baseAsset); // persist rate for next checks

        return price;
    }

    // default of allowMarketPaused is false, allow calling without this flag
    function _assetPriceRequireSystemChecks(bytes32 marketKey) internal returns (uint) {
        return _assetPriceRequireSystemChecks(marketKey, false);
    }

    function _recomputeFunding(bytes32 marketKey, uint price) internal {
        FundingEntry memory newEntry = FundingEntry(_nextFundingAmount(marketKey, price), block.timestamp);
        _pushFundingEntry(marketKey, newEntry);
        emit FundingRecomputed(marketKey, newEntry.funding, newEntry.timestamp);
    }

    function _transferMargin(
        bytes32 marketKey,
        address account,
        int marginDelta,
        uint price
    ) internal {
        // Transfer no tokens if marginDelta is 0
        uint absDelta = _abs(marginDelta);

        // if trying to add margin, handle reclamantion
        if (marginDelta > 0) {
            // Ensure we handle reclamation when burning tokens.
            uint postReclamationAmount = _manager().burnSUSD(account, absDelta);
            if (postReclamationAmount != absDelta) {
                // If balance was insufficient, the actual delta will be smaller
                marginDelta = int(postReclamationAmount);
            }
        }

        // now check updated delta
        if (marginDelta < 0) {
            // A negative margin delta corresponds to a withdrawal, which will be minted into
            // their sUSD balance, and debited from their margin account.
            _manager().issueSUSD(account, absDelta);
        } else {
            // Zero delta is a no-op
            return;
        }

        // now that account's sUSD was handled, modify the margin of the position
        _modifyMargin(marketKey, account, marginDelta, price);
    }

    function _modifyMargin(
        bytes32 marketKey,
        address account,
        int marginDelta,
        uint price
    ) internal {
        Position memory oldPosition = _loadOrInitPosition(marketKey, account);

        bytes32 marketKey = oldPosition.marketKey;

        // Determine new margin, ensuring that the result is positive.
        (uint margin, Status status) = _realizedMarginAfterDelta(oldPosition, price, marginDelta);

        // check result
        _revertIfError(status);

        // The user can decrease their margin with an existing position as long as:
        //     * they have sufficient margin to do so
        //     * the resulting margin would not be lower than the liquidation margin or min initial margin
        //     * the resulting leverage is lower than the maximum leverage
        if (marginDelta < 0 && oldPosition.size != 0) {
            int notional = _notionalValue(oldPosition.size, price);
            uint liqMargin = _liquidationMargin(notional);
            uint curLeverage = _abs(_currentLeverage(notional, margin));
            _revertIfError(
                (margin < _minInitialMargin()) || (margin <= liqMargin) || (curLeverage > _maxLeverage(marketKey)),
                Status.InsufficientMargin
            );
        }

        _updateStorage(marketKey, account, margin, oldPosition.size, price);

        emit MarginModified(marketKey, account, marginDelta);

        emit PositionModified({
            marketKey: marketKey,
            id: oldPosition.id,
            account: account,
            margin: margin,
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
        Position memory oldPosition = _loadOrInitPosition(marketKey, account);

        // Compute the new position after performing the trade
        (uint newMargin, int newSize, uint fee, Status status) = _postTradeDetails(oldPosition, params);

        // check result
        _revertIfError(status);

        // store change
        _updateStorage(marketKey, account, newMargin, newSize, params.price);

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
        Position memory prevPosition = _loadOrInitPosition(marketKey, account);

        // check can actually liquidate
        _revertIfError(!_canLiquidate(prevPosition, price), Status.CannotLiquidate);

        // get remaining margin for sending any leftover buffer to fee pool
        uint remMargin = _remainingMargin(prevPosition, price);

        // store the new position
        _updateStorage(marketKey, account, 0, 0, price);

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
        return IExchangeCircuitBreaker(requireAndGetAddress(CONTRACT_CIRCUIT_BREAKER));
    }

    function _exchanger() internal view returns (IExchanger) {
        return IExchanger(requireAndGetAddress(CONTRACT_EXCHANGER));
    }

    function _systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS));
    }

    function _manager() internal view returns (IFuturesMarketManagerInternal) {
        return IFuturesMarketManagerInternal(requireAndGetAddress(CONTRACT_FUTURESMARKETMANAGER));
    }

    function _settings() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_PERPSV2SETTINGS);
    }

    /* ========== STORAGE VIEWS (to be refactored) ========== */

    function _loadMarket(bytes32 marketKey) internal view returns (Market storage market) {
        market = markets[marketKey];
        require(market.baseAsset != bytes32(0), "market not initialised");
        return market;
    }

    function _lastFundingEntry(bytes32 marketKey) internal view returns (FundingEntry memory entry) {
        FundingEntry[] storage fundingSequence = _loadMarket(marketKey).fundingSequence;
        return fundingSequence[fundingSequence.length.sub(1)];
    }

    function _loadMarketAggregates(bytes32 marketKey) internal view returns (MarketAggregates memory) {
        Market storage market = _loadMarket(marketKey);
        return
            MarketAggregates({
                marketSize: market.marketSize,
                marketSkew: market.marketSkew,
                entryDebtCorrection: market.entryDebtCorrection
            });
    }

    /* ========== INTERNAL LOGIC VIEWS ========== */

    /* ---------- Market Details ---------- */

    /*
     * The size of the skew relative to the size of the market skew scaler.
     * This value can be outside of [-1, 1] values.
     * Scaler used for skew is at skewScaleUSD to prevent extreme funding rates for small markets.
     */
    function _proportionalSkew(bytes32 marketKey, uint price) internal view returns (int) {
        // marketSize is in baseAsset units so we need to convert from USD units
        require(price > 0, "price can't be zero");
        uint skewScaleBaseAsset = _skewScaleUSD(marketKey).divideDecimal(price);
        require(skewScaleBaseAsset != 0, "skewScale is zero"); // don't divide by zero
        return _loadMarket(marketKey).marketSkew.divideDecimal(int(skewScaleBaseAsset));
    }

    function _currentFundingRate(bytes32 marketKey, uint price) internal view returns (int) {
        int maxFundingRate = int(_maxFundingRate(marketKey));
        int propSkew = _proportionalSkew(marketKey, price);
        // Note the minus sign: funding flows in the opposite direction to the skew.
        return _min(_max(-_UNIT, -propSkew), _UNIT).multiplyDecimal(maxFundingRate);
    }

    function _unrecordedFunding(bytes32 marketKey, uint price) internal view returns (int funding) {
        uint lastTimestamp = _lastFundingEntry(marketKey).timestamp;
        int elapsed = int(block.timestamp.sub(lastTimestamp));
        // The current funding rate, rescaled to a percentage per second.
        int currentFundingRatePerSecond = _currentFundingRate(marketKey, price) / 1 days;
        return currentFundingRatePerSecond.multiplyDecimal(int(price)).mul(elapsed);
    }

    /*
     * The new entry in the funding sequence, appended when funding is recomputed. It is the sum of the
     * last entry and the unrecorded funding, so the sequence accumulates running total over the market's lifetime.
     */
    function _nextFundingAmount(bytes32 marketKey, uint price) internal view returns (int funding) {
        return (_lastFundingEntry(marketKey).funding).add(_unrecordedFunding(marketKey, price));
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
        int initialFunding = position.lastFundingEntry.funding;
        return int(position.margin).sub(position.size.multiplyDecimal(int(position.lastPrice).add(initialFunding)));
    }

    function _marketDebt(bytes32 marketKey, uint price) internal view returns (uint) {
        MarketAggregates memory marketAggs = _loadMarketAggregates(marketKey);
        // short circuit and also convenient during setup
        if (marketAggs.marketSkew == 0 && marketAggs.entryDebtCorrection == 0) {
            // if these are 0, the resulting calculation is necessarily zero as well
            return 0;
        }
        // see comment explaining this calculation in _positionDebtCorrection()
        int priceWithFunding = int(price).add(_nextFundingAmount(marketKey, price));
        int totalDebt = marketAggs.marketSkew.multiplyDecimal(priceWithFunding).add(marketAggs.entryDebtCorrection);
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
        // Allow a bit of extra value in case of rounding errors.
        uint roundingBuffer = 100 * uint(_UNIT); // 100 sUSD
        uint maxSize = _maxSingleSideValueUSD(marketKey).add(roundingBuffer).divideDecimal(price);

        // Allow users to reduce an order no matter the market conditions.
        if (_sameSide(oldSize, newSize) && _abs(newSize) <= _abs(oldSize)) {
            return false;
        }

        // Either the user is flipping sides, or they are increasing an order on the same side they're already on;
        // we check that the side of the market their order is on would not break the limit.
        int newSkew = _loadMarket(marketKey).marketSkew.sub(oldSize).add(newSize);
        int newMarketSize = int(_loadMarket(marketKey).marketSize).sub(_signedAbs(oldSize)).add(_signedAbs(newSize));

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
        if (position.id == 0) {
            return 0; // The position does not exist -- no funding.
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
        int marginDelta
    ) internal view returns (uint margin, Status statusCode) {
        int newMargin = _marginPlusProfitFunding(position, price).add(marginDelta);
        if (newMargin < 0) {
            return (0, Status.InsufficientMargin);
        }

        uint uMargin = uint(newMargin);
        // minimum margin beyond which position can be liquidated
        uint lMargin = _liquidationMargin(_notionalValue(position.size, price));
        if (position.size != 0 && uMargin <= lMargin) {
            return (uMargin, Status.CanLiquidate);
        }

        return (uMargin, Status.Ok);
    }

    function _remainingMargin(Position memory position, uint price) internal view returns (uint) {
        int remaining = _marginPlusProfitFunding(position, price);

        // If the margin went past zero, the position should have been liquidated - return zero remaining margin.
        return uint(_max(0, remaining));
    }

    function _accessibleMargin(Position memory position, uint price) internal view returns (uint) {
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
     * @param positionSize size of position in fixed point decimal baseAsset units
     * @param price price of single baseAsset unit in sUSD fixed point decimal units
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

    function _currentLeverage(int notionalValue, uint remainingMargin_) internal pure returns (int leverage) {
        // No position is open, or it is ready to be liquidated; leverage goes to nil
        if (remainingMargin_ == 0) {
            return 0;
        }

        return notionalValue.divideDecimal(int(remainingMargin_));
    }

    function _orderFee(TradeParams memory params, uint dynamicFeeRate) internal pure returns (uint fee) {
        // usd value of the difference in position
        int notionalDiff = params.sizeDelta.multiplyDecimal(int(params.price));

        uint feeRate = params.feeRate.add(dynamicFeeRate);
        return _abs(notionalDiff.multiplyDecimal(int(feeRate)));
    }

    /// Uses the exchanger to get the dynamic fee (SIP-184) for trading from sUSD to baseAsset
    /// this assumes dynamic fee is symmetric in direction of trade.
    /// @dev this is a pretty expensive action in terms of execution gas as it queries a lot
    ///   of past rates from oracle. Shoudn't be much of an issue on a rollup though.
    function _dynamicFeeRate(bytes32 marketKey) internal view returns (uint feeRate, bool tooVolatile) {
        return _exchanger().dynamicFeeRateForExchange(sUSD, _loadMarket(marketKey).baseAsset);
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

        // get the dynamic fee rate SIP-184
        (uint dynamicFeeRate, bool tooVolatile) = _dynamicFeeRate(marketKey);
        if (tooVolatile) {
            return (oldMargin, oldSize, 0, Status.PriceTooVolatile);
        }

        // calculate the total fee for exchange
        fee = _orderFee(params, dynamicFeeRate);

        // Deduct the fee.
        // It is an error if the realised margin minus the fee is negative or subject to liquidation.
        (newMargin, status) = _realizedMarginAfterDelta(oldPos, params.price, -int(fee));
        if (_isError(status)) {
            return (oldMargin, oldSize, 0, status);
        }

        newSize = oldPos.size.add(params.sizeDelta);

        // always allow to decrease a position, otherwise a margin of minInitialMargin can never
        // decrease a position as the price goes against them.
        // we also add the paid out fee for the minInitialMargin because otherwise minInitialMargin
        // is never the actual minMargin, because the first trade will always deduct
        // a fee (so the margin that otherwise would need to be transferred would have to include the future
        // fee as well, making the UX and definition of min-margin confusing).
        bool positionDecreasing = _sameSide(oldPos.size, newSize) && _abs(newSize) < _abs(oldPos.size);
        if (!positionDecreasing) {
            // minMargin + fee <= margin is equivalent to minMargin <= margin - fee
            // except that we get a nicer error message if fee > margin, rather than arithmetic overflow.
            if (newMargin.add(fee) < _minInitialMargin()) {
                return (oldMargin, oldSize, 0, Status.InsufficientMargin);
            }
        }

        // check that new position margin is above liquidation margin
        // (above, in _realizedMarginAfterDelta() we checked the old position, here we check the new one)
        // Liquidation margin is considered without a fee, because it wouldn't make sense to allow
        // a trade that will make the position liquidatable.
        if (newMargin <= _liquidationMargin(_notionalValue(newSize, params.price))) {
            return (oldMargin, oldSize, 0, Status.CanLiquidate);
        }

        // Check that the maximum leverage is not exceeded when considering new margin including the paid fee.
        // The paid fee is considered for the benefit of UX of allowed max leverage, otherwise, the actual
        // max leverage is always below the max leverage parameter since the fee paid for a trade reduces the margin.
        // We'll allow a little extra headroom for rounding errors.
        {
            // stack too deep
            int leverage = newSize.multiplyDecimal(int(params.price)).divideDecimal(int(newMargin.add(fee)));
            if (_maxLeverage(marketKey).add(uint(_UNIT) / 100) < _abs(leverage)) {
                return (oldMargin, oldSize, 0, Status.MaxLeverageExceeded);
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
