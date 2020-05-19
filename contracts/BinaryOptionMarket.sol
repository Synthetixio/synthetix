pragma solidity ^0.5.16;

import "./Owned.sol";
import "./MixinResolver.sol";
import "./SafeDecimalMath.sol";
import "./BinaryOptionMarketFactory.sol";
import "./BinaryOption.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/ISynth.sol";

// TODO: Pausable markets?
// TODO: SystemStatus?

// TODO: Balances for both sides
// TODO: Dynamic denominating Synth
// TODO: Protect against refunding of all tokens (so no zero prices).
// TODO: Withdraw capital and check it is greater than minimal capitalisation (restrict withdrawal of capital until market closure)
// TODO: Consider whether prices should be stored as high precision.
// TODO: Events for claim and exercise of options?

// TODO: MixinResolver for factory itself
// TODO: The ability to switch factories/owners

// TODO: Exercise options.
// TODO: Cleanup / self destruct

// TODO: Oracle failure.

// TODO: Interfaces

contract BinaryOptionMarket is Owned, MixinResolver {

    /* ========== LIBRARIES ========== */

    using SafeMath for uint;
    using SafeDecimalMath for uint;

    /* ========== TYPES ========== */

    enum Phase { Bidding, Trading, Matured }
    enum Result { Unresolved, Long, Short }

    address public creator;
    BinaryOptionMarketFactory public factory;
    BinaryOption public longOption;
    BinaryOption public shortOption;
    uint256 public longPrice;
    uint256 public shortPrice;

    uint256 public endOfBidding;
    uint256 public maturity;

    bytes32 public oracleKey;
    uint256 public targetOraclePrice;
    uint256 public finalOraclePrice;
    uint256 public oracleMaturityWindow;
    bool public resolved;

    uint256 public poolFee;
    uint256 public creatorFee;
    uint256 public refundFee;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 private constant CONTRACT_SYNTHSUSD = "SynthsUSD";

    bytes32[24] private addressesToCache = [
        CONTRACT_EXRATES,
        CONTRACT_SYNTHSUSD
        ];

    constructor(address _resolver,
                uint256 _endOfBidding, uint256 _maturity,
                bytes32 _oracleKey,
                uint256 _targetOraclePrice,
                uint256 _oracleMaturityWindow,
                address _creator, uint256 longBid, uint256 shortBid,
                uint256 _poolFee, uint256 _creatorFee, uint256 _refundFee
    )
        public
        Owned(msg.sender)
        MixinResolver(_resolver, addressesToCache)
    {
        require(now < _endOfBidding, "End of bidding must be in the future.");
        require(_endOfBidding < _maturity, "Maturity must be after the end of bidding.");
        require(0 < _targetOraclePrice, "The target price must be nonzero.");
        uint256 totalFee = _poolFee.add(_creatorFee);
        require(totalFee < SafeDecimalMath.unit(), "Fee must be less than 100%.");
        require(_creator != address(0), "Creator must not be the 0 address.");
        require(_refundFee <= SafeDecimalMath.unit(), "Refund fee must be no greater than 100%.");

        // Related contracts.
        creator = _creator;
        factory = BinaryOptionMarketFactory(msg.sender);

        // Fees
        poolFee = _poolFee;
        creatorFee = _creatorFee;
        refundFee = _refundFee;

        // Dates
        endOfBidding = _endOfBidding;
        maturity = _maturity;

        // Oracle and prices
        oracleKey = _oracleKey;
        targetOraclePrice = _targetOraclePrice;
        oracleMaturityWindow = _oracleMaturityWindow;

        // Note that the synths must be deposited externally by the factory, otherwise the
        // total deposits will not sync with the size of the bids.
        // Similarly the total deposits must be updated in the factory.
        uint256 initialDeposit = longBid.add(shortBid);
        _updatePrices(longBid, shortBid, initialDeposit);

        // Instantiate the options themselves
        longOption = new BinaryOption(_creator, longBid);
        shortOption = new BinaryOption(_creator, shortBid);
    }

    modifier onlyDuringBidding() {
        require(!biddingEnded(), "Bidding must be active.");
        _;
    }

    modifier onlyAfterBidding() {
        require(biddingEnded(), "Bidding must be complete.");
        _;
    }

    modifier onlyAfterMaturity() {
        require(matured(), "The maturity date has not been reached.");
        _;
    }

    function exchangeRates() public view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES, "Missing ExchangeRates address"));
    }

    function synthsUSD() public view returns (ISynth) {
        return ISynth(requireAndGetAddress(CONTRACT_SYNTHSUSD, "Missing SynthsUSD address"));
    }

    // The sum of open bids on short and long, plus withheld refund fees.
    function deposited() public view returns (uint256) {
        return synthsUSD().balanceOf(address(this));
    }

    function _updatePrices(uint256 longBids, uint256 shortBids, uint _deposits) internal {
        require(longBids != 0 && shortBids != 0, "Option prices must be nonzero.");
        // The math library rounds up on a half-increment -- the price on one side may be an increment too high,
        // but this only implies a tiny extra quantity will go to fees.
        uint256 feeMultiplier = SafeDecimalMath.unit().sub(poolFee.add(creatorFee));
        uint256 Q = _deposits.multiplyDecimalRound(feeMultiplier);

        uint256 _longPrice = longBids.divideDecimalRound(Q);
        uint256 _shortPrice = shortBids.divideDecimalRound(Q);

        longPrice = _longPrice;
        shortPrice = _shortPrice;
        emit PricesUpdated(_longPrice, _shortPrice);
    }

    function senderPrice() external view returns (uint256) {
        if (msg.sender == address(longOption)) {
            return longPrice;
        }
        if (msg.sender == address(shortOption)) {
            return shortPrice;
        }
        revert("Message sender is not an option of this market.");
    }

    function prices() external view returns (uint256 long, uint256 short) {
        return (longPrice, shortPrice);
    }

    function biddingEnded() public view returns (bool) {
        return endOfBidding <= now;
    }

    function matured() public view returns (bool) {
        return maturity <= now;
    }

    function currentPhase() public view returns (Phase) {
        if (matured()) {
            return Phase.Matured;
        }

        if (biddingEnded()) {
            return Phase.Trading;
        }

        return Phase.Bidding;
    }

    function bidsOf(address bidder) external view returns (uint256 long, uint256 short) {
        return (longOption.bidOf(bidder), shortOption.bidOf(bidder));
    }

    function totalBids() external view returns (uint256 long, uint256 short) {
        return (longOption.totalBids(), shortOption.totalBids());
    }

    function _internalBid(uint256 bid, bool long) internal onlyDuringBidding {
        if (long) {
            longOption.bid(msg.sender, bid);
            emit LongBid(msg.sender, bid);
        } else {
            shortOption.bid(msg.sender, bid);
            emit ShortBid(msg.sender, bid);
        }

        factory.incrementTotalDeposited(bid);
        synthsUSD().transferFrom(msg.sender, address(this), bid);
        _updatePrices(longOption.totalBids(), shortOption.totalBids(), deposited());
    }

    function bidLong(uint256 bid) external {
        _internalBid(bid, true);
    }

    function bidShort(uint256 bid) external {
        _internalBid(bid, false);
    }

    function _internalRefund(uint256 refund, bool long) internal onlyDuringBidding returns (uint256) {
        // Safe subtraction here and in related contracts will fail if either the
        // total supply, deposits, or wallet balance are too small to support the refund.
        uint256 refundSansFee = refund.multiplyDecimalRound(SafeDecimalMath.unit().sub(refundFee));

        if (long) {
            longOption.refund(msg.sender, refund);
            emit LongRefund(msg.sender, refundSansFee, refund.sub(refundSansFee));
        } else {
            shortOption.refund(msg.sender, refund);
            emit ShortRefund(msg.sender, refundSansFee, refund.sub(refundSansFee));
        }

        factory.decrementTotalDeposited(refundSansFee);
        synthsUSD().transfer(msg.sender, refundSansFee);
        _updatePrices(longOption.totalBids(), shortOption.totalBids(), deposited());

        return refundSansFee;
    }

    function refundLong(uint256 refund) external returns (uint256) {
        return _internalRefund(refund, true);
    }

    function refundShort(uint256 refund) external returns (uint256) {
        return _internalRefund(refund, false);
    }

    function currentOraclePriceAndTimestamp() public view returns (uint256 price, uint256 updatedAt) {
        IExchangeRates exRates = exchangeRates();
        uint256 currentRoundId = exRates.getCurrentRoundId(oracleKey);
        return exRates.rateAndTimestampAtRound(oracleKey, currentRoundId);
    }

    function result() public view returns (Result) {
        if (!resolved) {
            return Result.Unresolved;
        }

        if (targetOraclePrice <= finalOraclePrice) {
            return Result.Long;
        }

        return Result.Short;
    }

    function withinMaturityWindow(uint256 timestamp) internal view returns (bool) {
        return (maturity - oracleMaturityWindow) <= timestamp;
    }

    function canResolve() external view returns (bool) {
        (uint256 price, uint256 updatedAt) = currentOraclePriceAndTimestamp();
        return matured() && withinMaturityWindow(updatedAt) && !resolved;
    }

    function resolve() public onlyAfterMaturity {
        require(!resolved, "The market has already resolved.");

        (uint256 price, uint256 updatedAt) = currentOraclePriceAndTimestamp();

        // We don't need to perform stale price checks, so long as the price was
        // last updated after the maturity date.
        if (!withinMaturityWindow(updatedAt)) {
            revert("The price was last updated before the maturity window.");
        }

        finalOraclePrice = price;
        resolved = true;

        emit MarketResolved(result(), price, updatedAt);
    }

    function claimOptions() external onlyAfterBidding returns (uint256 longClaimed, uint256 shortClaimed) {
        return (longOption.claim(msg.sender), shortOption.claim(msg.sender));
    }

    function exerciseOptions() public returns (uint256) {
        uint256 payout;
        Result finalResult = result();

        if (finalResult == Result.Long) {
            payout = longOption.exercise(msg.sender);
        } else if (finalResult == Result.Short) {
            payout = shortOption.exercise(msg.sender);
        } else {
            revert("The market has not yet resolved.");
        }

        if (payout == 0) {
            return 0;
        }

        factory.decrementTotalDeposited(payout);
        synthsUSD().transfer(msg.sender, payout);

        return payout;
    }

    event LongBid(address indexed bidder, uint256 bid);
    event ShortBid(address indexed bidder, uint256 bid);
    event LongRefund(address indexed refunder, uint256 refund, uint256 fee);
    event ShortRefund(address indexed refunder, uint256 refund, uint256 fee);
    event PricesUpdated(uint256 longPrice, uint256 shortPrice);
    event MarketResolved(Result result, uint256 oraclePrice, uint256 oracleTimestamp);
}
