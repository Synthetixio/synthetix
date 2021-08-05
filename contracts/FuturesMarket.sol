pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./Proxyable.sol";
import "./MixinFuturesMarketSettings.sol";
import "./interfaces/IFuturesMarket.sol";

// Libraries
import "openzeppelin-solidity-2.3.0/contracts/math/SafeMath.sol";
import "./SignedSafeMath.sol";
import "./SignedSafeDecimalMath.sol";

// Internal references
import "./interfaces/IExchangeRates.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IFuturesMarketSettings.sol";

// Remaining Functionality
//     Rename marketSize, marketSkew, marketDebt, profitLoss, accruedFunding -> size, skew, debt, profit, funding

/* Notes:
 *
 * Internal functions assume:
 *    - prices passed into them are valid;
 *    - funding has already been recomputed up to the current time (hence unrecorded funding is nil);
 *    - the account being managed was not liquidated in the same transaction;
 */

interface IFuturesMarketManagerInternal {
    function issueSUSD(address account, uint amount) external;

    function burnSUSD(address account, uint amount) external returns (uint postReclamationAmount);

    function payFee(uint amount) external;
}

// https://docs.synthetix.io/contracts/source/contracts/futuresmarket
contract FuturesMarket is Owned, Proxyable, MixinFuturesMarketSettings, IFuturesMarket {
    /* ========== LIBRARIES ========== */

    using SafeMath for uint;
    using SignedSafeMath for int;
    using SignedSafeDecimalMath for int;

    /* ========== CONSTANTS ========== */

    int private constant _UNIT = int(10**uint(18));
    // Orders can potentially move the market past its configured max by up to 2 %
    uint private constant _MAX_MARKET_VALUE_PLAY_FACTOR = (2 * uint(_UNIT)) / 100;

    /* ========== STATE VARIABLES ========== */

    bytes32 public baseAsset;

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

    mapping(address => Order) public orders;
    mapping(address => Position) public positions;

    /*
     * This holds the value: sum_{p in positions}{p.margin - p.size * (p.lastPrice + fundingSequence[p.fundingIndex])}
     * Then marketSkew * (_assetPrice() + _marketDebt()) + _entryDebtCorrection yields the total system debt,
     * which is equivalent to the sum of remaining margins in all positions.
     */
    int internal _entryDebtCorrection;

    uint internal _nextOrderId = 1; // Zero reflects an order that does not exist

    /* ---------- Address Resolver Configuration ---------- */

    bytes32 internal constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 internal constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 internal constant CONTRACT_SYNTHSUSD = "SynthsUSD";
    bytes32 internal constant CONTRACT_FUTURESMARKETMANAGER = "FuturesMarketManager";
    bytes32 internal constant CONTRACT_FUTURESMARKETSETTINGS = "FuturesMarketSettings";

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address payable _proxy,
        address _owner,
        address _resolver,
        bytes32 _baseAsset
    ) public Owned(_owner) Proxyable(_proxy) MixinFuturesMarketSettings(_resolver) {
        baseAsset = _baseAsset;

        // Initialise the funding sequence with 0 initially accrued, so that the first usable funding index is 1.
        fundingSequence.push(0);
    }

    /* ========== VIEWS ========== */

    /* ---------- External Contracts ---------- */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinFuturesMarketSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](5);
        newAddresses[0] = CONTRACT_SYSTEMSTATUS;
        newAddresses[1] = CONTRACT_EXRATES;
        newAddresses[2] = CONTRACT_SYNTHSUSD;
        newAddresses[3] = CONTRACT_FUTURESMARKETMANAGER;
        newAddresses[4] = CONTRACT_FUTURESMARKETSETTINGS;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    function _manager() internal view returns (IFuturesMarketManagerInternal) {
        return IFuturesMarketManagerInternal(requireAndGetAddress(CONTRACT_FUTURESMARKETMANAGER));
    }

    function _marketSettings() internal view returns (IFuturesMarketSettings) {
        return IFuturesMarketSettings(requireAndGetAddress(CONTRACT_FUTURESMARKETSETTINGS));
    }

    function _exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES));
    }

    function _sUSD() internal view returns (IERC20) {
        return IERC20(requireAndGetAddress(CONTRACT_SYNTHSUSD));
    }

    /* ---------- Market Details ---------- */

    function _assetPrice(IExchangeRates exchangeRates) internal view returns (uint price, bool invalid) {
        return exchangeRates.rateAndInvalid(baseAsset);
    }

    function _assetPriceRequireNotInvalid() internal view returns (uint) {
        (uint price, bool invalid) = _assetPrice(_exchangeRates());
        require(!(invalid || price == 0), "Invalid price");
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
        int sizeLimit = int(_maxMarketValue(baseAsset)).divideDecimalRound(int(price));
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
                _entryDebtCorrection
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

    function parameters()
        external
        view
        returns (
            uint takerFee,
            uint makerFee,
            uint closureFee,
            uint maxLeverage,
            uint maxMarketValue,
            uint maxFundingRate,
            uint maxFundingRateSkew,
            uint maxFundingRateDelta
        )
    {
        return _parameters(baseAsset);
    }

    function _currentFundingRatePerSecond() internal view returns (int) {
        return _currentFundingRate() / 1 days;
    }

    function _currentFundingRate() internal view returns (int) {
        int maxFundingRate = int(_maxFundingRate(baseAsset));
        int maxFundingRateSkew = int(_maxFundingRateSkew(baseAsset));
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

    function canConfirmOrder(address account) external view returns (bool) {
        IExchangeRates exRates = _exchangeRates();
        (uint price, bool invalid) = _assetPrice(exRates);
        Order storage order = orders[account];
        Position storage position = positions[account];
        uint fundingSequenceIndex = fundingSequence.length;
        (uint prevPrice, ) = _exchangeRates().rateAndTimestampAtRound(baseAsset, order.roundId);
        return
            !invalid && // Price is valid
            price != 0 &&
            _orderPending(order) && // There is actually an order
            order.roundId < _currentRoundId(exRates) && // A new price has arrived
            int(prevPrice) < int(price).multiplyDecimalRound(int(_UNIT) + int(order.maxSlippage)) && // slippage
            int(prevPrice) > int(price).multiplyDecimalRound(-int(_UNIT) + int(order.maxSlippage)) &&
            !_canLiquidate(position, _liquidationFee(), fundingSequenceIndex, price) && // No existing position can be liquidated
            0 <= _marginPlusProfitFunding(position, fundingSequenceIndex, price).sub(int(order.fee)); // Margin has not dipped negative due to fees, profit, funding
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

    function _marginPlusProfitFunding(
        Position storage position,
        uint endFundingIndex,
        uint price
    ) internal view returns (int) {
        return int(position.margin).add(_profitLoss(position, price)).add(_accruedFunding(position, endFundingIndex, price));
    }

    function _remainingMargin(
        Position storage position,
        uint endFundingIndex,
        uint price
    ) internal view returns (uint) {
        int remaining = _marginPlusProfitFunding(position, endFundingIndex, price);

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
        uint fundingIndex,
        uint price
    ) internal view returns (bool) {
        // No liquidating empty positions.
        if (position.size == 0) {
            return false;
        }

        return _remainingMargin(position, fundingIndex, price) <= liquidationFee;
    }

    function canLiquidate(address account) external view returns (bool) {
        (uint price, bool invalid) = _assetPrice(_exchangeRates());
        return !invalid && _canLiquidate(positions[account], _liquidationFee(), fundingSequence.length, price);
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
        int existingNotional = existingSize.multiplyDecimalRound(int(price));

        // Charge the closure fee if closing a position entirely.
        if (margin == 0 || leverage == 0) {
            return _abs(existingNotional.multiplyDecimalRound(int(_closureFee(baseAsset))));
        }

        int newNotional = int(margin).multiplyDecimalRound(leverage);
        int notionalDiff = newNotional;
        if (_sameSide(newNotional, existingNotional)) {
            // If decreasing a position, charge the closure fee.
            if (_abs(newNotional) <= _abs(existingNotional)) {
                return _abs(existingNotional.sub(newNotional).multiplyDecimalRound(int(_closureFee(baseAsset))));
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
            return _abs(notionalDiff.multiplyDecimalRound(int(_takerFee(baseAsset))));
        }

        // Otherwise if the order is opposite to the skew,
        // the maker fee is charged on new notional value up to the size of the existing skew,
        // and the taker fee is charged on any new skew they induce on the order's side of the market.

        int makerFee = int(_makerFee(baseAsset));
        int fee = notionalDiff.multiplyDecimalRound(makerFee);

        // The notional value of the skew after the order is filled
        int postSkewNotional = skew.multiplyDecimalRound(int(price)).sub(existingNotional).add(newNotional);

        // The order is sufficient to flip the skew, charge/rebate the difference in fees
        // between maker and taker on the new skew value.
        if (_sameSide(newNotional, postSkewNotional)) {
            fee = fee.add(postSkewNotional.multiplyDecimalRound(int(_takerFee(baseAsset)).sub(makerFee)));
        }

        return _abs(fee);
    }

    function orderFee(address account, int leverage) external view returns (uint fee, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        Position storage position = positions[account];
        uint margin = _remainingMargin(position, fundingSequence.length, price);
        return (_orderFee(margin, leverage, position.size, price), isInvalid);
    }

    function orderFeeWithMarginDelta(
        address account,
        int marginDelta,
        int leverage
    ) external view returns (uint fee, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        Position storage position = positions[account];
        int margin = _marginPlusProfitFunding(position, fundingSequence.length, price).add(marginDelta);
        if (margin < 0) {
            margin = 0;
        }
        return (_orderFee(uint(margin), leverage, position.size, price), isInvalid);
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

    /* ---------- Market Operations ---------- */

    function _recomputeFunding(uint price) internal returns (uint lastIndex) {
        uint sequenceLength = fundingSequence.length;

        fundingSequence.push(_nextFundingEntry(sequenceLength, price));
        fundingLastRecomputed = block.timestamp;

        return sequenceLength;
    }

    function recomputeFunding() external returns (uint lastIndex) {
        require(msg.sender == address(_marketSettings()), "Can be invoked by marketSettings only");
        return _recomputeFunding(_assetPriceRequireNotInvalid());
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
        _entryDebtCorrection = _entryDebtCorrection.add(newCorrection).sub(oldCorrection);
    }

    function _realiseMargin(
        Position storage position,
        uint currentFundingIndex,
        uint price,
        int marginDelta
    ) internal returns (uint) {
        // 1. Determine new margin, ensuring that the result is positive.
        int newMargin = _marginPlusProfitFunding(position, currentFundingIndex, price).add(marginDelta);
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
        // Transfer no tokens if marginDelta is 0
        uint absDelta = _abs(marginDelta);
        if (0 < marginDelta) {
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
        }

        Position storage position = positions[sender];

        // Reverts if the position would be liquidated.
        // Note _realiseMargin also updates the system debt with the margin delta, so it's unnecessary here.
        uint remainingMargin_ = _realiseMargin(position, fundingIndex, price, marginDelta);

        // The user can decrease their position as long as:
        //     * they have sufficient margin to do so
        //     * the resulting margin would not be lower than the minimum margin
        //     * the resulting leverage is lower than the maximum leverage
        if (0 < position.size && marginDelta <= 0) {
            require(_minInitialMargin() <= remainingMargin_, "Insufficient margin");
            require(
                _abs(_currentLeverage(position, price, remainingMargin_)) < _maxLeverage(baseAsset),
                "Max leverage exceeded"
            );
        }
    }

    function modifyMargin(int marginDelta) external optionalProxy {
        uint price = _assetPriceRequireNotInvalid();
        uint fundingIndex = _recomputeFunding(price);
        _modifyMargin(marginDelta, price, fundingIndex, messageSender);
    }

    function withdrawAllMargin() external optionalProxy {
        address sender = messageSender;
        uint price = _assetPriceRequireNotInvalid();
        uint fundingIndex = _recomputeFunding(price);
        int marginDelta = -int(_remainingMargin(positions[sender], fundingIndex, price));
        _modifyMargin(marginDelta, price, fundingIndex, sender);
    }

    function _cancelOrder(address account) internal {
        Order storage order = orders[account];
        require(_orderPending(order), "No pending order");
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
        uint fee,
        bool sameSide
    ) internal view {
        int currentLeverage_ = _currentLeverage(position, price, margin);

        // We don't check the margin requirement if leverage is decreasing
        if (sameSide && _abs(currentLeverage_) <= _abs(desiredLeverage)) {
            // minMargin + fee <= margin is equivalent to minMargin <= margin - fee
            // except that we get a nicer error message if fee > margin, rather than arithmetic overflow.
            require(_minInitialMargin().add(fee) <= margin, "Insufficient margin");
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
            // long case: marketSize + skew = 2 * longSize
            newSideSize = newMarketSize.add(newSkew);
        } else {
            // short case: marketSize - skew = 2 * shortSize
            newSideSize = newMarketSize.sub(newSkew);
        }
        // newSideSize still includes an extra factor of 2 here, so we will divide by 2 in the require statement.

        // We'll allow an extra little bit of value over and above the stated max to allow for
        // rounding errors, price movements, multiple orders etc.
        require(_abs(newSideSize.div(2)) <= _maxMarketValue(baseAsset).add(play), "Max market size exceeded");
    }

    function _submitOrder(
        int leverage,
        uint price,
        uint maxSlippage,
        uint fundingIndex,
        address sender
    ) internal {
        require(_abs(leverage) <= _maxLeverage(baseAsset), "Max leverage exceeded");
        Position storage position = positions[sender];

        // The order is not submitted if the user's existing position needed to be liquidated.
        // We know that the price is not invalid now that we're in this function
        require(!_canLiquidate(position, _liquidationFee(), fundingIndex, price), "Position can be liquidated");

        uint margin = _remainingMargin(position, fundingIndex, price);
        int size = position.size;
        bool sameSide = _sameSide(leverage, size);

        // TODO: Charge this out of margin (also update _cancelOrder, and compute this before _checkMargin)
        // Compute the fee owed, which will be charged to the margin after the order is confirmed.
        uint fee = _orderFee(margin, leverage, size, price);

        // Check that the user has sufficient margin
        _checkMargin(position, price, margin, leverage, fee, sameSide);

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

        // Lodge the order, which can be confirmed at the next price update
        uint roundId = _currentRoundId(_exchangeRates());
        uint id = _nextOrderId;
        _nextOrderId += 1;

        order.id = id;
        order.leverage = leverage;
        order.fee = fee;
        order.roundId = roundId;
        order.maxSlippage = maxSlippage;
        emitOrderSubmitted(id, sender, leverage, fee, roundId);
    }

    function submitOrder(int leverage, uint maxSlippage) external optionalProxy {
        uint price = _assetPriceRequireNotInvalid();
        uint fundingIndex = _recomputeFunding(price);
        _submitOrder(leverage, price, maxSlippage, fundingIndex, messageSender);
    }

    function closePosition() external optionalProxy {
        uint price = _assetPriceRequireNotInvalid();
        uint fundingIndex = _recomputeFunding(price);
        _submitOrder(0, price, 2**256 - 1, fundingIndex, messageSender);
    }

    function modifyMarginAndSubmitOrder(
        int marginDelta,
        int leverage,
        uint maxSlippage
    ) external optionalProxy {
        uint price = _assetPriceRequireNotInvalid();
        uint fundingIndex = _recomputeFunding(price);
        address sender = messageSender;
        _modifyMargin(marginDelta, price, fundingIndex, sender);
        _submitOrder(leverage, price, maxSlippage, fundingIndex, sender);
    }

    // TODO: Ensure that this is fine if the position is swapping sides
    // TODO: Check that everything is fine if a position already exists.
    function confirmOrder(address account) external optionalProxy {
        uint price = _assetPriceRequireNotInvalid();
        uint fundingIndex = _recomputeFunding(price);

        require(_orderPending(orders[account]), "No pending order");
        Order memory order = orders[account];

        // TODO: Verify that we can actually rely on the round id monotonically increasing
        require(order.roundId < _currentRoundId(_exchangeRates()), "Awaiting next price");

        // Check for price slippage.
        (uint prevPrice, ) = _exchangeRates().rateAndTimestampAtRound(baseAsset, order.roundId);
        require(
            int(prevPrice) < int(price).multiplyDecimalRound(int(_UNIT) + int(order.maxSlippage)) &&
                int(prevPrice) > int(price).multiplyDecimalRound(-int(_UNIT) + int(order.maxSlippage)),
            "exceeds slippage tolerance"
        );
        // if (newSize > 0) {
        // }

        Position storage position = positions[account];

        // You can't outrun an impending liquidation by closing your position quickly, for example.
        require(!_canLiquidate(position, _liquidationFee(), fundingIndex, price), "Position can be liquidated");

        // We weren't liquidated, so we realise the margin to compute the new position size.
        // The fee is deducted at this stage; the transaction will revert if the realised margin minus the fee is negative.
        uint margin = _realiseMargin(position, fundingIndex, price, -int(order.fee));
        // The order size is computed pre-fee, so the order size is accurate, though their leverage may
        // be slightly higher than what was requested if the fee is nonzero.
        int newSize = int(margin.add(order.fee)).multiplyDecimalRound(order.leverage).divideDecimalRound(int(price));
        int positionSize = position.size;

        // Before continuing, check that their order is actually allowed given the market size limit.
        // Give an extra percentage of play in case of multiple orders were submitted simultaneously or the price moved.
        _checkOrderSize(
            positionSize,
            newSize,
            _sameSide(positionSize, newSize),
            uint(int(_maxMarketValue(baseAsset)).multiplyDecimalRound(int(_MAX_MARKET_VALUE_PLAY_FACTOR)))
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
            _manager().payFee(order.fee);
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
        uint price = _assetPriceRequireNotInvalid();
        uint fundingIndex = _recomputeFunding(price);

        uint liquidationFee = _liquidationFee();
        require(_canLiquidate(positions[account], liquidationFee, fundingIndex, price), "Position cannot be liquidated");

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
