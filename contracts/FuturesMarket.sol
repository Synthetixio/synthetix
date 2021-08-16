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
 * long-short skew in the market. It is therefore in the interest of the system to reduce the this skew.
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
 *     - FuturesMarket.sol:         one of these exists per asset. Margin is maintained isolated per market.
 *
 *     - FuturesMarketManager.sol:  the manager keeps track of which markets exist, and is the main window between
 *                                  futures markets and the rest of the system. It accumulates the total debt
 *                                  over all markets, and issues and burns sUSD on each market's behalf.
 *
 *     - FuturesMarketSettings.sol: Holds the settings for each market in the global FlexibleStorage instance used
 *                                  by SystemSettings, and provides an interface to modify these values. Other than
 *                                  the base asset, these settings determine the behaviour of each market.
 *                                  See that contract for descriptions of the meanings of each setting.
 *
 * Each futures market and the manager operates behind a proxy, and for efficiency they communicate with one another
 * using their underlying implementations.
 *
 * Technical note: internal functions within the FuturesMarket contract assume the following:
 *
 *     - prices passed into them are valid;
 *
 *     - funding has already been recomputed up to the current time (hence unrecorded funding is nil);
 *
 *     - the account being managed was not liquidated in the same transaction;
 */

interface IFuturesMarketManagerInternal {
    function issueSUSD(address account, uint amount) external;

    function burnSUSD(address account, uint amount) external returns (uint postReclamationAmount);

    function payFee(uint amount) external;
}

