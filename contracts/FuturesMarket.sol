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

// Remaining Functionality
//     Consider not exposing signs of short vs long positions
//     Rename marketSize, marketSkew, marketDebt, profitLoss, accruedFunding -> size, skew, debt, profit, funding
//     Consider reverting if things need to be liquidated rather than triggering it except by the
//         liquidatePosition function
//     Consider eliminating the fundingIndex param everywhere if we're always computing up to the current time.
//     Move the minimum initial margin into a global setting within SystemSettings, and then set a maximum liquidation fee that is the current minimum initial margin (otherwise we could set a value that will immediately liquidate every position)
//     Remove proportional skew from public interface

/* Notes:
 *
 * Internal functions assume:
 *    - prices passed into them are valid;
 *    - funding has already been recomputed up to the current time (hence unrecorded funding is nil);
 *    - the account being managed was not liquidated in the same transaction;
 */

interface IFuturesMarketManagerInternal {
    function issueSUSD(address account, uint amount) external;

    function burnSUSD(address account, uint amount) external;
}

// https://docs.synthetix.io/contracts/source/contracts/futuresmarket
contract FuturesMarket is Owned, Proxyable, MixinSystemSettings, IFuturesMarket {
    /* ========== LIBRARIES ========== */

    using SafeMath for uint;
    using SignedSafeMath for int;
    using SignedSafeDecimalMath for int;

    int private constant _UNIT = int(10**uint(18));
    // TODO: Move this into a market setting?
    uint private constant _MAX_MARKET_VALUE_PLAY_FACTOR = (2 * uint(_UNIT)) / 100;

    /* ========== TYPES ========== */

    // TODO: Move these into interface

    enum Side {Long, Short}

    struct Order {
        uint id;
        int leverage;
        uint fee;
        uint roundId;
    }

    // If margin/size are positive, the position is long; if negative then it is short.
    struct Position {
        uint margin;
        int size;
        uint lastPrice;
        uint fundingIndex;
    }

    // TODO: Convert funding rate from daily to per-second
    struct Parameters {
        uint takerFee;
        uint makerFee;
        uint maxLeverage;
        uint maxMarketValue;
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

    /*
     * The funding sequence allows constant-time calculation of the funding owed to a given position.
     * Each entry in the sequence holds the net funding accumulated per base unit since the market was created.
     * Then to obtain the net funding over a particular interval, subtract the start point's sequence entry
     * from the end point's sequence entry.
     * Positions contain the funding sequence entry at the time they were confirmed; so to compute
     * funding profit/loss on a given position, find the net profit per base unit since the position was
     * confirmed and multiply it by the position size.
     */
    uint public fundingLastRecomputed;
    int[] public fundingSequence;

    /*
     * This holds the value: sum_{p in positions}{p.margin - p.size * (p.lastPrice + fundingSequence[p.fundingIndex])}
     * Then marketSkew * (_assetPrice() + _marketDebt()) + entryDebtCorrection yields the total system debt,
     * which is equivalent to the sum of remaining margins in all positions.
     */
    int public entryDebtCorrection;

    mapping(address => Order) public orders;
    mapping(address => Position) public positions;

    uint internal _nextOrderId = 1; // Zero reflects an order that does not exist

    /* ---------- Address Resolver Configuration ---------- */

    bytes32 internal constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 internal constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 internal constant CONTRACT_SYNTHSUSD = "SynthsUSD";
    bytes32 internal constant CONTRACT_FEEPOOL = "FeePool";
    bytes32 internal constant CONTRACT_FUTURESMARKETMANAGER = "FuturesMarketManager";

    /* ---------- Parameter Names ---------- */

    bytes32 internal constant PARAMETER_TAKERFEE = "takerFee";
    bytes32 internal constant PARAMETER_MAKERFEE = "makerFee";
    bytes32 internal constant PARAMETER_MAXLEVERAGE = "maxLeverage";
    bytes32 internal constant PARAMETER_MAXMARKETVALUE = "maxMarketValue";
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
        uint _takerFee,
        uint _makerFee,
        uint _maxLeverage,
        uint _maxMarketValue,
        uint _minInitialMargin,
        uint[3] memory _fundingParameters
    ) public Owned(_owner) Proxyable(_proxy) MixinSystemSettings(_resolver) {
        baseAsset = _baseAsset;

        parameters.takerFee = _takerFee;
        parameters.makerFee = _makerFee;
        parameters.maxLeverage = _maxLeverage;
        parameters.maxMarketValue = _maxMarketValue;
        parameters.minInitialMargin = _minInitialMargin;
        parameters.maxFundingRate = _fundingParameters[0];
        parameters.maxFundingRateSkew = _fundingParameters[1];
        parameters.maxFundingRateDelta = _fundingParameters[2];

        // Initialise the funding sequence with 0 initially accrued, so that the first usable funding index is 1.
        fundingSequence.push(0);
    }

    /* ========== VIEWS ========== */

    /* ---------- External Contracts ---------- */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](5);
        newAddresses[0] = CONTRACT_SYSTEMSTATUS;
        newAddresses[1] = CONTRACT_EXRATES;
        newAddresses[2] = CONTRACT_SYNTHSUSD;
        newAddresses[3] = CONTRACT_FEEPOOL;
        newAddresses[4] = CONTRACT_FUTURESMARKETMANAGER;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    function _manager() internal view returns (IFuturesMarketManagerInternal) {
        return IFuturesMarketManagerInternal(requireAndGetAddress(CONTRACT_FUTURESMARKETMANAGER));
    }

    function _exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES));
    }

    function _feePool() internal view returns (IFeePool) {
        return IFeePool(requireAndGetAddress(CONTRACT_FEEPOOL));
    }

    function _sUSD() internal view returns (IERC20) {
        return IERC20(requireAndGetAddress(CONTRACT_SYNTHSUSD));
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

    // Total number of base units on each side of the market
    function _marketSizes() internal view returns (uint long, uint short) {
        int size = int(marketSize);
        int skew = marketSkew;
        return (_abs(size.add(skew).div(2)), _abs(size.sub(skew).div(2)));
    }

    function marketSizes() external view returns (uint long, uint short) {
        return _marketSizes();
    }

    function _maxOrderSizes(uint price) internal view returns (uint, uint) {
        (uint long, uint short) = _marketSizes();
        int sizeLimit = int(parameters.maxMarketValue).divideDecimalRound(int(price));
        return (uint(sizeLimit.sub(_min(int(long), sizeLimit))), uint(sizeLimit.sub(_min(int(short), sizeLimit))));
    }

    function maxOrderSizes()
        external
        view
        returns (
            uint long,
            uint short,
            bool invalid
        )
    {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        (uint longSize, uint shortSize) = _maxOrderSizes(price);
        return (longSize, shortSize, isInvalid);
    }

    // The total market debt is equivalent to the sum of remaining margins in all open positions
    function _marketDebt(uint price) internal view returns (uint) {
        int totalDebt =
            marketSkew.multiplyDecimalRound(int(price).add(_nextFundingEntry(fundingSequence.length, price))).add(
                entryDebtCorrection
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

    function _nextFundingEntry(uint sequenceLength, uint price) internal view returns (int funding) {
        return fundingSequence[sequenceLength.sub(1)].add(_unrecordedFunding(price));
    }

    function _netFundingPerUnit(
        uint startIndex,
        uint endIndex,
        uint sequenceLength,
        uint price
    ) internal view returns (int) {
        int result;

        if (endIndex == startIndex) {
            return 0;
        }

        require(startIndex < endIndex, "Funding index disordering");

        if (endIndex == sequenceLength) {
            result = _nextFundingEntry(sequenceLength, price);
        } else {
            result = fundingSequence[endIndex];
        }

        return result.sub(fundingSequence[startIndex]);
    }

    function netFundingPerUnit(uint startIndex, uint endIndex) external view returns (int funding, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        return (_netFundingPerUnit(startIndex, endIndex, fundingSequence.length, price), isInvalid);
    }

    function fundingSequenceLength() external view returns (uint) {
        return fundingSequence.length;
    }

    /* ---------- Position Details ---------- */

    function _orderPending(Order storage order) internal view returns (bool pending) {
        return order.id != 0;
    }

    function orderPending(address account) external view returns (bool pending) {
        return _orderPending(orders[account]);
    }

    function _notionalValue(Position storage position, uint price) internal view returns (int value) {
        return position.size.multiplyDecimalRound(int(price));
    }

    function notionalValue(address account) external view returns (int value, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        return (_notionalValue(positions[account], price), isInvalid);
    }

    function _profitLoss(Position storage position, uint price) internal view returns (int pnl) {
        int priceShift = int(price).sub(int(position.lastPrice));
        return position.size.multiplyDecimalRound(priceShift);
    }

    function profitLoss(address account) external view returns (int pnl, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        Position storage position = positions[account];
        return (_profitLoss(position, price), isInvalid);
    }

    function _accruedFunding(
        Position storage position,
        uint endFundingIndex,
        uint price
    ) internal view returns (int funding) {
        uint lastModifiedIndex = position.fundingIndex;
        if (lastModifiedIndex == 0) {
            return 0; // The position does not exist -- no funding.
        }
        int net = _netFundingPerUnit(lastModifiedIndex, endFundingIndex, fundingSequence.length, price);
        return position.size.multiplyDecimalRound(net);
    }

    function accruedFunding(address account) external view returns (int funding, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        return (_accruedFunding(positions[account], fundingSequence.length, price), isInvalid);
    }

    function _remainingMargin(
        Position storage position,
        uint endFundingIndex,
        uint price
    ) internal view returns (uint) {
        int remaining =
            int(position.margin).add(_profitLoss(position, price)).add(_accruedFunding(position, endFundingIndex, price));

        // The margin went past zero and the position should have been liquidated - no remaining margin.
        if (remaining < 0) {
            return 0;
        }
        return uint(remaining);
    }

    function remainingMargin(address account) external view returns (uint marginRemaining, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        Position storage position = positions[account];
        return (_remainingMargin(position, fundingSequence.length, price), isInvalid);
    }

    function _liquidationPrice(
        Position storage position,
        bool includeFunding,
        uint fundingIndex,
        uint currentPrice
    ) internal view returns (uint) {
        // A position can be liquidated whenever:
        //     remainingMargin <= liquidationFee
        // Hence, expanding the definition of remainingMargin the exact price
        // at which a position can first be liquidated is:
        //     margin + profitLoss + funding  =  liquidationFee
        //     price                          =  lastPrice + (liquidationFee - margin) / positionSize - netFundingPerUnit
        // This is straightforward if we neglect the funding term.

        int positionSize = position.size;

        if (positionSize == 0) {
            return 0;
        }

        int result =
            int(position.lastPrice).add(int(_liquidationFee()).sub(int(position.margin)).divideDecimalRound(positionSize));

        if (includeFunding) {
            // If we pay attention to funding, we have to expanding netFundingPerUnit and solve again for the price:
            //     price         =  (lastPrice + (liquidationFee - margin) / positionSize - netAccrued) / (1 + netUnrecorded)
            // Where, if fundingIndex == sequenceLength:
            //     netAccrued    =  fundingSequence[fundingSequenceLength - 1] - fundingSequence[position.fundingIndex]
            //     netUnrecorded =  currentFundingRate * (block.timestamp - fundingLastRecomputed)
            // And otherwise:
            //     netAccrued    =  fundingSequence[fundingIndex] - fundingSequence[position.fundingIndex]
            //     netUnrecorded =  0

            uint sequenceLength = fundingSequence.length;
            int denominator = _UNIT;
            if (fundingIndex == sequenceLength) {
                fundingIndex = sequenceLength.sub(1);
                denominator = _UNIT.add(_unrecordedFunding(currentPrice).divideDecimalRound(int(currentPrice)));
            }
            result = result
                .sub(_netFundingPerUnit(position.fundingIndex, fundingIndex, sequenceLength, currentPrice))
                .divideDecimalRound(denominator);
        }

        // If the user has leverage less than 1, their liquidation price may actually be negative; return 0 instead.
        return uint(_max(0, result));
    }

    function liquidationPrice(address account, bool includeFunding) external view returns (uint price, bool invalid) {
        (uint aPrice, bool isInvalid) = _assetPrice(_exchangeRates());
        Position storage position = positions[account];
        return (_liquidationPrice(position, includeFunding, fundingSequence.length, aPrice), isInvalid);
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

        return _remainingMargin(position, fundingIndex, price) <= liquidationFee;
    }

    function canLiquidate(address account) external view returns (bool) {
        return _canLiquidate(positions[account], _liquidationFee(), fundingSequence.length);
    }

    function _currentLeverage(
        Position storage position,
        uint price,
        uint remainingMargin_
    ) internal view returns (int leverage) {
        // No position is open, or it is ready to be liquidated; leverage goes to nil
        if (remainingMargin_ == 0) {
            return 0;
        }

        return _notionalValue(position, price).divideDecimalRound(int(remainingMargin_));
    }

    function currentLeverage(address account) external view returns (int leverage, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        Position storage position = positions[account];
        uint remainingMargin_ = _remainingMargin(position, fundingSequence.length, price);
        return (_currentLeverage(position, price, remainingMargin_), isInvalid);
    }

    function _orderFee(
        uint margin,
        int leverage,
        int existingSize,
        uint price
    ) internal view returns (uint) {
        // Charge nothing if closing a position.
        if (margin == 0 || leverage == 0) {
            return 0;
        }

        int existingNotional = existingSize.multiplyDecimalRound(int(price));
        int newNotional = int(margin).multiplyDecimalRound(leverage);
        int notionalDiff = newNotional;
        if (_sameSide(newNotional, existingNotional)) {
            // If decreasing a position, charge nothing.
            if (_abs(newNotional) <= _abs(existingNotional)) {
                return 0;
            }
            // We now know |existingNotional| < |newNotional|, provided the new order is on the same side as an existing position,
            // The existing position's notional may be larger if it is on the other side, but we neglect this,
            // and take the delta in the notional to be the entire new notional size, as the existing position is closing.
            notionalDiff = notionalDiff.sub(existingNotional);
        }

        int skew = marketSkew;
        if (_sameSide(newNotional, skew)) {
            // If the order is submitted on the same side as the skew, increasing it.
            // The taker fee is charged on the increase.
            return _abs(notionalDiff.multiplyDecimalRound(int(parameters.takerFee)));
        }

        // Otherwise if the order is opposite to the skew,
        // the maker fee is charged on new notional value up to the size of the existing skew,
        // and the taker fee is charged on any new skew they induce on the order's side of the market.

        int makerFee = int(parameters.makerFee);
        int fee = notionalDiff.multiplyDecimalRound(makerFee);

        // The notional value of the skew after the order is filled
        int postSkewNotional = skew.multiplyDecimalRound(int(price)).sub(existingNotional).add(newNotional);

        // The order is sufficient to flip the skew, charge/rebate the difference in fees
        // between maker and taker on the new skew value.
        if (_sameSide(newNotional, postSkewNotional)) {
            fee = fee.add(postSkewNotional.multiplyDecimalRound(int(parameters.takerFee).sub(makerFee)));
        }

        return _abs(fee);
    }

    // TODO: Do we need this margin field?
    // TODO: Perhaps we need a version of it which uses the account's remaining margin instead.
    function orderFee(
        address account,
        uint margin,
        int leverage
    ) external view returns (uint fee, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        return (_orderFee(margin, leverage, positions[account].size, price), isInvalid);
    }

    function canConfirmOrder(address account) external view returns (bool) {
        IExchangeRates exRates = _exchangeRates();
        (uint price, bool invalid) = _assetPrice(exRates);
        Order storage order = orders[account];
        return
            !invalid &&
            price != 0 &&
            _orderPending(order) &&
            order.roundId < _currentRoundId(exRates) &&
            !_canLiquidate(positions[account], _liquidationFee(), fundingSequence.length);
    }

    /* ---------- Utilities ---------- */

    function _signedAbs(int x) internal pure returns (int) {
        return x < 0 ? -x : x;
    }

    function _abs(int x) internal pure returns (uint) {
        return uint(_signedAbs(x));
    }

    function _max(int x, int y) internal pure returns (int) {
        return x < y ? y : x;
    }

    function _min(int x, int y) internal pure returns (int) {
        return x < y ? x : y;
    }

    function _sameSide(int a, int b) internal pure returns (bool) {
        // Since we only care about the sign of the product, we don't care about overflow and
        // aren't using SignedSafeDecimalMath
        return 0 <= a * b;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /* ---------- Setters ---------- */

    function setTakerFee(uint takerFee) external optionalProxy_onlyOwner {
        parameters.takerFee = takerFee;
        emitParameterUpdated(PARAMETER_TAKERFEE, takerFee);
    }

    function setMakerFee(uint makerFee) external optionalProxy_onlyOwner {
        parameters.makerFee = makerFee;
        emitParameterUpdated(PARAMETER_MAKERFEE, makerFee);
    }

    function setMaxLeverage(uint maxLeverage) external optionalProxy_onlyOwner {
        parameters.maxLeverage = maxLeverage;
        emitParameterUpdated(PARAMETER_MAXLEVERAGE, maxLeverage);
    }

    function setMaxMarketValue(uint maxMarketValue) external optionalProxy_onlyOwner {
        parameters.maxMarketValue = maxMarketValue;
        emitParameterUpdated(PARAMETER_MAXMARKETVALUE, maxMarketValue);
    }

    function setMinInitialMargin(uint minInitialMargin) external optionalProxy_onlyOwner {
        parameters.minInitialMargin = minInitialMargin;
        emitParameterUpdated(PARAMETER_MININITIALMARGIN, minInitialMargin);
    }

    // TODO: Setting this parameter should record funding first.
    function setMaxFundingRate(uint maxFundingRate) external optionalProxy_onlyOwner {
        parameters.maxFundingRate = maxFundingRate;
        emitParameterUpdated(PARAMETER_MAXFUNDINGRATE, maxFundingRate);
    }

    // TODO: Setting this parameter should record funding first.
    function setMaxFundingRateSkew(uint maxFundingRateSkew) external optionalProxy_onlyOwner {
        parameters.maxFundingRateSkew = maxFundingRateSkew;
        emitParameterUpdated(PARAMETER_MAXFUNDINGRATESKEW, maxFundingRateSkew);
    }

    // TODO: Setting this parameter should record funding first.
    function setMaxFundingRateDelta(uint maxFundingRateDelta) external optionalProxy_onlyOwner {
        parameters.maxFundingRateDelta = maxFundingRateDelta;
        emitParameterUpdated(PARAMETER_MAXFUNDINGRATEDELTA, maxFundingRateDelta);
    }

    /* ---------- Market Operations ---------- */

    function _recomputeFunding(uint price) internal returns (uint lastIndex) {
        uint sequenceLength = fundingSequence.length;

        fundingSequence.push(_nextFundingEntry(sequenceLength, price));
        fundingLastRecomputed = block.timestamp;

        return sequenceLength;
    }

    function _liquidateIfNeeded(
        address account,
        uint price,
        uint fundingIndex
    ) internal returns (bool liquidated) {
        uint liquidationFee = _liquidationFee();
        if (_canLiquidate(positions[account], liquidationFee, fundingIndex)) {
            _liquidatePosition(account, account, fundingIndex, price, liquidationFee);
            return true;
        }

        return false;
    }

    function _positionDebtCorrection(Position memory position) internal view returns (int) {
        return
            int(position.margin).sub(
                position.size.multiplyDecimalRound(int(position.lastPrice).add(fundingSequence[position.fundingIndex]))
            );
    }

    function _applyDebtCorrection(Position memory newPosition, Position memory oldPosition) internal {
        int newCorrection = _positionDebtCorrection(newPosition);
        int oldCorrection = _positionDebtCorrection(oldPosition);
        entryDebtCorrection = entryDebtCorrection.add(newCorrection).sub(oldCorrection);
    }

    function _realiseMargin(
        Position storage position,
        uint currentFundingIndex,
        uint price,
        int marginDelta
    ) internal returns (uint) {
        // 1. Determine new margin, ensuring that the result is positive.
        int newMargin =
            int(position.margin).add(
                marginDelta.add(_accruedFunding(position, currentFundingIndex, price)).add(_profitLoss(position, price))
            );
        require(0 <= newMargin, "Withdrawing more than margin");
        uint uMargin = uint(newMargin);

        // Fail if the position can be liquidated after realising the margin
        int positionSize = position.size;
        if (0 != positionSize) {
            require(_liquidationFee() < uMargin, "Position can be liquidated");
        }

        // 2. Update the debt correction
        _applyDebtCorrection(
            Position(uMargin, positionSize, price, currentFundingIndex),
            Position(position.margin, positionSize, position.lastPrice, position.fundingIndex)
        );

        // 3. Update the account's position
        position.margin = uMargin;
        position.lastPrice = price;
        position.fundingIndex = currentFundingIndex;

        return uMargin;
    }

    function _modifyMargin(
        int marginDelta,
        uint price,
        uint fundingIndex,
        address sender
    ) internal {
        Position storage position = positions[sender];

        // Reverts if the position would be liquidated.
        // Note _realiseMargin also updates the system debt with the margin delta, so it's unnecessary here.
        uint remainingMargin_ = _realiseMargin(position, fundingIndex, price, marginDelta);

        // The user can decrease their position as long as:
        //     * they have sufficient margin to do so
        //     * the resulting margin would not be lower than the minimum margin
        //     * the resulting leverage is lower than the maximum leverage
        if (0 < position.size && marginDelta <= 0) {
            require(parameters.minInitialMargin <= remainingMargin_, "Insufficient margin");
            require(
                _abs(_currentLeverage(position, price, remainingMargin_)) < parameters.maxLeverage,
                "Max leverage exceeded"
            );
        }

        // Transfer no tokens if marginDelta is 0
        uint absDelta = _abs(marginDelta);
        if (0 < marginDelta) {
            _manager().burnSUSD(sender, absDelta);
        } else if (marginDelta < 0) {
            _manager().issueSUSD(sender, absDelta);
        }
    }

    function modifyMargin(int marginDelta) external optionalProxy {
        uint price = _assetPriceRequireNotInvalid(_exchangeRates());
        uint fundingIndex = _recomputeFunding(price);
        _modifyMargin(marginDelta, price, fundingIndex, messageSender);
    }

    function withdrawAllMargin() external optionalProxy {
        address sender = messageSender;
        uint price = _assetPriceRequireNotInvalid(_exchangeRates());
        uint fundingIndex = _recomputeFunding(price);
        int marginDelta = -int(_remainingMargin(positions[sender], fundingIndex, price));
        _modifyMargin(marginDelta, price, fundingIndex, sender);
    }

    function _cancelOrder(address account) internal {
        Order storage order = orders[account];
        require(_orderPending(order), "No pending order");

        // Return the order fee to the user.
        uint fee = order.fee;
        if (0 < fee) {
            _manager().issueSUSD(account, fee);
        }

        emitOrderCancelled(order.id, account);
        delete orders[account];
    }

    function cancelOrder() external optionalProxy {
        _cancelOrder(messageSender);
    }

    function _checkMargin(
        Position storage position,
        uint price,
        uint margin,
        int desiredLeverage,
        bool sameSide
    ) internal view {
        int currentLeverage_ = _currentLeverage(position, price, margin);

        // We don't check the margin requirement if leverage is decreasing
        if (sameSide && _abs(currentLeverage_) <= _abs(desiredLeverage)) {
            require(parameters.minInitialMargin <= margin, "Insufficient margin");
        }
    }

    function _checkOrderSize(
        int size,
        int newSize,
        bool sameSide,
        uint play
    ) internal view {
        // Allow users to reduce an order no matter the market conditions.
        if (sameSide && newSize <= size) {
            return;
        }

        // Either the user is flipping sides, or they are increasing an order on the same side they're already on;
        // we check that the side of the market their order is on would not break the limit.

        int newSkew = marketSkew.sub(size).add(newSize);
        int newMarketSize = int(marketSize).sub(_signedAbs(size)).add(_signedAbs(newSize));

        int newSideSize;
        if (0 < newSize) {
            // long case
            newSideSize = newMarketSize.add(newSkew);
        } else {
            // short case
            newSideSize = newMarketSize.sub(newSkew);
        }

        // We'll allow an extra little bit of value over and above the stated max to allow for
        // rounding errors, price movements, multiple orders etc.
        require(_abs(newSideSize.div(2)) <= parameters.maxMarketValue.add(play), "Max market size exceeded");
    }

    function _submitOrder(
        int leverage,
        uint price,
        uint fundingIndex,
        address sender
    ) internal {
        require(_abs(leverage) <= parameters.maxLeverage, "Max leverage exceeded");
        Position storage position = positions[sender];

        // The order is not submitted if the user's existing position needed to be liquidated.
        require(!_canLiquidate(position, _liquidationFee(), fundingIndex), "Position can be liquidated");

        uint margin = _remainingMargin(position, fundingIndex, price);
        int size = position.size;
        bool sameSide = _sameSide(leverage, size);

        // Check that the user has sufficient margin
        _checkMargin(position, price, margin, leverage, sameSide);

        // Check that the order isn't too large for the market
        // Note that this in principle allows several orders to be placed at once
        // that collectively violate the maximum, but this is checked again when
        // the orders are confirmed.
        _checkOrderSize(
            size,
            int(margin).multiplyDecimalRound(leverage).divideDecimalRound(int(price)),
            sameSide,
            100 * uint(_UNIT) // a bit of extra value in case of rounding errors
        );

        // Cancel any open order
        Order storage order = orders[sender];
        if (_orderPending(order)) {
            _cancelOrder(sender);
        }

        // TODO: Charge this out of margin (also update _cancelOrder, and compute this before _checkMargin)
        // Compute the fee owed and check their sUSD balance is sufficient to cover it.
        uint fee = _orderFee(margin, leverage, size, price);
        if (0 < fee) {
            require(fee <= _sUSD().balanceOf(sender), "Insufficient balance");
            _manager().burnSUSD(sender, fee);
        }

        // Lodge the order, which can be confirmed at the next price update
        uint roundId = _currentRoundId(_exchangeRates());
        uint id = _nextOrderId;
        _nextOrderId += 1;

        order.id = id;
        order.leverage = leverage;
        order.fee = fee;
        order.roundId = roundId;
        emitOrderSubmitted(id, sender, leverage, fee, roundId);
    }

    function submitOrder(int leverage) external optionalProxy {
        uint price = _assetPriceRequireNotInvalid(_exchangeRates());
        uint fundingIndex = _recomputeFunding(price);
        _submitOrder(leverage, price, fundingIndex, messageSender);
    }

    function closePosition() external optionalProxy {
        uint price = _assetPriceRequireNotInvalid(_exchangeRates());
        uint fundingIndex = _recomputeFunding(price);
        _submitOrder(0, price, fundingIndex, messageSender);
    }

    // TODO: Do we really need this function?
    function modifyMarginAndSubmitOrder(int marginDelta, int leverage) external optionalProxy {
        uint price = _assetPriceRequireNotInvalid(_exchangeRates());
        uint fundingIndex = _recomputeFunding(price);
        address sender = messageSender;
        _modifyMargin(marginDelta, price, fundingIndex, sender);
        _submitOrder(leverage, price, fundingIndex, sender);
    }

    // TODO: Ensure that this is fine if the position is swapping sides
    // TODO: Check that everything is fine if a position already exists.
    function confirmOrder(address account) external optionalProxy {
        uint price = _assetPriceRequireNotInvalid(_exchangeRates());
        require(price != 0, "Zero entry price. Cancel order and try again.");

        uint fundingIndex = _recomputeFunding(price);

        require(_orderPending(orders[account]), "No pending order");
        Order memory order = orders[account];

        // TODO: Verify that we can actually rely on the round id monotonically increasing
        require(order.roundId < _currentRoundId(_exchangeRates()), "Awaiting next price");

        Position storage position = positions[account];

        // You can't outrun an impending liquidation by closing your position quickly, for example.
        require(!_canLiquidate(position, _liquidationFee(), fundingIndex), "Position can be liquidated");

        // We weren't liquidated, so we realise the margin to compute the new position size.
        uint margin = _realiseMargin(position, fundingIndex, price, 0);
        int newSize = int(margin).multiplyDecimalRound(order.leverage).divideDecimalRound(int(price));
        int positionSize = position.size;

        // Before continuing, check that their order is actually allowed given the market size limit.
        // Give an extra percentage of play in case of multiple orders were submitted simultaneously or the price moved.
        _checkOrderSize(
            positionSize,
            newSize,
            _sameSide(positionSize, newSize),
            uint(int(parameters.maxMarketValue).multiplyDecimalRound(int(_MAX_MARKET_VALUE_PLAY_FACTOR)))
        );

        // Update the market size and skew, checking that the maximums are not exceeded
        marketSkew = marketSkew.add(newSize).sub(positionSize);
        marketSize = marketSize.add(_abs(newSize)).sub(_abs(positionSize));

        // Apply debt corrections
        // TODO: This can be made more efficient given that _realiseMargin already applied a correction
        //       e.g. skip the correction inside that function and do it all here.
        _applyDebtCorrection(
            Position(0, newSize, price, fundingIndex),
            Position(0, positionSize, position.lastPrice, position.fundingIndex)
        );

        // Send the fee to the fee pool
        if (0 < order.fee) {
            _manager().issueSUSD(_feePool().FEE_ADDRESS(), order.fee);
        }

        // Actually lodge the position and delete the order
        // Updating the margin was already handled in _realiseMargin
        if (newSize == 0) {
            // If the position is being closed, we no longer need to track these details.
            delete position.size;
            delete position.lastPrice;
            delete position.fundingIndex;
        } else {
            position.size = newSize;
            position.lastPrice = price;
            position.fundingIndex = fundingIndex;
        }
        delete orders[account];
        emitOrderConfirmed(order.id, account, margin, newSize, price, fundingIndex);
    }

    function _liquidatePosition(
        address account,
        address liquidator,
        uint fundingIndex,
        uint price,
        uint liquidationFee
    ) internal {
        // If there are any pending orders, the liquidation will cancel them.
        if (_orderPending(orders[account])) {
            _cancelOrder(account);
        }

        Position storage position = positions[account];

        // Retrieve the liquidation price before we close the order.
        uint lPrice = _liquidationPrice(position, true, fundingIndex, price);

        // Record updates to market size and debt.
        int positionSize = position.size;
        marketSkew = marketSkew.sub(positionSize);
        marketSize = marketSize.sub(_abs(positionSize));

        // TODO: validate the correctness here (in particular of using the liquidation price)
        _applyDebtCorrection(
            Position(0, 0, lPrice, fundingIndex),
            Position(position.margin, positionSize, position.lastPrice, position.fundingIndex)
        );

        // Close the position itself.
        delete positions[account];

        // Issue the reward to the liquidator.
        _manager().issueSUSD(liquidator, liquidationFee);

        emitPositionLiquidated(account, liquidator, positionSize, lPrice);
    }

    function liquidatePosition(address account) external optionalProxy {
        uint price = _assetPriceRequireNotInvalid(_exchangeRates());
        uint fundingIndex = _recomputeFunding(price);

        uint liquidationFee = _liquidationFee();
        require(_canLiquidate(positions[account], liquidationFee, fundingIndex), "Position cannot be liquidated");

        // If there are any pending orders, the liquidation will cancel them.
        if (_orderPending(orders[account])) {
            _cancelOrder(account);
        }

        _liquidatePosition(account, messageSender, fundingIndex, price, liquidationFee);
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

    event OrderSubmitted(uint indexed id, address indexed account, int leverage, uint fee, uint indexed roundId);
    bytes32 internal constant SIG_ORDERSUBMITTED = keccak256("OrderSubmitted(uint256,address,int256,uint256,uint256)");

    function emitOrderSubmitted(
        uint id,
        address account,
        int leverage,
        uint fee,
        uint roundId
    ) internal {
        proxy._emit(
            abi.encode(leverage, fee),
            4,
            SIG_ORDERSUBMITTED,
            bytes32(id),
            addressToBytes32(account),
            bytes32(roundId)
        );
    }

    event OrderConfirmed(uint indexed id, address indexed account, uint margin, int size, uint price, uint fundingIndex);
    bytes32 internal constant SIG_ORDERCONFIRMED =
        keccak256("OrderConfirmed(uint256,address,uint256,int256,uint256,uint256)");

    function emitOrderConfirmed(
        uint id,
        address account,
        uint margin,
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
