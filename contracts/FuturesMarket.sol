pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";

// Libraries
import "openzeppelin-solidity-2.3.0/contracts/math/SafeMath.sol";
import "./SignedSafeDecimalMath.sol";

// Internal references
import "./interfaces/IExchangeRates.sol";
import "./interfaces/IERC20.sol";


// General market details
//     current funding rate
//     Accrued funding sequence
//     Fees
//
// Details for a particular position
//     Funding
//     Net funding

// TODO: IFuturesMarket interface

// https://docs.synthetix.io/contracts/source/contracts/futuresmarket
contract FuturesMarket is Owned, MixinResolver, MixinSystemSettings {
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
    uint public maxTotalMargin;
    uint public minInitialMargin;
    FundingParameters public fundingParameters;

    uint public marketSize;
    int public marketSkew;
    uint public entryNotionalSum;
    uint public pendingOrderValue;
    uint public marginSum;

    mapping(address => Order) public orders;
    mapping(address => Position) public positions;

    /* ---------- Address Resolver Configuration ---------- */

    bytes32 internal constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 internal constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 internal constant CONTRACT_SYNTHSUSD = "SynthsUSD";
    bytes32 internal constant CONTRACT_FEEPOOL = "FeePool";

    bytes32[24] internal _addressesToCache = [CONTRACT_SYSTEMSTATUS, CONTRACT_EXRATES, CONTRACT_SYNTHSUSD, CONTRACT_FEEPOOL];

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address _owner,
        bytes32 _baseAsset,
        uint _exchangeFee,
        uint _maxLeverage,
        uint _maxTotalMargin,
        uint _minInitialMargin,
        uint[3] memory _fundingParameters // TODO: update this to a struct
    ) public Owned(_owner) MixinResolver(_owner, _addressesToCache) {
        baseAsset = _baseAsset;

        exchangeFee = _exchangeFee;
        emit ExchangeFeeUpdated(_exchangeFee);

        maxLeverage = _maxLeverage;
        emit MaxLeverageUpdated(_maxLeverage);

        maxTotalMargin = _maxTotalMargin;
        emit MaxMarketSizeUpdated(_maxTotalMargin);

        minInitialMargin = _minInitialMargin;
        emit MinInitialMarginUpdated(_minInitialMargin);

        fundingParameters.maxFundingRate = _fundingParameters[0];
        fundingParameters.maxFundingRateSkew = _fundingParameters[1];
        fundingParameters.maxFundingRateDelta = _fundingParameters[2];
        emit FundingParametersUpdated(_fundingParameters[0], _fundingParameters[1], _fundingParameters[2]);
    }

    /* ========== VIEWS ========== */

    /* ---------- External Contracts ---------- */

    function _exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES, "Missing ExchangeRates"));
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
        return (uint(_abs(size.add(skew).div(2))), uint(_abs(size.sub(skew).div(2))));
    }

    function marketDebt() external view returns (uint debt, bool isInvalid) {
        (uint price, bool invalid) = _priceAndInvalid(_exchangeRates());
        int debt = int(price).multiplyDecimalRound(skew).add(entryNotionalSum).add(int(pendingOrderValue));

        if (debt < 0) {
            return 0;
        }
        return debt;
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

    function _remainingMargin(address account) internal view returns (int remainingMargin, bool isInvalid) {
        (int pnl, bool isInvalid) = _profitLoss(account);
        // TODO: apply funding
        int margin = positions[account].margin;
        int remaining = margin.add(pnl);

        // if the sign of our margin flipped, then the remaining margin went past zero and the position would have
        // been liquidated. Since we only care about the sign of the product, we don't care about overflow, and
        // aren't using SignedSafeDecimalMath
        if (remaining * margin < 0) {
            return (0, isInvalid);
        }
        return (remaining, isInvalid);
    }

    function remainingMargin(address account) external view returns (int remainingMargin, bool isInvalid) {
        return _remainingMargin(account);
    }

    function liquidationPrice(address account, bool includeFunding) external view returns (uint liquidationPrice) {
        // If margin > 0, we're long, the position can be liquidated whenever:
        //     remainingMargin < liquidationFee
        // Otherwise, we're short, and we'll examine
        //     -remainingMargin < liquidationFee
        // In this case, then margin and positionSize are negative, so we'll take the absolute value of
        // these components. Hence:
        //     liquidationPrice = entryPrice + (liquidationFee - (|margin| + funding)) / |positionSize|

        Position storage position = positions[account];
        int marginPlusFunding = _abs(position.margin);
        if (includeFunding) {
            marginPlusFunding = marginPlusFunding.add(0); // TODO: Apply funding
        }

        int size = _abs(position.size);
        int entryPrice = int(position.entryPrice);

        int liquidationFee = int(getFuturesLiquidationFee());
        return uint(entryPrice.add(liquidationFee.sub(marginPlusFunding).divideDecimalRound(size)));
    }

    /* ---------- Utilities ---------- */

    function _abs(int x) internal pure returns (int) {
        return x > 0 ? x : -x;
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

    function setMaxMarketSize(uint cap) external onlyOwner {
        maxTotalMargin = cap;
        emit MaxMarketSizeUpdated(cap);
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

    // TODO: Modifying a position should charge fees on the portion opened on the heavier side.
    // TODO: Make this withdraw directly from their sUSD.
    function submitOrder(int margin, uint leverage) external {
        require(leverage <= maxLeverage, "Max leverage exceeded");
        require(uint(_abs(margin)) <= minInitialMargin, "Insufficient margin");

        // TODO: Net out funding and check sUSD balance is sufficient to cover difference between remaining and new margin.

        uint balance = _sUSD().balanceOf(msg.sender);
        require(uint(_abs(margin)) <= balance, "Insufficient balance");
        // TODO: Deduct balance, and record fee.

        // Update pending order value (not forgetting to deduct for any pending orders)
        // Revert if the margin would exceed the maximum configured for the market
        Order storage order = orders[msg.sender];
        if (order.pending) {
            pendingOrderValue = pendingOrderValue.sub(uint(_abs(order.margin)));
        }
        pendingOrderValue = pendingOrderValue.add(uint(_abs(margin)));
        require(marketSize.add(pendingOrderValue) <= maxTotalMargin, "Max market size exceeded");

        // Lodge the order, which can be confirmed at the next price update
        uint roundId = _currentRoundId(_exchangeRates());
        order.pending = true;
        order.margin = margin;
        order.leverage = leverage;
        order.roundId = roundId;
        emit OrderSubmitted(msg.sender, margin, leverage, roundId);
    }

    function closePosition() external {
        return;
    }

    function cancelOrder() external {
        Order storage order = orders[msg.sender];
        require(order.pending, "No pending order");
        order.pending = false;
        pendingOrderValue = pendingOrderValue.sub(uint(_abs(order.margin)));
        emit OrderCancelled(msg.sender);

        // TODO: Reimburse balance and fee
    }

    // TODO: Multiple position confirmations
    // TODO: Send fee to fee pool on confirmation
    // Order confirmation should emit event including the price at which it was confirmed
    function confirmOrder(address account) external {
        (uint entryPrice, bool isInvalid) = _priceAndInvalid(_exchangeRates());
        require(!isInvalid, "Price is invalid");

        Order storage order = orders[account];
        require(order.pending, "No pending order");
        require(_currentRoundId(_exchangeRates()) > order.roundId, "Awaiting next price");

        int newMargin = order.margin;
        int newSize = newMargin.multiplyDecimalRound(int(order.leverage)).divideDecimalRound(int(entryPrice));

        Position storage position = positions[account];
        int positionSize = position.size;

        marketSkew = marketSkew.add(newSize).sub(positionSize);
        marketSize = marketSize.add(uint(_abs(newSize))).sub(uint(_abs(positionSize)));

        int marginDelta = newMargin.sub(position.margin);
        int notionalDelta = position.size.multiplyDecimalRound(int(position.entryPrice)).sub(
            newSize.multiplyDecimalRound(int(entryPrice))
        );
        entryNotionalSum = uint(int(entryNotionalSum).add(marginDelta).add(notionalDelta));
        pendingOrderValue = pendingOrderValue.sub(uint(_abs(order.margin)));

        // TODO: compute current funding index
        uint entryIndex = 0;

        position.margin = newMargin;
        position.size = newSize;
        position.entryPrice = entryPrice;
        position.entryIndex = entryIndex;

        emit OrderConfirmed(account, newMargin, newSize, entryPrice, entryIndex);
    }

    event ExchangeFeeUpdated(uint fee);
    event MaxLeverageUpdated(uint leverage);
    event MaxMarketSizeUpdated(uint cap);
    event MinInitialMarginUpdated(uint minMargin);
    event FundingParametersUpdated(uint maxFundingRate, uint maxFundingRateSkew, uint maxFundingRateDelta);
    event OrderSubmitted(address indexed account, int margin, uint leverage, uint indexed roundId);
    event OrderConfirmed(address indexed account, int margin, int size, uint entryPrice, uint entryIndex);
    event OrderCancelled(address indexed account);
}
