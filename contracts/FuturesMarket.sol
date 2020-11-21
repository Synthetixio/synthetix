pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
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


// General market details
//     max funding rate rate of change
//
// Details for a particular position
//     Properly accrue funding
//     Modification of existing positions (order submission, order fill, order fee computation)
//
// Functionality
//     Gas tank (non testnet)
//     Multi order confirmation (non testnet)
//     Pausable from SystemStatus (no funding charged in this period, but people can close orders) (non testnet)
//         Circuit breaker (relies on pausable if a price divergence is detected, part of keeper) (non testnet)
//     Debt caching (non testnet)
//     Margin Adjustment
//     Liquidations
//     Proxify / separated state

interface IFuturesMarketManagerInternal {
    function issueSUSD(address account, uint amount) external;

    function burnSUSD(address account, uint amount) external;
}


// https://docs.synthetix.io/contracts/source/contracts/futuresmarket
contract FuturesMarket is Owned, MixinResolver, MixinSystemSettings, IFuturesMarket {
    /* ========== LIBRARIES ========== */

    using SafeMath for uint;
    using SignedSafeMath for int;
    using SignedSafeDecimalMath for int;

    /* ========== TYPES ========== */
    // TODO: Move these into interface

    enum Side {Long, Short}

    struct Order {
        bool pending;
        int margin;
        uint leverage;
        uint fee;
        uint roundId;
    }

    struct Position {
        int margin;
        int size;
        uint entryPrice;
        uint entryIndex;
    }

    struct FundingParameters {
        uint maxFundingRate;
        uint maxFundingRateSkew;
        uint maxFundingRateDelta;
    }

    /* ========== STATE VARIABLES ========== */

    bytes32 public baseAsset;
    uint public exchangeFee;
    uint public maxLeverage;
    uint public maxMarketDebt;
    uint public minInitialMargin;
    FundingParameters public fundingParameters;

    uint public marketSize;
    int public marketSkew; // When positive, longs outweigh shorts. When negative, shorts outweigh longs.
    int public entryMarginSumMinusNotionalSkew;
    int public entryNotionalSkew;
    uint public pendingOrderValue;

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

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address _owner,
        address _resolver,
        bytes32 _baseAsset,
        uint _exchangeFee,
        uint _maxLeverage,
        uint _maxMarketDebt,
        uint _minInitialMargin,
        uint[3] memory _fundingParameters
    ) public Owned(_owner) MixinResolver(_resolver, _addressesToCache) {
        baseAsset = _baseAsset;

        exchangeFee = _exchangeFee;
        emit ExchangeFeeUpdated(_exchangeFee);

        maxLeverage = _maxLeverage;
        emit MaxLeverageUpdated(_maxLeverage);

        maxMarketDebt = _maxMarketDebt;
        emit MaxMarketDebtUpdated(_maxMarketDebt);

        minInitialMargin = _minInitialMargin;
        emit MinInitialMarginUpdated(_minInitialMargin);

        fundingParameters.maxFundingRate = _fundingParameters[0];
        fundingParameters.maxFundingRateSkew = _fundingParameters[1];
        fundingParameters.maxFundingRateDelta = _fundingParameters[2];
        emit FundingParametersUpdated(_fundingParameters[0], _fundingParameters[1], _fundingParameters[2]);

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

    function _priceAndInvalid(IExchangeRates exchangeRates) internal view returns (uint assetPrice, bool isInvalid) {
        return exchangeRates.rateAndInvalid(baseAsset);
    }

    function priceAndInvalid() external view returns (uint assetPrice, bool isInvalid) {
        return _priceAndInvalid(_exchangeRates());
    }

    function _currentRoundId(IExchangeRates exchangeRates) internal view returns (uint roundId) {
        return exchangeRates.getCurrentRoundId(baseAsset);
    }

    function currentRoundId() external view returns (uint roundId) {
        return _currentRoundId(_exchangeRates());
    }

    function marketSizes() external view returns (uint short, uint long) {
        int size = int(marketSize);
        int skew = int(marketSkew);
        return (_abs(size.add(skew).div(2)), _abs(size.sub(skew).div(2)));
    }

    function _marketDebt(uint price) internal view returns (uint) {
        int totalDebt = int(price).multiplyDecimalRound(marketSkew).add(entryMarginSumMinusNotionalSkew).add(
            int(pendingOrderValue)
        );
        return uint(_max(totalDebt, 0));
    }

    function marketDebt() external view returns (uint debt, bool isInvalid) {
        (uint price, bool invalid) = _priceAndInvalid(_exchangeRates());
        return (_marketDebt(price), invalid);
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

    function _currentFundingRate() internal view returns (int) {
        int maxFundingRateSkew = int(fundingParameters.maxFundingRateSkew);
        int maxFundingRate = int(fundingParameters.maxFundingRate);
        if (maxFundingRateSkew == 0) {
            return maxFundingRate;
        }

        int functionFraction = _proportionalSkew().divideDecimalRound(maxFundingRateSkew);
        return _min(_max(-1, functionFraction), 1).multiplyDecimalRound(maxFundingRate);
    }

    // TODO: respect max funding rate rate of change
    function currentFundingRate() external view returns (int) {
        return _currentFundingRate();
    }

    // TODO: respect maximum funding rate of change
    function _unrecordedFunding() internal view returns (int funding, bool isInvalid) {
        int elapsed = int(block.timestamp.sub(fundingLastRecomputed));
        (uint price, bool invalid) = _priceAndInvalid(_exchangeRates());
        return (_currentFundingRate().multiplyDecimalRound(int(price)).mul(elapsed), invalid);
    }

    function unrecordedFunding() external view returns (int funding, bool isInvalid) {
        return _unrecordedFunding();
    }

    // TODO: respect maximum funding rate of change
    function _netFundingPerUnit(
        uint startIndex,
        uint endIndex,
        uint sequenceLength
    ) internal view returns (int funding, bool isInvalid) {
        if (endIndex == sequenceLength) {
            (int unrecorded, bool invalid) = _unrecordedFunding();
            funding = unrecorded;
            isInvalid = invalid;
            endIndex = sequenceLength.sub(1);
        }

        funding = funding.add(fundingSequence[endIndex]).sub(fundingSequence[startIndex]);
        return (funding, isInvalid);
    }

    function netFundingPerUnit(uint startIndex, uint endIndex) external view returns (int funding, bool isInvalid) {
        return _netFundingPerUnit(startIndex, endIndex, fundingSequence.length);
    }

    /* ---------- Position Details ---------- */

    function notionalValue(address account) external view returns (int value, bool isInvalid) {
        (uint price, bool invalid) = _priceAndInvalid(_exchangeRates());
        return (positions[account].size.multiplyDecimalRound(int(price)), invalid);
    }

    function _profitLoss(address account) internal view returns (int pnl, bool isInvalid) {
        (uint price, bool invalid) = _priceAndInvalid(_exchangeRates());
        Position storage position = positions[account];
        int priceShift = int(price).sub(int(position.entryPrice));
        return (position.size.multiplyDecimalRound(priceShift), invalid);
    }

    function profitLoss(address account) external view returns (int pnl, bool isInvalid) {
        return _profitLoss(account);
    }

    function _accruedFunding(address account) internal view returns (int funding, bool isInvalid) {
        Position storage position = positions[account];
        uint entryIndex = position.entryIndex;
        if (entryIndex == 0) {
            return (0, false);
        }
        uint sequenceLength = fundingSequence.length;
        (int net, bool invalid) = _netFundingPerUnit(entryIndex, sequenceLength, sequenceLength);
        return (position.size.multiplyDecimalRound(net), invalid);
    }

    function accruedFunding(address account) external view returns (int funding, bool isInvalid) {
        return _accruedFunding(account);
    }

    function _remainingMargin(address account) internal view returns (int marginRemaining, bool isInvalid) {
        (int pnl, bool invalid) = _profitLoss(account);
        int margin = positions[account].margin;
        int funding = 0; // TODO: apply funding
        int remaining = margin.add(pnl).add(funding);

        // if the sign of our margin flipped, then the remaining margin went past zero and the position would have
        // been liquidated.
        if (!_sameSide(remaining, margin)) {
            return (0, invalid);
        }
        return (remaining, invalid);
    }

    function remainingMargin(address account) external view returns (int marginRemaining, bool isInvalid) {
        return _remainingMargin(account);
    }

    function liquidationPrice(address account, bool includeFunding) external view returns (uint price) {
        // If margin > 0, we're long, the position can be liquidated whenever:
        //     remainingMargin < liquidationFee
        // Otherwise, we're short, and we'll examine
        //     -remainingMargin < liquidationFee
        // In the short case, the signs of entryMargin, positionSize, and funding are flipped. Hence, expanding
        // the definition of remainingMargin, and solving for the price:
        //     liquidationPrice = entryPrice + (liquidationFee - (|entryMargin| +- funding)) / |positionSize|
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
            marginPlusFunding = operation(marginPlusFunding, 0); // TODO: Apply funding
        }

        int entryPrice = int(position.entryPrice);

        int liquidationFee = int(getFuturesLiquidationFee());
        return uint(entryPrice.add(liquidationFee.sub(marginPlusFunding).divideDecimalRound(size)));
    }

    // TODO: take into account existing positions
    function _orderFee(
        int margin,
        uint leverage,
        int existingSize,
        uint price
    ) internal view returns (uint) {
        // TODO: Generalise to decreasing a position
        // Charge nothing if closing a position.
        if (margin == 0 || leverage == 0) {
            return 0;
        }

        int skew = marketSkew;
        int chargeableValue = margin.multiplyDecimalRound(int(leverage));

        // If the order is submitted on the same side as the skew, a fee is charged on the entire position.
        // If not, the fee is only charged on the new skew they induce on their side, if any.
        if (!_sameSide(skew, chargeableValue)) {
            int notionalSkew = skew.multiplyDecimalRound(int(price));
            int notionalSkewInduced = notionalSkew.add(chargeableValue);

            // The order was insufficient to flip the skew, so no fee is charged.
            if (_sameSide(notionalSkew, notionalSkewInduced)) {
                return 0;
            }

            chargeableValue = notionalSkewInduced;
        }

        return _abs(chargeableValue.multiplyDecimalRound(int(exchangeFee)));
    }

    function orderFee(
        address account,
        int margin,
        uint leverage
    ) external view returns (uint) {
        (uint price, ) = _priceAndInvalid(_exchangeRates());

        return _orderFee(margin, leverage, positions[account].size, price);
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
        return a * b > 0;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /* ---------- Setters ---------- */

    function setExchangeFee(uint fee) external onlyOwner {
        exchangeFee = fee;
        emit ExchangeFeeUpdated(fee);
    }

    function setMaxLeverage(uint leverage) external onlyOwner {
        maxLeverage = leverage;
        emit MaxLeverageUpdated(leverage);
    }

    function setMaxMarketDebt(uint cap) external onlyOwner {
        maxMarketDebt = cap;
        emit MaxMarketDebtUpdated(cap);
    }

    function setMinInitialMargin(uint minMargin) external onlyOwner {
        minInitialMargin = minMargin;
        emit MinInitialMarginUpdated(minMargin);
    }

    function setFundingParameters(
        uint maxFundingRate,
        uint maxFundingRateSkew,
        uint maxFundingRateDelta
    ) external onlyOwner {
        fundingParameters.maxFundingRate = maxFundingRate;
        fundingParameters.maxFundingRateSkew = maxFundingRateSkew;
        fundingParameters.maxFundingRateDelta = maxFundingRateDelta;
        emit FundingParametersUpdated(maxFundingRate, maxFundingRateSkew, maxFundingRateDelta);
    }

    function _recomputeFunding() internal returns (uint lastIndex) {
        (int funding, bool invalid) = _unrecordedFunding();
        require(!invalid, "Price is invalid");

        uint sequenceLength = fundingSequence.length;
        fundingSequence.push(fundingSequence[sequenceLength.sub(1)].add(funding));
        fundingLastRecomputed = block.timestamp;

        return sequenceLength;
    }

    function _cancelOrder(Order storage order) internal {
        uint absoluteMargin = _abs(order.margin);
        _manager().issueSUSD(msg.sender, absoluteMargin.add(order.fee));
        pendingOrderValue = pendingOrderValue.sub(absoluteMargin);

        delete orders[msg.sender];
        emit OrderCancelled(msg.sender);
    }

    function cancelOrder() external {
        Order storage order = orders[msg.sender];
        require(order.pending, "No pending order");
        _cancelOrder(order);
    }

    // TODO: Net out funding and check sUSD balance is sufficient to cover difference between remaining and new margin.
    // TODO: If they are owed anything because the position is being closed, then remit it at confirmation.
    // TODO: Modifying a position should charge fees on the portion opened on the heavier side.
    // TODO: Make this withdraw directly from their sUSD.
    // TODO: What to do if an order already exists.
    function _submitOrder(int margin, uint leverage) internal {
        // First cancel any open order.
        Order storage order = orders[msg.sender];
        if (order.pending) {
            _cancelOrder(order);
        }

        // Either argument being zero will cancel the whole order
        if (margin == 0 || leverage == 0) {
            margin = 0;
            leverage = 0;
        }

        // Compute the fee owed.
        (uint price, bool isInvalid) = _priceAndInvalid(_exchangeRates());
        require(!isInvalid, "Price is invalid");
        uint fee = _orderFee(margin, leverage, positions[msg.sender].size, price);

        // Check that they have sufficient sUSD balance to cover the desired margin plus fee, and burn it.
        uint absoluteMargin = _abs(margin);
        uint balance = _sUSD().balanceOf(msg.sender);
        uint totalCharge = absoluteMargin.add(fee);
        // TODO: This should not charge anything if they're DECREASING their position.
        require(totalCharge <= balance, "Insufficient balance");
        if (totalCharge > 0) {
            // TODO: allow the user to decrease their position without closing it if the debt exceeds the cap
            // Update pending order value, which increases the market debt
            // Revert if the new debt would exceed the maximum configured for the market
            if (absoluteMargin > 0) {
                // This may be zero if the order is being cancelled.
                pendingOrderValue = pendingOrderValue.add(absoluteMargin);
                uint debt = _marketDebt(price);
                require(debt <= maxMarketDebt, "Max market debt exceeded");
            }
            _manager().burnSUSD(msg.sender, totalCharge);
        }

        // Lodge the order, which can be confirmed at the next price update
        uint roundId = _currentRoundId(_exchangeRates());
        order.pending = true;
        order.margin = margin;
        order.leverage = leverage;
        order.fee = fee;
        order.roundId = roundId;
        emit OrderSubmitted(msg.sender, margin, leverage, fee, roundId);
    }

    function submitOrder(int margin, uint leverage) external {
        require(leverage <= maxLeverage, "Max leverage exceeded");
        require(minInitialMargin <= _abs(margin), "Insufficient margin");
        _submitOrder(margin, leverage);
    }

    function closePosition() external {
        _submitOrder(0, 0);
    }

    // TODO: Multiple position confirmations
    // TODO: Send fee to fee pool on confirmation
    // TODO: What to do if an order already exists.
    function confirmOrder(address account) external {
        (uint entryPrice, bool isInvalid) = _priceAndInvalid(_exchangeRates());
        require(!isInvalid, "Price is invalid");
        require(entryPrice != 0, "Zero entry price. Cancel order and try again.");

        Order storage order = orders[account];
        require(order.pending, "No pending order");
        require(_currentRoundId(_exchangeRates()) > order.roundId, "Awaiting next price");

        int newMargin = order.margin;
        int newSize = newMargin.multiplyDecimalRound(int(order.leverage)).divideDecimalRound(int(entryPrice));

        Position storage position = positions[account];
        int positionSize = position.size;

        marketSkew = marketSkew.add(newSize).sub(positionSize);
        marketSize = marketSize.add(_abs(newSize)).sub(_abs(positionSize));

        int marginDelta = _signedAbs(newMargin).sub(_signedAbs(position.margin));
        int notionalDelta = newSize.multiplyDecimalRound(int(entryPrice)).sub(
            position.size.multiplyDecimalRound(int(position.entryPrice))
        );
        entryMarginSumMinusNotionalSkew = entryMarginSumMinusNotionalSkew.add(marginDelta).sub(notionalDelta);
        pendingOrderValue = pendingOrderValue.sub(_abs(newMargin));

        uint fee = order.fee;
        if (fee > 0) {
            _manager().issueSUSD(_feePool().FEE_ADDRESS(), fee);
        }

        // TODO: compute current funding index
        uint entryIndex = 0;

        position.margin = newMargin;
        position.size = newSize;
        position.entryPrice = entryPrice;
        position.entryIndex = entryIndex;

        delete orders[account];
        emit OrderConfirmed(account, newMargin, newSize, fee, entryPrice, entryIndex);
    }

    /* ========== EVENTS ========== */

    event ExchangeFeeUpdated(uint fee);
    event MaxLeverageUpdated(uint leverage);
    event MaxMarketDebtUpdated(uint cap);
    event MinInitialMarginUpdated(uint minMargin);
    event FundingParametersUpdated(uint maxFundingRate, uint maxFundingRateSkew, uint maxFundingRateDelta);
    event OrderSubmitted(address indexed account, int margin, uint leverage, uint fee, uint indexed roundId);
    event OrderConfirmed(address indexed account, int margin, int size, uint fee, uint entryPrice, uint entryIndex);
    event OrderCancelled(address indexed account);
}