// https://docs.synthetix.io/contracts/source/contracts/FuturesMarket
contract FuturesMarket is Owned, Proxyable, MixinFuturesMarketSettings, IFuturesMarket {
    /* ========== LIBRARIES ========== */

    using SafeMath for uint;
    using SignedSafeMath for int;
    using SignedSafeDecimalMath for int;

    /* ========== CONSTANTS ========== */

    // This is the same unit as used inside `SignedSafeDecimalMath`.
    int private constant _UNIT = int(10**uint(18));
    // Orders can potentially move the market past its configured max by up to 5%.
    uint private constant _MAX_MARKET_VALUE_PLAY_FACTOR = (5 * uint(_UNIT)) / 100;

    /* ========== STATE VARIABLES ========== */

    // The asset being traded in this market. This should be a valid key into the ExchangeRates contract.
    bytes32 public baseAsset;

    // The total number of base units in long and short positions.
    uint public marketSize;

    /*
     * The net position in base units of the whole market.
     * When this is positive, longs outweigh shorts. When it is negative, shorts outweigh longs.
     */
    int public marketSkew;

    /*
     * The funding sequence allows constant-time calculation of the funding owed to a given position.
     * Each entry in the sequence holds the net funding accumulated per base unit since the market was created.
     * Then to obtain the net funding over a particular interval, subtract the start point's sequence entry
     * from the end point's sequence entry.
     * Positions contain the funding sequence entry at the time they were confirmed; so to compute
     * the net funding on a given position, obtain from this sequence the net funding per base unit
     * since the position was confirmed and multiply it by the position size.
     */
    uint public fundingLastRecomputed;
    int[] public fundingSequence;

    /*
     * Each user's order and position.
     * Multiple positions can always be merged, so each user can only have one position at a time.
     */
    mapping(address => Order) public orders;
    mapping(address => Position) public positions;

    /*
     * This holds the value: sum_{p in positions}{p.margin - p.size * (p.lastPrice + fundingSequence[p.fundingIndex])}
     * Then marketSkew * (_assetPrice() + _marketDebt()) + _entryDebtCorrection yields the total system debt,
     * which is equivalent to the sum of remaining margins in all positions.
     */
    int internal _entryDebtCorrection;

    // This increments for each order; zero reflects an order that does not exist.
    uint internal _nextOrderId = 1;

    // Holds the revert message for each type of error.
    mapping(uint8 => string) internal _errorMessages;

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

        // Set up the mapping between error codes and their revert messages.
        _errorMessages[uint8(Status.NoOrderExists)] = "No pending order";
        _errorMessages[uint8(Status.AwaitingPriceUpdate)] = "Awaiting next price";
        _errorMessages[uint8(Status.PriceOutOfBounds)] = "Price out of acceptable range";
        _errorMessages[uint8(Status.InvalidPrice)] = "Invalid price";
        _errorMessages[uint8(Status.CanLiquidate)] = "Position can be liquidated";
        _errorMessages[uint8(Status.CannotLiquidate)] = "Position cannot be liquidated";
        _errorMessages[uint8(Status.MaxMarketSizeExceeded)] = "Max market size exceeded";
        _errorMessages[uint8(Status.MaxLeverageExceeded)] = "Max leverage exceeded";
        _errorMessages[uint8(Status.InsufficientMargin)] = "Insufficient margin";
        _errorMessages[uint8(Status.NotPermitted)] = "Not permitted by this address";
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
        (uint _price, bool _invalid) = exchangeRates.rateAndInvalid(baseAsset);
        // Ensure we catch uninitialised rates
        return (_price, _invalid || _price == 0);
    }

    /*
     * The current base price, reverting if it is invalid.
     */
    function _assetPriceRequireNotInvalid() internal view returns (uint) {
        (uint price, bool invalid) = _assetPrice(_exchangeRates());
        _revertIfError(invalid, Status.InvalidPrice);
        return price;
    }

    /*
     * The current base price from the oracle, and whether that price was invalid. Zero prices count as invalid.
     */
    function assetPrice() external view returns (uint price, bool invalid) {
        return _assetPrice(_exchangeRates());
    }

    function _currentRoundId(IExchangeRates exchangeRates) internal view returns (uint roundId) {
        return exchangeRates.getCurrentRoundId(baseAsset);
    }

    /*
     * The current ChainLink round id from the oracle for the base asset price.
     */
    function currentRoundId() external view returns (uint roundId) {
        return _currentRoundId(_exchangeRates());
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

    function _maxOrderSizes(uint price) internal view returns (uint, uint) {
        (uint long, uint short) = _marketSizes();
        int sizeLimit = int(_maxMarketValue(baseAsset)).divideDecimalRound(int(price));
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
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        (uint longSize, uint shortSize) = _maxOrderSizes(price);
        return (longSize, shortSize, isInvalid);
    }

    function _marketDebt(uint price) internal view returns (uint) {
        int totalDebt =
            marketSkew.multiplyDecimalRound(int(price).add(_nextFundingEntry(fundingSequence.length, price))).add(
                _entryDebtCorrection
            );

        return uint(_max(totalDebt, 0));
    }

    /*
     * The total debt contributed by this market to the Synthetix system.
     * The total market debt is equivalent to the sum of remaining margins in all open positions.
     */
    function marketDebt() external view returns (uint debt, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        return (_marketDebt(price), isInvalid);
    }

    /*
     * The size of the skew relative to the size of the market. This value ranges between 0 and 1.
     */
    function _proportionalSkew() internal view returns (int) {
        int signedSize = int(marketSize);
        if (signedSize == 0) {
            return 0;
        }
        return marketSkew.divideDecimalRound(signedSize);
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

    /*
     * The current funding rate as determined by the market skew; this is returned as a percentage per day.
     * If this is positive, shorts pay longs, if it is negative, longs pay shorts.
     */
    function currentFundingRate() external view returns (int) {
        return _currentFundingRate();
    }

    /*
     * The current funding rate, rescaled to a percentage per second.
     */
    function _currentFundingRatePerSecond() internal view returns (int) {
        return _currentFundingRate() / 1 days;
    }

    function _unrecordedFunding(uint price) internal view returns (int funding) {
        int elapsed = int(block.timestamp.sub(fundingLastRecomputed));
        return _currentFundingRatePerSecond().multiplyDecimalRound(int(price)).mul(elapsed);
    }

    /*
     * The funding per base unit accrued since the funding rate was last recomputed, which has not yet
     * been persisted in the funding sequence.
     */
    function unrecordedFunding() external view returns (int funding, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        return (_unrecordedFunding(price), isInvalid);
    }

    /*
     * The new entry in the funding sequence, appended when funding is recomputed. It is the sum of the
     * last entry and the unrecorded funding, so the sequence accumulates running total over the market's lifetime.
     */
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

        // If the end index is not later than the start index, no funding has accrued.
        if (endIndex <= startIndex) {
            return 0;
        }

        // Determine whether we should include unrecorded funding.
        if (endIndex == sequenceLength) {
            result = _nextFundingEntry(sequenceLength, price);
        } else {
            result = fundingSequence[endIndex];
        }

        // Compute the net difference between start and end indices.
        return result.sub(fundingSequence[startIndex]);
    }

    /*
     * Computes the net funding that was accrued between any two funding sequence indices.
     * If endIndex is equal to the funding sequence length, then unrecorded funding will be included.
     */
    function netFundingPerUnit(uint startIndex, uint endIndex) external view returns (int funding, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        return (_netFundingPerUnit(startIndex, endIndex, fundingSequence.length, price), isInvalid);
    }

    /*
     * The number of entries in the funding sequence.
     */
    function fundingSequenceLength() external view returns (uint) {
        return fundingSequence.length;
    }

    /* ---------- Position Details ---------- */

    function _orderPending(Order storage order) internal view returns (bool pending) {
        return order.id != 0;
    }

    /*
     * True if and only if the specified order actually exists.
     */
    function orderPending(address account) external view returns (bool pending) {
        return _orderPending(orders[account]);
    }

    /*
     * The position size that a given margin/leverage/price would produce.
     */
    function _orderSize(
        uint price,
        uint margin,
        int leverage
    ) internal pure returns (int) {
        return int(margin).multiplyDecimalRound(leverage).divideDecimalRound(int(price));
    }

    /*
     * The position size that a given order would receive if it was confirmed at the current price.
     */
    function orderSize(address account) external view returns (int size, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        Position storage position = positions[account];
        Order storage order = orders[account];
        return (_orderSize(price, _remainingMargin(position, fundingSequence.length, price), order.leverage), isInvalid);
    }

    /*
     * The maximum order size at current prices, with a little bit of extra freedom.
     */
    function _maxSize(
        uint price,
        uint maxValue,
        uint play
    ) internal pure returns (uint) {
        return uint(int(maxValue.add(play)).divideDecimalRound(int(price)));
    }

    /*
     * Determines whether a change in a position's size would violate the max market value constraint.
     */
    function _orderSizeSmallEnough(
        uint maxSize,
        int oldSize,
        int newSize
    ) internal view returns (Status) {
        // Allow users to reduce an order no matter the market conditions.
        if (_sameSide(oldSize, newSize) && _abs(newSize) <= _abs(oldSize)) {
            return Status.Ok;
        }

        // Either the user is flipping sides, or they are increasing an order on the same side they're already on;
        // we check that the side of the market their order is on would not break the limit.
        int newSkew = marketSkew.sub(oldSize).add(newSize);
        int newMarketSize = int(marketSize).sub(_signedAbs(oldSize)).add(_signedAbs(newSize));

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
            return Status.MaxMarketSizeExceeded;
        }

        return Status.Ok;
    }

    /*
     * Determines the current status of an order. If the order cannot be confirmed, an error is returned indicating
     * why. If Error.Ok is returned, then the order is confirmable. This also returns a few results to save on
     * extra calculations at the call site.
     */
    function _orderStatusDetails(
        uint price,
        uint fundingIndex,
        address account
    )
        internal
        view
        returns (
            uint newMargin,
            int newSize,
            uint orderFee_,
            Status status
        )
    {
        // TODO: Ensure that this is fine if the position is swapping sides
        // TODO: Check that everything is fine if a position already exists.
        // Is an order is pending?
        if (!_orderPending(orders[account])) {
            return (0, 0, 0, Status.NoOrderExists);
        }

        Order memory order = orders[account];

        // Has the price updated?
        // TODO: Verify that we can actually rely on the round id monotonically increasing
        if (_currentRoundId(_exchangeRates()) <= order.roundId) {
            return (0, 0, 0, Status.AwaitingPriceUpdate);
        }

        // Is the price within the acceptable range?
        if (price < order.minPrice || order.maxPrice < price) {
            return (0, 0, 0, Status.PriceOutOfBounds);
        }

        Position storage position = positions[account];

        // Can the existing position be liquidated?
        // You can't outrun an impending liquidation by closing your position quickly, for example.
        if (_canLiquidate(position, _liquidationFee(), fundingIndex, price)) {
            return (0, 0, 0, Status.CanLiquidate);
        }

        // We weren't liquidated, so we realise the margin to compute the new position size.
        // The fee is deducted at this stage; it is an error if the realised margin minus the fee
        // is negative or subject to liquidation.
        uint fee = order.fee;
        (uint margin, Status marginStatus) = _realisedMargin(position, fundingIndex, price, -int(fee));
        if (_isError(marginStatus)) {
            return (margin, 0, fee, marginStatus);
        }

        // The fee is added back in because order size is computed pre-fee, though their leverage will
        // be slightly higher than what was requested if the fee is nonzero.
        int size = _orderSize(price, margin.add(fee), order.leverage);

        // Ensure the order is actually allowed given the market size limit.
        // Give an extra percentage of play in case multiple orders were submitted simultaneously or the price moved.
        uint maxMarketValue = _maxMarketValue(baseAsset);
        uint maxMarketSize =
            _maxSize(
                price,
                maxMarketValue,
                uint(int(maxMarketValue).multiplyDecimalRound(int(_MAX_MARKET_VALUE_PLAY_FACTOR)))
            );
        Status marketSizeStatus = _orderSizeSmallEnough(maxMarketSize, position.size, size);
        return (margin, size, fee, marketSizeStatus);
    }

    function _orderStatus(address account) internal view returns (Status) {
        IExchangeRates exRates = _exchangeRates();
        (uint price, bool invalid) = _assetPrice(exRates);
        if (invalid) {
            return Status.InvalidPrice;
        }
        (, , , Status status) = _orderStatusDetails(price, fundingSequence.length, account);
        return status;
    }

    /*
     * Returns the current status of an order. If its status is Error.Ok, then it can be confirmed.
     * Otherwise, some condition is blocking its confirmation; which is distinguished by the returned error code.
     */
    function orderStatus(address account) external view returns (Status) {
        return _orderStatus(account);
    }

    /*
     * True if and only if an order can be confirmed.
     */
    function canConfirmOrder(address account) external view returns (bool) {
        return !_isError(_orderStatus(account));
    }

    function _notionalValue(Position storage position, uint price) internal view returns (int value) {
        return position.size.multiplyDecimalRound(int(price));
    }

    /*
     * The notional value of a position is its size multiplied by the current price. Margin and leverage are ignored.
     */
    function notionalValue(address account) external view returns (int value, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        return (_notionalValue(positions[account], price), isInvalid);
    }

    function _profitLoss(Position storage position, uint price) internal view returns (int pnl) {
        int priceShift = int(price).sub(int(position.lastPrice));
        return position.size.multiplyDecimalRound(priceShift);
    }

    /*
     * The PnL of a position is the change in its notional value. Funding is not taken into account.
     */
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

    /*
     * The funding accrued in a position since it was opened; this does not include PnL.
     */
    function accruedFunding(address account) external view returns (int funding, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        return (_accruedFunding(positions[account], fundingSequence.length, price), isInvalid);
    }

    /*
     * The initial margin of a position, plus any PnL and funding it has accrued. The resulting value may be negative.
     */
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

        // If the margin went past zero, the position should have been liquidated - return zero remaining margin.
        return uint(_max(0, remaining));
    }

    /*
     * The initial margin plus profit and funding; returns zero balance if losses exceed the initial margin.
     */
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

    /*
     * The price at which a position is subject to liquidation; otherwise the price at which the user's remaining
     * margin has run out. When they have just enough margin left to pay a liquidator, then they are liquidated.
     * If a position is long, then it is safe as long as the current price is above the liquidation price; if it is
     * short, then it is safe whenever the current price is below the liquidation price.
     * A position's accurate liquidation price can move around slightly due to accrued funding - this contribution
     * can be omitted by passing false to includeFunding.
     */
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

    /*
     * True if and only if a position is ready to be liquidated.
     */
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

    /*
     * Equivalent to the position's notional value divided by its remaining margin.
     */
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

    /*
     * Reports the fee for submitting an order of a given size. Orders that increase the skew will be more
     * expensive than ones that decrease it; closing positions implies a different fee rate.
     */
    function orderFee(address account, int leverage) external view returns (uint fee, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice(_exchangeRates());
        Position storage position = positions[account];
        uint margin = _remainingMargin(position, fundingSequence.length, price);
        return (_orderFee(margin, leverage, position.size, price), isInvalid);
    }

    /*
     * Reports the fee for submitting an order of a given size after also adjusting margin.
     */
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
        // Since we only care about the sign of the product, we don't care about overflow and
        // aren't using SignedSafeDecimalMath
        return 0 <= a * b;
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

    /* ========== MUTATIVE FUNCTIONS ========== */

    /* ---------- Market Operations ---------- */

    function _recomputeFunding(uint price) internal returns (uint lastIndex) {
        uint sequenceLength = fundingSequence.length;

        int funding = _nextFundingEntry(sequenceLength, price);
        fundingSequence.push(funding);
        fundingLastRecomputed = block.timestamp;
        emitFundingRecomputed(funding);

        return sequenceLength;
    }

    /*
     * Pushes a new entry to the funding sequence at the current price and funding rate.
     */
    function recomputeFunding() external returns (uint lastIndex) {
        _revertIfError(msg.sender != address(_marketSettings()), Status.NotPermitted);
        return _recomputeFunding(_assetPriceRequireNotInvalid());
    }

    /*
     * The impact of a given position on the debt correction.
     */
    function _positionDebtCorrection(Position memory position) internal view returns (int) {
        return
            int(position.margin).sub(
                position.size.multiplyDecimalRound(int(position.lastPrice).add(fundingSequence[position.fundingIndex]))
            );
    }

    /*
     * Alter the debt correction to account for the net result of altering a position.
     */
    function _applyDebtCorrection(Position memory newPosition, Position memory oldPosition) internal {
        int newCorrection = _positionDebtCorrection(newPosition);
        int oldCorrection = _positionDebtCorrection(oldPosition);
        _entryDebtCorrection = _entryDebtCorrection.add(newCorrection).sub(oldCorrection);
    }

    /*
     * The value in a position's margin after a deposit or withdrawal, accounting for funding and profit.
     * If the resulting margin would be negative or below the liquidation threshold, an appropriate error is returned.
     * If the result is not an error, callers of this function that use it to update a position's margin
     * must ensure that this is accompanied by a corresponding debt correction update, as per `_applyDebtCorrection`.
     */
    function _realisedMargin(
        Position storage position,
        uint currentFundingIndex,
        uint price,
        int marginDelta
    ) internal view returns (uint margin, Status statusCode) {
        int newMargin = _marginPlusProfitFunding(position, currentFundingIndex, price).add(marginDelta);
        if (newMargin < 0) {
            return (0, Status.InsufficientMargin);
        }

        uint uMargin = uint(newMargin);
        int positionSize = position.size;
        if (positionSize != 0 && uMargin <= _liquidationFee()) {
            return (uMargin, Status.CanLiquidate);
        }

        return (uMargin, Status.Ok);
    }

    function _transferMargin(
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

        // Determine new margin, ensuring that the result is positive.
        (uint margin, Status status) = _realisedMargin(position, fundingIndex, price, marginDelta);
        _revertIfError(status);

        // Update the debt correction.
        int positionSize = position.size;
        _applyDebtCorrection(
            Position(margin, positionSize, price, fundingIndex),
            Position(position.margin, positionSize, position.lastPrice, position.fundingIndex)
        );

        // Update the account's position with the realised margin.
        position.margin = margin;
        // We only need to update their funding/PnL details if they actually have a position open
        if (positionSize > 0) {
            position.lastPrice = price;
            position.fundingIndex = fundingIndex;
        }

        // The user can decrease their position if they have no position, or as long as:
        //     * they have sufficient margin to do so
        //     * the resulting margin would not be lower than the minimum margin
        //     * the resulting leverage is lower than the maximum leverage
        if (0 < positionSize && marginDelta <= 0) {
            if (margin < _minInitialMargin()) {
                status = Status.InsufficientMargin;
            } else if (_maxLeverage(baseAsset) < _abs(_currentLeverage(position, price, margin))) {
                status = Status.MaxLeverageExceeded;
            }
            _revertIfError(status);
        }

        // Emit relevant events
        if (marginDelta != 0) {
            emitMarginTransferred(sender, marginDelta);
        }
        emitPositionModified(
            sender,
            margin,
            positionSize,
            positionSize > 0 ? price : 0,
            positionSize > 0 ? fundingIndex : 0
        );
    }

    /*
     * Alter the amount of margin in a position. Positive arguments correspond to deposits, negative arguments to
     * withdrawals. The margin will be burnt or issued directly into/out of the caller's sUSD wallet.
     * Reverts on withdrawal if the amount to be withdrawn would expose an open position to liquidation.
     */
    function transferMargin(int marginDelta) external optionalProxy {
        uint price = _assetPriceRequireNotInvalid();
        uint fundingIndex = _recomputeFunding(price);
        _transferMargin(marginDelta, price, fundingIndex, messageSender);
    }

    /*
     * Withdraws all margin remaining in a position. This will revert if the sending account has a position open.
     */
    function withdrawAllMargin() external optionalProxy {
        address sender = messageSender;
        uint price = _assetPriceRequireNotInvalid();
        uint fundingIndex = _recomputeFunding(price);
        int marginDelta = -int(_remainingMargin(positions[sender], fundingIndex, price));
        _transferMargin(marginDelta, price, fundingIndex, sender);
    }

    function _cancelOrder(address account) internal {
        Order storage order = orders[account];
        _revertIfError(!_orderPending(order), Status.NoOrderExists);
        emitOrderCancelled(order.id, account);
        delete orders[account];
    }

    /*
     * Deletes an outstanding order if it has not yet been confirmed.
     */
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
            _revertIfError(margin < _minInitialMargin().add(fee), Status.InsufficientMargin);
        }
    }

    function _submitOrder(
        int leverage,
        uint price,
        uint[2] memory priceBounds,
        uint fundingIndex,
        address sender
    ) internal {
        _revertIfError(_maxLeverage(baseAsset) < _abs(leverage), Status.MaxLeverageExceeded);
        Position storage position = positions[sender];

        // The order is not submitted if the user's existing position needed to be liquidated.
        // We know that the price is not invalid now that we're in this function
        _revertIfError(_canLiquidate(position, _liquidationFee(), fundingIndex, price), Status.CanLiquidate);

        uint margin = _remainingMargin(position, fundingIndex, price);
        int size = position.size;

        // Compute the fee owed, which will be charged to the margin after the order is confirmed.
        uint fee = _orderFee(margin, leverage, size, price);

        // Check that the user has sufficient margin
        _checkMargin(position, price, margin, leverage, fee, _sameSide(leverage, size));

        // Check that the order isn't too large for the market
        // Note that this in principle allows several orders to be placed at once
        // that collectively violate the maximum, but this is checked again when
        // the orders are confirmed.
        // Allow a bit of extra value in case of rounding errors
        int newSize = _orderSize(price, margin, leverage);
        _revertIfError(_orderSizeSmallEnough(_maxSize(price, _maxMarketValue(baseAsset), 100 * uint(_UNIT)), size, newSize));

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
        order.minPrice = priceBounds[0];
        order.maxPrice = priceBounds[1];
        emitOrderSubmitted(id, sender, leverage, fee, roundId, order.minPrice, order.maxPrice);
    }

    /*
     * Submit an order, but which cannot be confirmed unless the confirmation price is within desired bounds.
     * Reverts if the resulting position is too large, outside the max leverage, or if an existing position is liquidating.
     */
    function submitOrderWithPriceBounds(
        int leverage,
        uint minPrice,
        uint maxPrice
    ) public optionalProxy {
        uint price = _assetPriceRequireNotInvalid();
        uint fundingIndex = _recomputeFunding(price);
        _submitOrder(leverage, price, [minPrice, maxPrice], fundingIndex, messageSender);
    }

    /*
     * Submit an order to adjust the position leverage to a target level.
     * Reverts if the resulting position is too large, outside the max leverage, or if an existing position is liquidating.
     */
    function submitOrder(int leverage) external optionalProxy {
        submitOrderWithPriceBounds(leverage, 0, uint(-1));
    }

    // Submit an order to close a position. This is equivalent to `submitOrder(0)`.
    function closePosition() external optionalProxy {
        uint price = _assetPriceRequireNotInvalid();
        uint fundingIndex = _recomputeFunding(price);
        _submitOrder(0, price, [0, uint(-1)], fundingIndex, messageSender);
    }

    /*
     * Atomically alter margin and submit an order, but which cannot be confirmed unless the confirmation price
     * is within desired bounds.
     */
    function transferMarginAndSubmitOrderWithPriceBounds(
        int marginDelta,
        int leverage,
        uint minPrice,
        uint maxPrice
    ) public optionalProxy {
        uint price = _assetPriceRequireNotInvalid();
        uint fundingIndex = _recomputeFunding(price);
        address sender = messageSender;
        _transferMargin(marginDelta, price, fundingIndex, sender);
        _submitOrder(leverage, price, [minPrice, maxPrice], fundingIndex, sender);
    }

    /*
     * Atomically alter a position's margin and then submit an order.
     * This is the same as performing the steps in two transactions, except only one entry will be added to
     * the funding sequence.
     */
    function transferMarginAndSubmitOrder(int marginDelta, int leverage) external optionalProxy {
        transferMarginAndSubmitOrderWithPriceBounds(marginDelta, leverage, 0, uint(-1));
    }

    /*
     * Confirm an outstanding order, modifying the underlying position. This will succeed if and only if
     * `canConfirmOrder(account)` is true, and reverts otherwise.
     */
    function confirmOrder(address account) external optionalProxy {
        uint price = _assetPriceRequireNotInvalid();
        uint fundingIndex = _recomputeFunding(price);

        (uint margin, int newSize, uint fee, Status status) = _orderStatusDetails(price, fundingIndex, account);
        _revertIfError(status);

        // Update the margin, which will need to be realised
        Position storage position = positions[account];
        uint oldMargin = position.margin;
        int oldSize = position.size;
        position.margin = margin;

        // Apply debt corrections
        _applyDebtCorrection(
            Position(margin, newSize, price, fundingIndex),
            Position(oldMargin, oldSize, position.lastPrice, position.fundingIndex)
        );

        // Update the aggregated market size and skew with the new order size
        marketSkew = marketSkew.add(newSize).sub(oldSize);
        marketSize = marketSize.add(_abs(newSize)).sub(_abs(oldSize));

        // Send the fee to the fee pool
        if (0 < fee) {
            _manager().payFee(fee);
        }

        // Actually lodge the position and delete the order
        // Updating the margin was already handled above
        if (newSize == 0) {
            // If the position is being closed, we no longer need to track these details.
            delete position.size;
            delete position.lastPrice;
            delete position.fundingIndex;
            emitPositionModified(account, margin, 0, 0, 0);
        } else {
            position.size = newSize;
            position.lastPrice = price;
            position.fundingIndex = fundingIndex;
            emitPositionModified(account, margin, newSize, price, fundingIndex);
        }
        Order storage order = orders[account];
        emitOrderConfirmed(order.id, account, price);
        delete orders[account];
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

        emitPositionModified(account, 0, 0, 0, 0);
        emitPositionLiquidated(account, liquidator, positionSize, lPrice, liquidationFee);
    }

    /*
     * Liquidate a position if its remaining margin is below the liquidation fee. This succeeds if and only if
     * `canLiquidate(account)` is true, and reverts otherwise.
     * Upon liquidation, the position will be closed, and the liquidation fee minted into the liquidator's account.
     */
    function liquidatePosition(address account) external optionalProxy {
        uint price = _assetPriceRequireNotInvalid();
        uint fundingIndex = _recomputeFunding(price);

        uint liquidationFee = _liquidationFee();
        _revertIfError(!_canLiquidate(positions[account], liquidationFee, fundingIndex, price), Status.CannotLiquidate);

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

    event MarginTransferred(address indexed account, int marginDelta);
    bytes32 internal constant SIG_MARGINTRANSFERRED = keccak256("MarginTransferred(address,int256)");

    function emitMarginTransferred(address account, int marginDelta) internal {
        proxy._emit(abi.encode(marginDelta), 2, SIG_MARGINTRANSFERRED, addressToBytes32(account), 0, 0);
    }

    event OrderSubmitted(
        uint indexed id,
        address indexed account,
        int leverage,
        uint fee,
        uint indexed roundId,
        uint minPrice,
        uint maxPrice
    );
    bytes32 internal constant SIG_ORDERSUBMITTED =
        keccak256("OrderSubmitted(uint256,address,int256,uint256,uint256,uint256,uint256)");

    function emitOrderSubmitted(
        uint id,
        address account,
        int leverage,
        uint fee,
        uint roundId,
        uint minPrice,
        uint maxPrice
    ) internal {
        proxy._emit(
            abi.encode(leverage, fee, minPrice, maxPrice),
            4,
            SIG_ORDERSUBMITTED,
            bytes32(id),
            addressToBytes32(account),
            bytes32(roundId)
        );
    }

    event OrderConfirmed(uint indexed id, address indexed account, uint price);
    bytes32 internal constant SIG_ORDERCONFIRMED = keccak256("OrderConfirmed(uint256,address,uint256)");

    function emitOrderConfirmed(
        uint id,
        address account,
        uint price
    ) internal {
        proxy._emit(abi.encode(price), 3, SIG_ORDERCONFIRMED, bytes32(id), addressToBytes32(account), 0);
    }

    event OrderCancelled(uint indexed id, address indexed account);
    bytes32 internal constant SIG_ORDERCANCELLED = keccak256("OrderCancelled(uint256,address)");

    function emitOrderCancelled(uint id, address account) internal {
        proxy._emit(abi.encode(), 3, SIG_ORDERCANCELLED, bytes32(id), addressToBytes32(account), 0);
    }

    event PositionModified(address indexed account, uint margin, int size, uint lastPrice, uint fundingIndex);
    bytes32 internal constant SIG_POSITIONMODIFIED = keccak256("PositionModified(address,uint256,int256,uint256,uint256)");

    function emitPositionModified(
        address account,
        uint margin,
        int size,
        uint lastPrice,
        uint fundingIndex
    ) internal {
        proxy._emit(
            abi.encode(margin, size, lastPrice, fundingIndex),
            2,
            SIG_POSITIONMODIFIED,
            addressToBytes32(account),
            0,
            0
        );
    }

    event PositionLiquidated(address indexed account, address indexed liquidator, int size, uint price, uint fee);
    bytes32 internal constant SIG_POSITIONLIQUIDATED =
        keccak256("PositionLiquidated(address,address,int256,uint256,uint256)");

    function emitPositionLiquidated(
        address account,
        address liquidator,
        int size,
        uint price,
        uint fee
    ) internal {
        proxy._emit(
            abi.encode(size, price, fee),
            3,
            SIG_POSITIONLIQUIDATED,
            addressToBytes32(account),
            addressToBytes32(liquidator),
            0
        );
    }

    event FundingRecomputed(int funding);
    bytes32 internal constant SIG_FUNDINGRECOMPUTED = keccak256("FundingRecomputed(int256)");

    function emitFundingRecomputed(int funding) internal {
        proxy._emit(abi.encode(funding), 1, SIG_FUNDINGRECOMPUTED, 0, 0, 0);
    }
}
