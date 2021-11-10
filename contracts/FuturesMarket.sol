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
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/IExchangeRatesCircuitBreaker.sol";
import "./interfaces/ISystemStatus.sol";
import "./interfaces/IERC20.sol";

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
    using SafeDecimalMath for uint;

    /* ========== CONSTANTS ========== */

    // This is the same unit as used inside `SignedSafeDecimalMath`.
    int private constant _UNIT = int(10**uint(18));

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
     * Each user's position. Multiple positions can always be merged, so each user has
     * only have one position at a time.
     */
    mapping(address => Position) public positions;

    /*
     * This holds the value: sum_{p in positions}{p.margin - p.size * (p.lastPrice + fundingSequence[p.fundingIndex])}
     * Then marketSkew * (_assetPrice() + _marketDebt()) + _entryDebtCorrection yields the total system debt,
     * which is equivalent to the sum of remaining margins in all positions.
     */
    int internal _entryDebtCorrection;

    // This increments for each position; zero reflects a position that does not exist.
    uint internal _nextPositionId = 1;

    // Holds the revert message for each type of error.
    mapping(uint8 => string) internal _errorMessages;

    /* ---------- Address Resolver Configuration ---------- */

    bytes32 internal constant CONTRACT_CIRCUIT_BREAKER = "ExchangeRatesCircuitBreaker";
    bytes32 internal constant CONTRACT_FUTURESMARKETMANAGER = "FuturesMarketManager";
    bytes32 internal constant CONTRACT_FUTURESMARKETSETTINGS = "FuturesMarketSettings";
    bytes32 internal constant CONTRACT_SYSTEMSTATUS = "SystemStatus";

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
        _errorMessages[uint8(Status.InvalidPrice)] = "Invalid price";
        _errorMessages[uint8(Status.PriceOutOfBounds)] = "Price out of acceptable range";
        _errorMessages[uint8(Status.CanLiquidate)] = "Position can be liquidated";
        _errorMessages[uint8(Status.CannotLiquidate)] = "Position cannot be liquidated";
        _errorMessages[uint8(Status.MaxMarketSizeExceeded)] = "Max market size exceeded";
        _errorMessages[uint8(Status.MaxLeverageExceeded)] = "Max leverage exceeded";
        _errorMessages[uint8(Status.InsufficientMargin)] = "Insufficient margin";
        _errorMessages[uint8(Status.NotPermitted)] = "Not permitted by this address";
        _errorMessages[uint8(Status.NilOrder)] = "Cannot submit empty order";
        _errorMessages[uint8(Status.NoPositionOpen)] = "No position open";
    }

    /* ========== VIEWS ========== */

    /* ---------- External Contracts ---------- */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinFuturesMarketSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](4);
        newAddresses[0] = CONTRACT_CIRCUIT_BREAKER;
        newAddresses[1] = CONTRACT_FUTURESMARKETMANAGER;
        newAddresses[2] = CONTRACT_FUTURESMARKETSETTINGS;
        newAddresses[3] = CONTRACT_SYSTEMSTATUS;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    function _exchangeRatesCircuitBreaker() internal view returns (IExchangeRatesCircuitBreaker) {
        return IExchangeRatesCircuitBreaker(requireAndGetAddress(CONTRACT_CIRCUIT_BREAKER));
    }

    function _systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS));
    }

    function systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS));
    }

    function _manager() internal view returns (IFuturesMarketManagerInternal) {
        return IFuturesMarketManagerInternal(requireAndGetAddress(CONTRACT_FUTURESMARKETMANAGER));
    }

    function _settings() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_FUTURESMARKETSETTINGS);
    }

    /* ---------- Market Details ---------- */

    function _assetPrice() internal view returns (uint price, bool invalid) {
        (price, invalid) = _exchangeRatesCircuitBreaker().rateWithInvalid(baseAsset);
        // Ensure we catch uninitialised rates or suspended state / synth
        invalid = invalid || price == 0 || _systemStatus().synthSuspended(baseAsset);
        return (price, invalid);
    }

    /*
     * The current base price from the oracle, and whether that price was invalid. Zero prices count as invalid.
     */
    function assetPrice() external view returns (uint price, bool invalid) {
        return _assetPrice();
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

    /*
     * The remaining units on each side of the market left to be filled before hitting the cap.
     */
    function _maxOrderSizes(uint price) internal view returns (uint, uint) {
        (uint long, uint short) = _marketSizes();
        int sizeLimit = int(_maxMarketValueUSD(baseAsset)).divideDecimalRound(int(price));
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
        (uint price, bool isInvalid) = _assetPrice();
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
     * The debt contributed by this market to the overall system.
     * The total market debt is equivalent to the sum of remaining margins in all open positions.
     */
    function marketDebt() external view returns (uint debt, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice();
        return (_marketDebt(price), isInvalid);
    }

    /*
     * The size of the skew relative to the size of the market skew scaler.
     * This value can be outside of [-1, 1] values.
     * Scaler used for skew is at skewScaleUSD to prevent extreme funding rates for small markets.
     */
    function _proportionalSkew(uint price) internal view returns (int) {
        // marketSize is in baseAsset units so we need to convert from USD units
        require(price > 0, "price can't be zero");
        uint skewScaleBaseAsset = _skewScaleUSD(baseAsset).divideDecimalRound(price);

        // parameters may not be set, don't divide by zero
        if (skewScaleBaseAsset == 0) {
            return 0;
        }

        return marketSkew.divideDecimalRound(int(skewScaleBaseAsset));
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
            uint maxMarketValueUSD,
            uint maxFundingRate,
            uint skewScaleUSD,
            uint maxFundingRateDelta
        )
    {
        return _parameters(baseAsset);
    }

    function _currentFundingRate(uint price) internal view returns (int) {
        int maxFundingRate = int(_maxFundingRate(baseAsset));
        // Note the minus sign: funding flows in the opposite direction to the skew.
        return _min(_max(-_UNIT, -_proportionalSkew(price)), _UNIT).multiplyDecimalRound(maxFundingRate);
    }

    /*
     * The current funding rate as determined by the market skew; this is returned as a percentage per day.
     * If this is positive, shorts pay longs, if it is negative, longs pay shorts.
     */
    function currentFundingRate() external view returns (int) {
        (uint price, ) = _assetPrice();
        return _currentFundingRate(price);
    }

    /*
     * The current funding rate, rescaled to a percentage per second.
     */
    function _currentFundingRatePerSecond(uint price) internal view returns (int) {
        return _currentFundingRate(price) / 1 days;
    }

    function _unrecordedFunding(uint price) internal view returns (int funding) {
        int elapsed = int(block.timestamp.sub(fundingLastRecomputed));
        return _currentFundingRatePerSecond(price).multiplyDecimalRound(int(price)).mul(elapsed);
    }

    /*
     * The funding per base unit accrued since the funding rate was last recomputed, which has not yet
     * been persisted in the funding sequence.
     */
    function unrecordedFunding() external view returns (int funding, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice();
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
        (uint price, bool isInvalid) = _assetPrice();
        return (_netFundingPerUnit(startIndex, endIndex, fundingSequence.length, price), isInvalid);
    }

    /*
     * The number of entries in the funding sequence.
     */
    function fundingSequenceLength() external view returns (uint) {
        return fundingSequence.length;
    }

    /* ---------- Position Details ---------- */

    /*
     * Determines whether a change in a position's size would violate the max market value constraint.
     */
    function _orderSizeTooLarge(
        uint maxSize,
        int oldSize,
        int newSize
    ) internal view returns (bool) {
        // Allow users to reduce an order no matter the market conditions.
        if (_sameSide(oldSize, newSize) && _abs(newSize) <= _abs(oldSize)) {
            return false;
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
            return true;
        }

        return false;
    }

    function _notionalValue(Position memory position, uint price) internal pure returns (int value) {
        return position.size.multiplyDecimalRound(int(price));
    }

    /*
     * The notional value of a position is its size multiplied by the current price. Margin and leverage are ignored.
     */
    function notionalValue(address account) external view returns (int value, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice();
        return (_notionalValue(positions[account], price), isInvalid);
    }

    function _profitLoss(Position memory position, uint price) internal pure returns (int pnl) {
        int priceShift = int(price).sub(int(position.lastPrice));
        return position.size.multiplyDecimalRound(priceShift);
    }

    /*
     * The PnL of a position is the change in its notional value. Funding is not taken into account.
     */
    function profitLoss(address account) external view returns (int pnl, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice();
        return (_profitLoss(positions[account], price), isInvalid);
    }

    function _accruedFunding(
        Position memory position,
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
        (uint price, bool isInvalid) = _assetPrice();
        return (_accruedFunding(positions[account], fundingSequence.length, price), isInvalid);
    }

    /*
     * The initial margin of a position, plus any PnL and funding it has accrued. The resulting value may be negative.
     */
    function _marginPlusProfitFunding(
        Position memory position,
        uint endFundingIndex,
        uint price
    ) internal view returns (int) {
        return int(position.margin).add(_profitLoss(position, price)).add(_accruedFunding(position, endFundingIndex, price));
    }

    /*
     * The value in a position's margin after a deposit or withdrawal, accounting for funding and profit.
     * If the resulting margin would be negative or below the liquidation threshold, an appropriate error is returned.
     * If the result is not an error, callers of this function that use it to update a position's margin
     * must ensure that this is accompanied by a corresponding debt correction update, as per `_applyDebtCorrection`.
     */
    function _realisedMargin(
        Position memory position,
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
        // minimum margin beyond which position can be liqudiated
        uint lMargin = _liquidationMargin(positionSize, price);
        if (positionSize != 0 && uMargin <= lMargin) {
            return (uMargin, Status.CanLiquidate);
        }

        return (uMargin, Status.Ok);
    }

    function _remainingMargin(
        Position memory position,
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
        (uint price, bool isInvalid) = _assetPrice();
        return (_remainingMargin(positions[account], fundingSequence.length, price), isInvalid);
    }

    function _accessibleMargin(
        Position storage position,
        uint fundingIndex,
        uint price
    ) internal view returns (uint) {
        // Ugly solution to rounding safety: leave up to an extra tenth of a cent in the account/leverage
        // This should guarantee that the value returned here can always been withdrawn, but there may be
        // a little extra actually-accessible value left over, depending on the position size and margin.
        uint milli = uint(_UNIT / 1000);
        int maxLeverage = int(_maxLeverage(baseAsset).sub(milli));
        uint inaccessible = _abs(_notionalValue(position, price).divideDecimalRound(maxLeverage));

        // If the user has a position open, we'll enforce a min initial margin requirement.
        if (0 < inaccessible) {
            uint minInitialMargin = _minInitialMargin();
            if (inaccessible < minInitialMargin) {
                inaccessible = minInitialMargin;
            }
            inaccessible = inaccessible.add(milli);
        }

        uint remaining = _remainingMargin(position, fundingIndex, price);
        if (remaining <= inaccessible) {
            return 0;
        }

        return remaining.sub(inaccessible);
    }

    /*
     * The approximate amount of margin the user may withdraw given their current position; this underestimates the
     * true value slightly.
     */
    function accessibleMargin(address account) external view returns (uint marginAccessible, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice();
        return (_accessibleMargin(positions[account], fundingSequence.length, price), isInvalid);
    }

    function _liquidationPrice(
        Position memory position,
        bool includeFunding,
        uint currentPrice
    ) internal view returns (uint) {
        int positionSize = position.size;

        // short circuit
        if (positionSize == 0) {
            return 0;
        }

        // calculate funding if needed
        int fundingPerUnit = 0;
        if (includeFunding) {
            // price = lastPrice + (liquidationMargin - margin) / positionSize - netAccrued
            fundingPerUnit = _netFundingPerUnit(
                position.fundingIndex,
                fundingSequence.length,
                fundingSequence.length,
                currentPrice
            );
        }

        // minimum margin beyond which position can be liqudiated
        uint liqMargin = _liquidationMargin(position.size, currentPrice);

        // A position can be liquidated whenever:
        //     remainingMargin <= liquidationMargin
        // Hence, expanding the definition of remainingMargin the exact price
        // at which a position can first be liquidated is:
        //     margin + profitLoss + funding =  liquidationMargin
        //     profitLoss = (price - last-price) * positionSize
        //     price  = lastPrice + (liquidationMargin - margin) / positionSize - netFundingPerUnit
        int result =
            int(position.lastPrice).add(int(liqMargin).sub(int(position.margin)).divideDecimalRound(positionSize)).sub(
                fundingPerUnit
            );

        // If the user has leverage less than 1, their liquidation price may actually be negative; return 0 instead.
        return uint(_max(0, result));
    }

    /**
     * The fee charged from the margin during liquidation. Fee is proportional to position size
     * but is at least the _minLiquidationFee() of sUSD to prevent underincentivising
     * liquidations of small positions.
     * @param positionSize size of position in fixed point decimal baseAsset units
     * @param price price of single baseAsset unit in sUSD fixed point decimal units
     * @return lFee liquidation fee to be paid to liquidator in sUSD fixed point decimal units
     */
    function _liquidationFee(int positionSize, uint price) internal view returns (uint lFee) {
        // size * price * fee-BPs / 10000
        // the first multiplication is decimal because price is fixed point decimal, but BPs and 10000 are plain int
        uint proportionalFee = _abs(positionSize).multiplyDecimalRound(price).mul(_liquidationFeeBPs()).div(10000);
        uint minFee = _minLiquidationFee();
        // max(proportionalFee, minFee) - to prevent not incentivising liquidations enough
        return proportionalFee > minFee ? proportionalFee : minFee;
    }

    /**
     * The margin buffer to maintain above the liquidation fee. The buffer is proportional to the position
     * size. The buffer should prevent liquidation happenning at negative margin (due to next price being worse)
     * so that stakers would not leak value to liquidators through minting rewards that are not from the
     * account's margin.
     * @param positionSize size of position in fixed point decimal baseAsset units
     * @param price price of single baseAsset unit in sUSD fixed point decimal units
     * @return lBuffer liquidation buffer to be paid to liquidator in sUSD fixed point decimal units
     */
    function _liquidationBuffer(int positionSize, uint price) internal view returns (uint lBuffer) {
        // size * price * buffer-BPs / 10000
        // the first multiplication is decimal because price is fixed point decimal, but BPs and 10000 are plain int
        return _abs(positionSize).multiplyDecimalRound(price).mul(_liquidationBufferBPs()).div(10000);
    }

    /**
     * The minimal margin at which liquidation can happen. Is the sum of liquidationBuffer and liquidationFee
     * @param positionSize size of position in fixed point decimal baseAsset units
     * @param price price of single baseAsset unit in sUSD fixed point decimal units
     * @return lMargin liquidation margin to maintain in sUSD fixed point decimal units
     */
    function _liquidationMargin(int positionSize, uint price) internal view returns (uint lMargin) {
        return _liquidationBuffer(positionSize, price).add(_liquidationFee(positionSize, price));
    }

    /**
     * The minimal margin at which liquidation can happen. Is the sum of liquidationBuffer and liquidationFee.
     * Reverts if position size is 0.
     * @param account address of the position account
     * @return lMargin liquidation margin to maintain in sUSD fixed point decimal units
     */
    function liquidationMargin(address account) external view returns (uint lMargin) {
        require(positions[account].size != 0, "0 size position");
        (uint price, ) = _assetPrice();
        return _liquidationMargin(positions[account].size, price);
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
        (uint aPrice, bool isInvalid) = _assetPrice();
        uint liqPrice = _liquidationPrice(positions[account], includeFunding, aPrice);
        return (liqPrice, isInvalid);
    }

    /**
     * The fee paid to liquidator in the event of successful liquidation of an account at current price.
     * Returns 0 if account cannot be liquidated right now.
     * @param account address of the trader's account
     * @return fee that will be paid for liquidating the account if it can be liquidated
     *  in sUSD fixed point decimal units or 0 if account is not liquidatable.
     */
    function liquidationFee(address account) external view returns (uint) {
        (uint price, bool invalid) = _assetPrice();
        if (!invalid && _canLiquidate(positions[account], fundingSequence.length, price)) {
            return _liquidationFee(positions[account].size, price);
        } else {
            return 0;
        }
    }

    function _canLiquidate(
        Position memory position,
        uint fundingIndex,
        uint price
    ) internal view returns (bool) {
        // No liquidating empty positions.
        if (position.size == 0) {
            return false;
        }

        return _remainingMargin(position, fundingIndex, price) <= _liquidationMargin(position.size, price);
    }

    /*
     * True if and only if a position is ready to be liquidated.
     */
    function canLiquidate(address account) external view returns (bool) {
        (uint price, bool invalid) = _assetPrice();
        return !invalid && _canLiquidate(positions[account], fundingSequence.length, price);
    }

    function _currentLeverage(
        Position memory position,
        uint price,
        uint remainingMargin_
    ) internal pure returns (int leverage) {
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
        (uint price, bool isInvalid) = _assetPrice();
        Position storage position = positions[account];
        uint remainingMargin_ = _remainingMargin(position, fundingSequence.length, price);
        return (_currentLeverage(position, price, remainingMargin_), isInvalid);
    }

    function _orderFee(
        int newSize,
        int existingSize,
        uint price
    ) internal view returns (uint) {
        int existingNotional = existingSize.multiplyDecimalRound(int(price));

        // Charge the closure fee if closing a position entirely.
        if (newSize == 0) {
            return _abs(existingNotional.multiplyDecimalRound(int(_closureFee(baseAsset))));
        }

        int newNotional = newSize.multiplyDecimalRound(int(price));

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
    function orderFee(address account, int sizeDelta) external view returns (uint fee, bool invalid) {
        (uint price, bool isInvalid) = _assetPrice();
        int positionSize = positions[account].size;
        return (_orderFee(positionSize.add(sizeDelta), positionSize, price), isInvalid);
    }

    function _postTradeDetails(
        Position memory oldPos,
        int sizeDelta,
        uint price,
        uint fundingIndex
    )
        internal
        view
        returns (
            Position memory newPosition,
            uint _fee,
            Status tradeStatus
        )
    {
        // Reverts if the user is trying to submit a size-zero order.
        if (sizeDelta == 0) {
            return (oldPos, 0, Status.NilOrder);
        }

        // The order is not submitted if the user's existing position needs to be liquidated.
        if (_canLiquidate(oldPos, fundingIndex, price)) {
            return (oldPos, 0, Status.CanLiquidate);
        }

        int newSize = oldPos.size.add(sizeDelta);

        // Deduct the fee.
        // It is an error if the realised margin minus the fee is negative or subject to liquidation.
        uint fee = _orderFee(newSize, oldPos.size, price);
        (uint newMargin, Status status) = _realisedMargin(oldPos, fundingIndex, price, -int(fee));
        if (_isError(status)) {
            return (oldPos, 0, status);
        }
        Position memory newPos = Position(oldPos.id, newMargin, newSize, price, fundingIndex);

        // Check that the user has sufficient margin given their order.
        // We don't check the margin requirement if the position size is decreasing
        bool positionDecreasing = _sameSide(oldPos.size, newPos.size) && _abs(newPos.size) < _abs(oldPos.size);
        if (!positionDecreasing) {
            // minMargin + fee <= margin is equivalent to minMargin <= margin - fee
            // except that we get a nicer error message if fee > margin, rather than arithmetic overflow.
            if (newPos.margin.add(fee) < _minInitialMargin()) {
                return (oldPos, 0, Status.InsufficientMargin);
            }
        }

        // Check that the maximum leverage is not exceeded (ignoring the fee).
        // We'll allow a little extra headroom for rounding errors.
        int leverage = newSize.multiplyDecimalRound(int(price)).divideDecimalRound(int(newMargin.add(fee)));
        if (_maxLeverage(baseAsset).add(uint(_UNIT) / 100) < _abs(leverage)) {
            return (oldPos, 0, Status.MaxLeverageExceeded);
        }

        // Check that the order isn't too large for the market.
        // Allow a bit of extra value in case of rounding errors.
        if (
            _orderSizeTooLarge(
                uint(int(_maxMarketValueUSD(baseAsset).add(100 * uint(_UNIT))).divideDecimalRound(int(price))),
                oldPos.size,
                newPos.size
            )
        ) {
            return (oldPos, 0, Status.MaxMarketSizeExceeded);
        }

        return (newPos, fee, Status.Ok);
    }

    /*
     * Returns all new position details if a given order from `sender` was confirmed at the current price.
     */
    function postTradeDetails(int sizeDelta, address sender)
        external
        view
        returns (
            uint margin,
            int size,
            uint price,
            uint liqPrice,
            uint fee,
            Status status
        )
    {
        bool invalid;
        (price, invalid) = _assetPrice();
        if (invalid) {
            return (0, 0, 0, 0, 0, Status.InvalidPrice);
        }

        (Position memory newPosition, uint fee_, Status status_) =
            _postTradeDetails(positions[sender], sizeDelta, price, fundingSequence.length);

        liqPrice = _liquidationPrice(newPosition, true, newPosition.lastPrice);
        return (newPosition.margin, newPosition.size, newPosition.lastPrice, liqPrice, fee_, status_);
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

    /*
     * The current base price, reverting if it is invalid, or if system or synth is suspended.
     * This is mutative because the circuit breaker stores the last price on every invocation.
     */
    function _assetPriceRequireChecks() internal returns (uint) {
        // check that synth is active, and wasn't suspended, revert with appropriate message
        _systemStatus().requireSynthActive(baseAsset);
        // check if circuit breaker if price is within deviation tolerance and system & synth is active
        (uint price, bool circuitBroken) = _exchangeRatesCircuitBreaker().rateWithBreakCircuit(baseAsset);
        // revert if price is invalid or circuit was broken
        _revertIfError(circuitBroken, Status.InvalidPrice);
        return price;
    }

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
        _revertIfError(msg.sender != _settings(), Status.NotPermitted);
        return _recomputeFunding(_assetPriceRequireChecks());
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
        } else {
            // Zero delta is a no-op
            return;
        }

        Position storage position = positions[sender];
        Position memory oldPosition = position;

        // Determine new margin, ensuring that the result is positive.
        (uint margin, Status status) = _realisedMargin(oldPosition, fundingIndex, price, marginDelta);
        _revertIfError(status);

        // Update the debt correction.
        int positionSize = position.size;
        _applyDebtCorrection(
            Position(0, margin, positionSize, price, fundingIndex),
            Position(0, position.margin, positionSize, position.lastPrice, position.fundingIndex)
        );

        // Update the account's position with the realised margin.
        position.margin = margin;
        // We only need to update their funding/PnL details if they actually have a position open
        if (positionSize != 0) {
            position.lastPrice = price;
            position.fundingIndex = fundingIndex;

            // The user can always decrease their margin if they have no position, or as long as:
            //     * they have sufficient margin to do so
            //     * the resulting margin would not be lower than the minimum margin
            //     * the resulting leverage is lower than the maximum leverage
            if (marginDelta < 0) {
                _revertIfError(
                    margin < _minInitialMargin() ||
                        _maxLeverage(baseAsset) < _abs(_currentLeverage(position, price, margin)),
                    Status.InsufficientMargin
                );
            }
        }

        // Emit relevant events
        if (marginDelta != 0) {
            emitMarginTransferred(sender, marginDelta);
        }
        emitPositionModified(position.id, sender, margin, positionSize, 0, price, fundingIndex, 0);
    }

    /*
     * Alter the amount of margin in a position. A positive input triggers a deposit; a negative one, a
     * withdrawal. The margin will be burnt or issued directly into/out of the caller's sUSD wallet.
     * Reverts on deposit if the caller lacks a sufficient sUSD balance.
     * Reverts on withdrawal if the amount to be withdrawn would expose an open position to liquidation.
     */
    function transferMargin(int marginDelta) external optionalProxy {
        uint price = _assetPriceRequireChecks();
        uint fundingIndex = _recomputeFunding(price);
        _transferMargin(marginDelta, price, fundingIndex, messageSender);
    }

    /*
     * Withdraws all accessible margin in a position. This will leave some remaining margin
     * in the account if the caller has a position open. Equivalent to `transferMargin(-accessibleMargin(sender))`.
     */
    function withdrawAllMargin() external optionalProxy {
        address sender = messageSender;
        uint price = _assetPriceRequireChecks();
        uint fundingIndex = _recomputeFunding(price);
        int marginDelta = -int(_accessibleMargin(positions[sender], fundingIndex, price));
        _transferMargin(marginDelta, price, fundingIndex, sender);
    }

    function _modifyPosition(
        int sizeDelta,
        uint price,
        uint fundingIndex,
        address sender
    ) internal {
        Position storage position = positions[sender];
        Position memory oldPosition = position;

        // Compute the new position after performing the trade
        (Position memory newPosition, uint fee, Status status) =
            _postTradeDetails(oldPosition, sizeDelta, price, fundingIndex);
        _revertIfError(status);

        // Update the aggregated market size and skew with the new order size
        marketSkew = marketSkew.add(newPosition.size).sub(oldPosition.size);
        marketSize = marketSize.add(_abs(newPosition.size)).sub(_abs(oldPosition.size));

        // Send the fee to the fee pool
        if (0 < fee) {
            _manager().payFee(fee);
        }

        // Update the margin, and apply the resulting debt correction
        position.margin = newPosition.margin;
        _applyDebtCorrection(newPosition, oldPosition);

        // Record the trade
        uint id = oldPosition.id;
        if (newPosition.size == 0) {
            // If the position is being closed, we no longer need to track these details.
            delete position.id;
            delete position.size;
            delete position.lastPrice;
            delete position.fundingIndex;
        } else {
            if (oldPosition.size == 0) {
                // New positions get new ids.
                id = _nextPositionId;
                _nextPositionId += 1;
            }
            position.id = id;
            position.size = newPosition.size;
            position.lastPrice = price;
            position.fundingIndex = fundingIndex;
        }
        // emit the modification event
        emitPositionModified(id, sender, position.margin, position.size, sizeDelta, price, fundingIndex, fee);
    }

    /*
     * Adjust the sender's position size.
     * Reverts if the resulting position is too large, outside the max leverage, or is liquidating.
     */
    function modifyPosition(int sizeDelta) external optionalProxy {
        uint price = _assetPriceRequireChecks();
        uint fundingIndex = _recomputeFunding(price);
        _modifyPosition(sizeDelta, price, fundingIndex, messageSender);
    }

    function _revertIfPriceOutsideBounds(
        uint price,
        uint minPrice,
        uint maxPrice
    ) internal view {
        _revertIfError(price < minPrice || maxPrice < price, Status.PriceOutOfBounds);
    }

    /*
     * Adjust the sender's position size, but with an acceptable slippage range in case
     * the price updates while the transaction is in flight.
     * Reverts if the oracle price is outside the specified bounds, or the resulting position is too large,
     * outside the max leverage, or is liquidating.
     */
    function modifyPositionWithPriceBounds(
        int sizeDelta,
        uint minPrice,
        uint maxPrice
    ) external optionalProxy {
        uint price = _assetPriceRequireChecks();
        _revertIfPriceOutsideBounds(price, minPrice, maxPrice);
        uint fundingIndex = _recomputeFunding(price);
        _modifyPosition(sizeDelta, price, fundingIndex, messageSender);
    }

    /*
     * Submit an order to close a position.
     */
    function closePosition() external optionalProxy {
        int size = positions[messageSender].size;
        _revertIfError(size == 0, Status.NoPositionOpen);
        uint price = _assetPriceRequireChecks();
        _modifyPosition(-size, price, _recomputeFunding(price), messageSender);
    }

    /*
     * Submit an order to close a position; reverts if the asset price is outside the specified bounds.
     */
    function closePositionWithPriceBounds(uint minPrice, uint maxPrice) external optionalProxy {
        int size = positions[messageSender].size;
        _revertIfError(size == 0, Status.NoPositionOpen);
        uint price = _assetPriceRequireChecks();
        _revertIfPriceOutsideBounds(price, minPrice, maxPrice);
        _modifyPosition(-size, price, _recomputeFunding(price), messageSender);
    }

    function _liquidatePosition(
        address account,
        address liquidator,
        uint fundingIndex,
        uint price
    ) internal {
        Position storage position = positions[account];

        // get remaining margin for sending any leftover buffer to fee pool
        uint remMargin = _remainingMargin(position, fundingIndex, price);

        // Record updates to market size and debt.
        int positionSize = position.size;
        uint positionId = position.id;
        marketSkew = marketSkew.sub(positionSize);
        marketSize = marketSize.sub(_abs(positionSize));

        _applyDebtCorrection(
            Position(0, 0, 0, price, fundingIndex),
            Position(0, position.margin, positionSize, position.lastPrice, position.fundingIndex)
        );

        // Close the position itself.
        delete positions[account];

        // Issue the reward to the liquidator.
        uint liqFee = _liquidationFee(positionSize, price);
        _manager().issueSUSD(liquidator, liqFee);

        emitPositionModified(positionId, account, 0, 0, 0, price, fundingIndex, 0);
        emitPositionLiquidated(positionId, account, liquidator, positionSize, price, liqFee);

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
    function liquidatePosition(address account) external optionalProxy {
        uint price = _assetPriceRequireChecks();
        uint fundingIndex = _recomputeFunding(price);

        _revertIfError(!_canLiquidate(positions[account], fundingIndex, price), Status.CannotLiquidate);

        _liquidatePosition(account, messageSender, fundingIndex, price);
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
    bytes32 internal constant SIG_POSITIONMODIFIED =
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
            SIG_POSITIONMODIFIED,
            bytes32(id),
            addressToBytes32(account),
            0
        );
    }

    event PositionLiquidated(
        uint indexed id,
        address indexed account,
        address indexed liquidator,
        int size,
        uint price,
        uint fee
    );
    bytes32 internal constant SIG_POSITIONLIQUIDATED =
        keccak256("PositionLiquidated(uint256,address,address,int256,uint256,uint256)");

    function emitPositionLiquidated(
        uint id,
        address account,
        address liquidator,
        int size,
        uint price,
        uint fee
    ) internal {
        proxy._emit(
            abi.encode(size, price, fee),
            4,
            SIG_POSITIONLIQUIDATED,
            bytes32(id),
            addressToBytes32(account),
            addressToBytes32(liquidator)
        );
    }

    event FundingRecomputed(int funding);
    bytes32 internal constant SIG_FUNDINGRECOMPUTED = keccak256("FundingRecomputed(int256)");

    function emitFundingRecomputed(int funding) internal {
        proxy._emit(abi.encode(funding), 1, SIG_FUNDINGRECOMPUTED, 0, 0, 0);
    }
}
