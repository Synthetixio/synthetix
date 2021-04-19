pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./Proxyable.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/IFuturesMarket.sol";

// Libraries
import "openzeppelin-solidity-2.3.0/contracts/math/SafeMath.sol";
import "./SignedSafeMath.sol";
import "./SignedSafeDecimalMath.sol";

// Internal references
import "./interfaces/IExchangeRates.sol";
import "./interfaces/IFeePool.sol";
import "./interfaces/IERC20.sol";

import "@nomiclabs/buidler/console.sol";


// Remaining Functionality
//     Parameters into struct
//     Ensure total system debt is being computed properly.
//     Remove pending in favour of orderId being nonzero
//     Merge in develop
//     Consider not exposing signs of short vs long positions

// TODO: Entry margin sum inaccurate in the following case:
//       t1: + 1000x5 @ 100
//       t2: + -600x7 @ 120
//       t1: - 1000x5 @ 110
//       t2: - -600x7 @ 100

interface IFuturesMarketManagerInternal {
    function issueSUSD(address account, uint amount) external;

    function burnSUSD(address account, uint amount) external;
}


// https://docs.synthetix.io/contracts/source/contracts/futuresmarket
contract FuturesMarket is Owned, Proxyable, MixinResolver, MixinSystemSettings, IFuturesMarket {
    /* ========== LIBRARIES ========== */

    using SafeMath for uint;
    using SignedSafeMath for int;
    using SignedSafeDecimalMath for int;

    int private constant _UNIT = int(10**uint(18));

    /* ========== TYPES ========== */

    // TODO: Move these into interface

    enum Side {Long, Short}

    struct Order {
        bool pending;
        uint id;
        int margin;
        uint leverage;
        uint fee;
        uint roundId;
    }

    // If margin/size are positive, the position is long; if negative then it is short.
    struct Position {
        int margin;
        int size;
        uint lastPrice;
        uint fundingIndex;
    }

    // TODO: Convert funding rate from daily to per-second
    struct Parameters {
        uint exchangeFee;
        uint maxLeverage;
        uint maxMarketDebt;
        uint minInitialMargin;
        uint maxFundingRate;
        uint maxFundingRateSkew;
        uint maxFundingRateDelta;
    }

    /* ========== STATE VARIABLES ========== */

    bytes32 public baseAsset;
    Parameters public parameters;

    uint public marketSize;
    int public marketSkew; // When positive, longs outweigh shorts. When negative, shorts outweigh longs.
    int public marginSumMinusNotionalSkew;
    uint public pendingOrderValue;

    uint internal _nextOrderId = 1; // Zero reflects an order that does not exist

    mapping(address => Order) public orders;
    mapping(address => Position) public positions;

    uint public fundingLastRecomputed;
    int[] public fundingSequence;

    /* ---------- Address Resolver Configuration ---------- */

    bytes32 internal constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 internal constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 internal constant CONTRACT_SYNTHSUSD = "SynthsUSD";
    bytes32 internal constant CONTRACT_FEEPOOL = "FeePool";
    bytes32 internal constant CONTRACT_FUTURESMARKETMANAGER = "FuturesMarketManager";

    bytes32[24] internal _addressesToCache = [
        CONTRACT_SYSTEMSTATUS,
        CONTRACT_EXRATES,
        CONTRACT_SYNTHSUSD,
        CONTRACT_FEEPOOL,
        CONTRACT_FUTURESMARKETMANAGER
    ];

    /* ---------- Parameter Names ---------- */

    bytes32 internal constant PARAMETER_EXCHANGEFEE = "exchangeFee";
    bytes32 internal constant PARAMETER_MAXLEVERAGE = "maxLeverage";
    bytes32 internal constant PARAMETER_MAXMARKETDEBT = "maxMarketDebt";
    bytes32 internal constant PARAMETER_MININITIALMARGIN = "minInitialMargin";
    bytes32 internal constant PARAMETER_MAXFUNDINGRATE = "maxFundingRate";
    bytes32 internal constant PARAMETER_MAXFUNDINGRATESKEW = "maxFundingRateSkew";
    bytes32 internal constant PARAMETER_MAXFUNDINGRATEDELTA = "maxFundingRateDelta";

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address payable _proxy,
        address _owner,
        address _resolver,
        bytes32 _baseAsset,
        uint _exchangeFee,
        uint _maxLeverage,
        uint _maxMarketDebt,
        uint _minInitialMargin,
        uint[3] memory _fundingParameters
    ) public Owned(_owner) Proxyable(_proxy) MixinResolver(_resolver, _addressesToCache) {
        baseAsset = _baseAsset;

        parameters.exchangeFee = _exchangeFee;
        parameters.maxLeverage = _maxLeverage;
        parameters.maxMarketDebt = _maxMarketDebt;
        parameters.minInitialMargin = _minInitialMargin;
        parameters.maxFundingRate = _fundingParameters[0];
        parameters.maxFundingRateSkew = _fundingParameters[1];
        parameters.maxFundingRateDelta = _fundingParameters[2];

        // Initialise the funding sequence with 0 initially accrued.
        fundingSequence.push(0);
    }

    /* ========== VIEWS ========== */

    /* ---------- External Contracts ---------- */

    function _manager() internal view returns (IFuturesMarketManagerInternal) {
        return
            IFuturesMarketManagerInternal(
                requireAndGetAddress(CONTRACT_FUTURESMARKETMANAGER, "Missing FuturesMarketManager")
            );
    }

    function _exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES, "Missing ExchangeRates"));
    }

    function _feePool() internal view returns (IFeePool) {
        return IFeePool(requireAndGetAddress(CONTRACT_FEEPOOL, "Missing FeePool"));
    }

    function _sUSD() internal view returns (IERC20) {
        return IERC20(requireAndGetAddress(CONTRACT_SYNTHSUSD, "Missing SynthsUSD"));
    }

    /* ---------- Market Details ---------- */

    function _liquidationFee() internal view returns (uint) {
        return getFuturesLiquidationFee();
    }

    function _assetPrice(IExchangeRates exchangeRates) internal view returns (uint price, bool invalid) {
        return exchangeRates.rateAndInvalid(baseAsset);
    }

    function _assetPriceRequireNotInvalid(IExchangeRates exchangeRates) internal view returns (uint) {
        (uint price, bool invalid) = _assetPrice(exchangeRates);
        require(!invalid, "Price is invalid");
        return price;
    }

    function assetPrice() external view returns (uint price, bool invalid) {
        return _assetPrice(_exchangeRates());
    }

    function _currentRoundId(IExchangeRates exchangeRates) internal view returns (uint roundId) {
        return exchangeRates.getCurrentRoundId(baseAsset);
    }

    function currentRoundId() external view returns (uint roundId) {
        return _currentRoundId(_exchangeRates());
    }

    function marketSizes() external view returns (uint short, uint long) {
        int size = int(marketSize);
        int skew = marketSkew;
        return (_abs(size.add(skew).div(2)), _abs(size.sub(skew).div(2)));
    }

    function _marketDebt(uint price) internal view returns (uint) {
        int totalDebt = int(price).multiplyDecimalRound(marketSkew).add(marginSumMinusNotionalSkew).add(
            int(pendingOrderValue)
        );
        return uint(_max(totalDebt, 0));
    }

    function marketDebt() external view returns (uint debt, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        return (_marketDebt(price), isInvalid);
    }

    function _proportionalSkew() internal view returns (int) {
        int signedSize = int(marketSize);
        if (signedSize == 0) {
            return 0;
        }
        return marketSkew.divideDecimalRound(signedSize);
    }

    function proportionalSkew() external view returns (int) {
        return _proportionalSkew();
    }

    function _currentFundingRatePerSecond() internal view returns (int) {
        return _currentFundingRate() / 1 days;
    }

    function _currentFundingRate() internal view returns (int) {
        int maxFundingRateSkew = int(parameters.maxFundingRateSkew);
        int maxFundingRate = int(parameters.maxFundingRate);
        if (maxFundingRateSkew == 0) {
            return maxFundingRate;
        }

        int functionFraction = _proportionalSkew().divideDecimalRound(maxFundingRateSkew);
        // Note the minus sign: funding flows in the opposite direction to the skew.
        return _min(_max(-_UNIT, -functionFraction), _UNIT).multiplyDecimalRound(maxFundingRate);
    }

    function currentFundingRate() external view returns (int) {
        return _currentFundingRate();
    }

    function _unrecordedFunding(uint price) internal view returns (int funding) {
        int elapsed = int(block.timestamp.sub(fundingLastRecomputed));
        return _currentFundingRatePerSecond().multiplyDecimalRound(int(price)).mul(elapsed);
    }

    function unrecordedFunding() external view returns (int funding, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        return (_unrecordedFunding(price), isInvalid);
    }

    function _netFundingPerUnit(
        uint startIndex,
        uint endIndex,
        uint sequenceLength,
        uint price
    ) internal view returns (int) {
        int funding;
        if (endIndex == sequenceLength) {
            funding = _unrecordedFunding(price);
            endIndex = sequenceLength.sub(1);
        }
        return funding.add(fundingSequence[endIndex]).sub(fundingSequence[startIndex]);
    }

    function netFundingPerUnit(uint startIndex, uint endIndex) external view returns (int funding, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        return (_netFundingPerUnit(startIndex, endIndex, fundingSequence.length, price), isInvalid);
    }

    function fundingSequenceLength() external view returns (uint) {
        return fundingSequence.length;
    }

    /* ---------- Position Details ---------- */

    function _notionalValue(address account, uint price) internal view returns (int value) {
        return positions[account].size.multiplyDecimalRound(int(price));
    }

    function notionalValue(address account) external view returns (int value, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        return (_notionalValue(account, price), isInvalid);
    }

    // Profit/loss of a position will be relative to the position's side:
    // Long PnL of -100 means a 100 dollar loss, while Short PnL of -100 means a 100 dollar profit
    function _profitLoss(Position storage position, uint price) internal view returns (int pnl) {
        int priceShift = int(price).sub(int(position.lastPrice));
        return _signedAbs(position.size).multiplyDecimalRound(priceShift);
    }

    function profitLoss(address account) external view returns (int pnl, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        Position storage position = positions[account];
        return (_profitLoss(position, price), isInvalid);
    }

    function _accruedFunding(
        Position storage position,
        uint fundingIndex,
        uint price
    ) internal view returns (int funding) {
        uint lastIndex = position.fundingIndex;
        if (lastIndex == 0) {
            return 0;
        }
        int net = _netFundingPerUnit(lastIndex, fundingIndex, fundingSequence.length, price);
        return _signedAbs(position.size).multiplyDecimalRound(net);
    }

    function accruedFunding(address account) external view returns (int funding, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        return (_accruedFunding(positions[account], fundingSequence.length, price), isInvalid);
    }

    function _remainingMargin(
        Position storage position,
        uint fundingIndex,
        uint price
    ) internal view returns (int) {
        int margin = position.margin;
        int remaining = margin.add(_profitLoss(position, price)).add(_accruedFunding(position, fundingIndex, price));

        // if the sign of our margin flipped, then the remaining margin went past zero and the position would have
        // been liquidated.
        if (!_sameSide(remaining, margin)) {
            return 0;
        }
        return remaining;
    }

    function remainingMargin(address account) external view returns (int marginRemaining, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        Position storage position = positions[account];
        return (_remainingMargin(position, fundingSequence.length, price), isInvalid);
    }

    function _liquidationPrice(
        address account,
        bool includeFunding,
        uint fundingIndex,
        uint price
    ) internal view returns (uint) {
        // If margin > 0, we're long, the position can be liquidated whenever:
        //     remainingMargin < liquidationFee
        // Otherwise, we're short, and we'll examine
        //     -remainingMargin < liquidationFee
        // In the short case, the signs of margin, positionSize, and funding are flipped. Hence, expanding
        // the definition of remainingMargin, and solving for the price:
        //     liquidationPrice = lastPrice + (liquidationFee - (|margin| +- funding)) / |positionSize|
        // (positive sign for funding when long, negative sign when short)

        Position storage position = positions[account];
        int size = _signedAbs(position.size);

        if (size == 0) {
            return 0;
        }

        int margin = position.margin;
        int marginPlusFunding = _signedAbs(margin);
        if (includeFunding) {
            // prettier-ignore
            function(int, int) pure returns (int) operation = margin > 0 ? SignedSafeMath.add : SignedSafeMath.sub;
            marginPlusFunding = operation(marginPlusFunding, _accruedFunding(position, fundingIndex, price));
        }

        int lastPrice = int(position.lastPrice);
        int liquidationFee = int(_liquidationFee());
        return uint(lastPrice.add(liquidationFee.sub(marginPlusFunding).divideDecimalRound(size)));
    }

    function liquidationPrice(address account, bool includeFunding) external view returns (uint price, bool invalid) {
        (uint aPrice, bool isInvalid) = _assetPrice(_exchangeRates());
        return (_liquidationPrice(account, includeFunding, fundingSequence.length, aPrice), isInvalid);
    }

    function _canLiquidate(
        Position storage position,
        uint liquidationFee,
        uint fundingIndex
    ) internal view returns (bool) {
        // No liquidating empty positions.
        if (position.size == 0) {
            return false;
        }

        (uint price, bool invalid) = _assetPrice(_exchangeRates());
        // No liquidating when the current price is invalid.
        if (invalid) {
            return false;
        }

        int margin = _remainingMargin(position, fundingIndex, price);
        return _abs(margin) <= liquidationFee;
    }

    function canLiquidate(address account) external view returns (bool) {
        return _canLiquidate(positions[account], _liquidationFee(), fundingSequence.length);
    }

    function currentLeverage(address account) external view returns (uint leverage, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        Position storage position = positions[account];
        int remaining = _remainingMargin(position, fundingSequence.length, price);

        // No position is open, or it is ready to be liquidated; leverage goes to nil
        if (remaining == 0) {
            return (0, isInvalid);
        }

        int notional = _notionalValue(account, price);

        // notional and remaining margin will have the same sign, so we can cast to int here.
        return (uint(notional.divideDecimalRound(remaining)), isInvalid);
    }

    function _orderFee(
        int margin,
        uint leverage,
        int existingSize,
        uint price
    ) internal view returns (uint) {
        // Charge nothing if closing a position.
        if (margin == 0 || leverage == 0) {
            return 0;
        }

        int existingValue = existingSize.multiplyDecimalRound(int(price));
        int chargeableValue = margin.multiplyDecimalRound(int(leverage));
        int skew = marketSkew;

        // If the order is submitted on the same side as the skew, a fee is charged on any increase
        // in their position.
        // Otherwise if the order is opposite to the skew,
        // the fee is only charged on any new skew they induce on the order's side of the market.
        if (_sameSide(skew, chargeableValue)) {
            // If an existing position is open the same side as the order, deduct its value,
            // ignore it as this position will be closed.
            if (_sameSide(existingValue, chargeableValue)) {
                // If decreasing their position, no fee is charged, even if it would increase the skew.
                if (_abs(chargeableValue) <= _abs(existingValue)) {
                    return 0;
                }

                // Now we know that |chargeable| > |existing|
                chargeableValue = chargeableValue.sub(existingValue);
            }
        } else {
            // Remove their existing contribution to the skew
            int notionalSkew = skew.multiplyDecimalRound(int(price));
            chargeableValue = notionalSkew.sub(existingValue).add(chargeableValue);

            // If the order was insufficient to flip the skew, no fee is charged.
            // Otherwise, there is a fee on the entire new skew induced on the side of their order.
            if (_sameSide(notionalSkew, chargeableValue)) {
                return 0;
            }
        }

        return _abs(chargeableValue.multiplyDecimalRound(int(parameters.exchangeFee)));
    }

    function orderFee(
        address account,
        int margin,
        uint leverage
    ) external view returns (uint fee, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        return (_orderFee(margin, leverage, positions[account].size, price), isInvalid);
    }

    function canConfirmOrder(address account) external view returns (bool) {
        IExchangeRates exRates = _exchangeRates();
        (uint price, bool invalid) = _assetPrice(exRates);
        Order storage order = orders[account];
        if (invalid || price == 0 || !order.pending || _currentRoundId(exRates) <= order.roundId) {
            return false;
        }
        return true;
    }

    /* ---------- Utilities ---------- */

    function _signedAbs(int x) internal pure returns (int) {
        return x > 0 ? x : -x;
    }

    function _abs(int x) internal pure returns (uint) {
        return uint(_signedAbs(x));
    }

    function _max(int x, int y) internal pure returns (int) {
        return x > y ? x : y;
    }

    function _min(int x, int y) internal pure returns (int) {
        return x < y ? x : y;
    }

    function _sameSide(int a, int b) internal pure returns (bool) {
        // Since we only care about the sign of the product, we don't care about overflow and
        // aren't using SignedSafeDecimalMath
        return a * b >= 0;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /* ---------- Setters ---------- */

    function setExchangeFee(uint exchangeFee) external optionalProxy_onlyOwner {
        parameters.exchangeFee = exchangeFee;
        emitParameterUpdated(PARAMETER_EXCHANGEFEE, exchangeFee);
    }

    function setMaxLeverage(uint maxLeverage) external optionalProxy_onlyOwner {
        parameters.maxLeverage = maxLeverage;
        emitParameterUpdated(PARAMETER_MAXLEVERAGE, maxLeverage);
    }

    function setMaxMarketDebt(uint maxMarketDebt) external optionalProxy_onlyOwner {
        parameters.maxMarketDebt = maxMarketDebt;
        emitParameterUpdated(PARAMETER_MAXMARKETDEBT, maxMarketDebt);
    }

    function setMinInitialMargin(uint minInitialMargin) external optionalProxy_onlyOwner {
        parameters.minInitialMargin = minInitialMargin;
        emitParameterUpdated(PARAMETER_MININITIALMARGIN, minInitialMargin);
    }

    function setMaxFundingRate(uint maxFundingRate) external optionalProxy_onlyOwner {
        parameters.maxFundingRate = maxFundingRate;
        emitParameterUpdated(PARAMETER_MAXFUNDINGRATE, maxFundingRate);
    }

    function setMaxFundingRateSkew(uint maxFundingRateSkew) external optionalProxy_onlyOwner {
        parameters.maxFundingRateSkew = maxFundingRateSkew;
        emitParameterUpdated(PARAMETER_MAXFUNDINGRATESKEW, maxFundingRateSkew);
    }

    function setMaxFundingRateDelta(uint maxFundingRateDelta) external optionalProxy_onlyOwner {
        parameters.maxFundingRateDelta = maxFundingRateDelta;
        emitParameterUpdated(PARAMETER_MAXFUNDINGRATEDELTA, maxFundingRateDelta);
    }

    /* ---------- Market Operations ---------- */

    function _recomputeFunding(uint price) internal returns (uint lastIndex) {
        int funding = _unrecordedFunding(price);

        uint sequenceLength = fundingSequence.length;
        fundingSequence.push(fundingSequence[sequenceLength.sub(1)].add(funding));
        fundingLastRecomputed = block.timestamp;

        return sequenceLength;
    }

    function _realiseMargin(
        Position storage position,
        uint fundingIndex,
        uint price
    ) internal returns (int) {
        int newMargin = _remainingMargin(position, fundingIndex, price);
        int marginDelta = newMargin.sub(_signedAbs(position.margin));

        // Position size does not change, but the price did.
        int notionalDelta = position.size.multiplyDecimalRound(int(price).sub(int(position.lastPrice)));

        marginSumMinusNotionalSkew = marginSumMinusNotionalSkew.add(marginDelta).sub(notionalDelta);
        position.margin = newMargin;
        position.lastPrice = price;
        position.fundingIndex = fundingIndex;

        return newMargin;
    }

    function _updateRemainingMargin(address account, uint price) internal returns (uint fundingIndex, bool liquidated) {
        fundingIndex = _recomputeFunding(price);
        Position storage position = positions[account];
        // Don't bother to do anything for empty positions.
        if (position.size != 0) {
            int newMargin = _realiseMargin(position, fundingIndex, price);

            if (_abs(newMargin) <= _liquidationFee()) {
                _liquidatePosition(account, account, fundingIndex, price);
                return (fundingIndex, true);
            }
        }
        return (fundingIndex, false);
    }

    function _cancelOrder(address account) internal {
        Order storage order = orders[account];
        uint absoluteMargin = _abs(order.margin);
        _manager().issueSUSD(account, absoluteMargin.add(order.fee));
        pendingOrderValue = pendingOrderValue.sub(absoluteMargin);

        emitOrderCancelled(order.id, account);
        delete orders[account];
    }

    function cancelOrder() external optionalProxy {
        address sender = messageSender;
        require(orders[sender].pending, "No pending order");

        uint price = _assetPriceRequireNotInvalid(_exchangeRates());
        (, bool liquidated) = _updateRemainingMargin(sender, price);

        // Liquidations cancel pending orders.
        if (!liquidated) {
            _cancelOrder(sender);
        }
    }

    // TODO: Net out funding and check sUSD balance is sufficient to cover difference between remaining and new margin.
    // TODO: If they are owed anything because the position is being closed, then remit it at confirmation.
    // TODO: What to do if a position already exists.
    // TODO: What to do if user is swapping sides
    function _submitOrder(
        address sender,
        int margin,
        uint leverage,
        uint price
    ) internal {
        // First cancel any open order.
        Order storage order = orders[sender];
        if (order.pending) {
            _cancelOrder(sender);
        }

        // Either argument being zero will close the whole position.
        if (margin == 0 || leverage == 0) {
            margin = 0;
            leverage = 0;
        }

        // Compute the fee owed.
        uint fee = _orderFee(margin, leverage, positions[sender].size, price);

        // Check that they have sufficient sUSD balance to cover the desired margin plus fee, and burn it.
        uint absoluteMargin = _abs(margin);
        uint balance = _sUSD().balanceOf(sender);
        uint totalCharge = absoluteMargin.add(fee);
        // TODO: This should not charge anything if they're DECREASING their position.
        if (totalCharge > 0) {
            require(totalCharge <= balance, "Insufficient balance");
            // TODO: allow the user to decrease their position without closing it if the debt exceeds the cap
            // Update pending order value, which increases the market debt
            // Revert if the new debt would exceed the maximum configured for the market
            if (absoluteMargin > 0) {
                // This may be zero if the order is being cancelled.
                pendingOrderValue = pendingOrderValue.add(absoluteMargin);
                uint debt = _marketDebt(price);
                require(debt <= parameters.maxMarketDebt, "Max market debt exceeded");
            }
            _manager().burnSUSD(sender, totalCharge);
        }

        // Lodge the order, which can be confirmed at the next price update
        uint roundId = _currentRoundId(_exchangeRates());
        uint id = _nextOrderId;
        _nextOrderId = _nextOrderId.add(1);

        // TODO: convert to order = Order(...) syntax
        order.pending = true;
        order.id = id;
        order.margin = margin;
        order.leverage = leverage;
        order.fee = fee;
        order.roundId = roundId;
        emitOrderSubmitted(id, sender, margin, leverage, fee, roundId);
    }

    function submitOrder(int margin, uint leverage) external optionalProxy {
        require(leverage <= parameters.maxLeverage, "Max leverage exceeded");
        address sender = messageSender;
        uint price = _assetPriceRequireNotInvalid(_exchangeRates());

        // Margin or leverage at zero closes the entire position.
        if (margin == 0 || leverage == 0) {
            _closePosition(sender, price);
            return;
        }

        require(parameters.minInitialMargin <= _abs(margin), "Insufficient margin");

        // TODO: Determine what to do if updating the remaining margin liquidates any existing position

        _updateRemainingMargin(sender, price);
        _submitOrder(sender, margin, leverage, price);
    }

    function _closePosition(address sender, uint price) internal {
        (, bool liquidated) = _updateRemainingMargin(sender, price);
        // No need to close the order if it was liquidated
        if (!liquidated) {
            _submitOrder(sender, 0, 0, price);
        }
    }

    function closePosition() external optionalProxy {
        _closePosition(messageSender, _assetPriceRequireNotInvalid(_exchangeRates()));
    }

    // TODO: What to do if a position already exists.
    function confirmOrder(address account) external optionalProxy {
        // TODO: Send the margin delta? How to handle pnl/funding accrued during order pending
        // TODO: Apply this difference to the pending margin

        uint price = _assetPriceRequireNotInvalid(_exchangeRates());
        (uint fundingIndex, bool liquidated) = _updateRemainingMargin(account, price);

        // If the account needed to be liquidated, then the order was cancelled and it doesn't need to be confirmed.
        if (liquidated) {
            return;
        }

        Order memory order = orders[account];
        require(order.pending, "No pending order");
        require(_currentRoundId(_exchangeRates()) > order.roundId, "Awaiting next price");
        require(price != 0, "Zero entry price. Cancel order and try again.");

        int newSize = order.margin.multiplyDecimalRound(int(order.leverage)).divideDecimalRound(int(price));

        Position storage position = positions[account];
        int positionSize = position.size;

        marketSkew = marketSkew.add(newSize).sub(positionSize);
        marketSize = marketSize.add(_abs(newSize)).sub(_abs(positionSize));

        int marginDelta = _signedAbs(order.margin).sub(_signedAbs(position.margin));
        int notionalDelta = newSize.multiplyDecimalRound(int(price)).sub(
            positionSize.multiplyDecimalRound(int(position.lastPrice))
        );

        marginSumMinusNotionalSkew = marginSumMinusNotionalSkew.add(marginDelta).sub(notionalDelta);
        pendingOrderValue = pendingOrderValue.sub(_abs(order.margin));

        if (order.fee > 0) {
            _manager().issueSUSD(_feePool().FEE_ADDRESS(), order.fee);
        }

        if (newSize == 0) {
            delete positions[account];
        } else {
            position.margin = order.margin;
            position.size = newSize;
            position.lastPrice = price;
            position.fundingIndex = fundingIndex;
        }

        delete orders[account];
        emitOrderConfirmed(order.id, account, order.margin, newSize, price, fundingIndex);
    }

    function _liquidatePosition(
        address account,
        address liquidator,
        uint fundingIndex,
        uint price
    ) internal {
        uint liquidationFee = _liquidationFee();

        // If we can liquidate, it also implies that the current price is valid, and that the account being liquidated
        // has a position.
        Position storage position = positions[account];
        require(_canLiquidate(position, liquidationFee, fundingIndex), "Position cannot be liquidated");

        // If there are any pending orders, the liquidation will cancel them.
        if (orders[account].pending) {
            _cancelOrder(account);
        }

        // Retrieve the liquidation price before we close the order.
        uint lPrice = _liquidationPrice(account, true, fundingIndex, price);

        // Close the position itself.
        int positionSize = position.size;

        marketSkew = marketSkew.sub(positionSize);
        marketSize = marketSize.sub(_abs(positionSize));

        marginSumMinusNotionalSkew = marginSumMinusNotionalSkew.sub(_signedAbs(position.margin)).add(
            position.size.multiplyDecimalRound(int(position.lastPrice))
        );

        delete positions[account];

        // Issue the reward to the liquidator.
        _manager().issueSUSD(liquidator, liquidationFee);

        emitPositionLiquidated(account, liquidator, positionSize, lPrice);
    }

    function liquidatePosition(address account) external optionalProxy {
        uint price = _assetPriceRequireNotInvalid(_exchangeRates());
        uint sequenceLength = _recomputeFunding(price);
        _liquidatePosition(account, messageSender, sequenceLength, price);
    }

    /* ========== EVENTS ========== */

    function addressToBytes32(address input) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(input)));
    }

    event ParameterUpdated(bytes32 indexed parameter, uint value);
    bytes32 internal constant SIG_PARAMETERUPDATED = keccak256("ParameterUpdated(bytes32,uint256)");

    function emitParameterUpdated(bytes32 parameter, uint value) internal {
        proxy._emit(abi.encode(value), 2, SIG_PARAMETERUPDATED, parameter, 0, 0);
    }

    event OrderSubmitted(
        uint indexed id,
        address indexed account,
        int margin,
        uint leverage,
        uint fee,
        uint indexed roundId
    );
    bytes32 internal constant SIG_ORDERSUBMITTED = keccak256(
        "OrderSubmitted(uint256,address,int256,uint256,uint256,uint256)"
    );

    function emitOrderSubmitted(
        uint id,
        address account,
        int margin,
        uint leverage,
        uint fee,
        uint roundId
    ) internal {
        proxy._emit(
            abi.encode(margin, leverage, fee),
            4,
            SIG_ORDERSUBMITTED,
            bytes32(id),
            addressToBytes32(account),
            bytes32(roundId)
        );
    }

    event OrderConfirmed(uint indexed id, address indexed account, int margin, int size, uint price, uint fundingIndex);
    bytes32 internal constant SIG_ORDERCONFIRMED = keccak256(
        "OrderConfirmed(uint256,address,int256,int256,uint256,uint256)"
    );

    function emitOrderConfirmed(
        uint id,
        address account,
        int margin,
        int size,
        uint price,
        uint fundingIndex
    ) internal {
        proxy._emit(
            abi.encode(margin, size, price, fundingIndex),
            3,
            SIG_ORDERCONFIRMED,
            bytes32(id),
            addressToBytes32(account),
            0
        );
    }

    event OrderCancelled(uint indexed id, address indexed account);
    bytes32 internal constant SIG_ORDERCANCELLED = keccak256("OrderCancelled(uint256,address)");

    function emitOrderCancelled(uint id, address account) internal {
        proxy._emit(abi.encode(), 3, SIG_ORDERCANCELLED, bytes32(id), addressToBytes32(account), 0);
    }

    event PositionLiquidated(address indexed account, address indexed liquidator, int size, uint price);
    bytes32 internal constant SIG_POSITIONLIQUIDATED = keccak256("PositionLiquidated(address,address,int256,uint256)");

    function emitPositionLiquidated(
        address account,
        address liquidator,
        int size,
        uint price
    ) internal {
        proxy._emit(
            abi.encode(size, price),
            3,
            SIG_POSITIONLIQUIDATED,
            addressToBytes32(account),
            addressToBytes32(liquidator),
            0
        );
    }
}
