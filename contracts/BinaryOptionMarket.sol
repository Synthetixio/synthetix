pragma solidity ^0.5.16;

import "./SafeDecimalMath.sol";
import "./BinaryOptionMarketFactory.sol";
import "./BinaryOption.sol";

// TODO: Self destructible
// TODO: Integrate sUSD
// TODO: Pausable markets?
// TODO: SystemStatus?

// TODO: Set denominating asset
// TODO: Set oracle
// TODO: Protect against refunding of all tokens (so no zero prices).
// TODO: Withdraw capital and check it is greater than minimal capitalisation (restrict withdrawal of capital until market closure)
// TODO: populate the price from the oracle at construction

// TODO: Modifiers for specific time periods

// TODO: Events for bids being placed/refunded.

// TODO: MixinResolver for factory

// TODO: Token integration.

// TODO: Oracle integration.

// TODO: Oracle snapshot at maturity.

// TODO: Maturity predicate.

// TODO: Exercise options.

// TODO: Cleanup / self destruct

// TODO: Oracle failure.


contract BinaryOptionMarket {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    enum Phase { Bidding, Trading, Matured }

    BinaryOptionMarketFactory public factory;
    BinaryOption public longOption;
    BinaryOption public shortOption;
    uint256 public longPrice;
    uint256 public shortPrice;

    uint256 public debt; // The sum of open bids on short and long, plus withheld refund fees.

    uint256 public endOfBidding;
    uint256 public maturity;
    uint256 public targetPrice;
    uint256 public price;

    uint256 public poolFee;
    uint256 public creatorFee;
    uint256 public refundFee;

    constructor(uint256 _endOfBidding, uint256 _maturity,
                uint256 _targetPrice,
                uint256 longBid, uint256 shortBid,
                uint256 _poolFee, uint256 _creatorFee, uint256 _refundFee) public {
        require(now < _endOfBidding, "End of bidding must be in the future.");
        require(_endOfBidding < _maturity, "Maturity must be after the end of bidding.");
        require(0 < _targetPrice, "The target price must be nonzero.");

        uint256 totalFee = _poolFee.add(_creatorFee);
        require(totalFee < SafeDecimalMath.unit(), "Fee must be less than 100%.");
        poolFee = _poolFee;
        creatorFee = _creatorFee;

        require(_refundFee <= SafeDecimalMath.unit(), "Refund fee must be no greater than 100%.");
        refundFee = _refundFee;

        endOfBidding = _endOfBidding;
        maturity = _maturity;
        targetPrice = _targetPrice;
        debt = longBid.add(shortBid);

        factory = BinaryOptionMarketFactory(msg.sender);
        _updatePrices(longBid, shortBid, debt);
        longOption = new BinaryOption(_endOfBidding, msg.sender, longBid);
        shortOption = new BinaryOption(_endOfBidding, msg.sender, shortBid);
        // TODO: Actually withdraw the tokens from the creator.
    }

    modifier onlyDuringBidding() {
        require(!biddingEnded(), "Bidding must be active.");
        _;
    }

    function _updatePrices(uint256 longBids, uint256 shortBids, uint totalDebt) internal {
        require(longBids != 0 && shortBids != 0, "Option prices must be nonzero.");
        // The math library rounds up on a half-increment -- the price on one side may be an increment too high,
        // but this only implies a tiny extra quantity will go to fees.
        uint256 feeMultiplier = SafeDecimalMath.unit().sub(poolFee.add(creatorFee));
        uint256 Q = totalDebt.multiplyDecimalRound(feeMultiplier);
        uint256 long = longBids.divideDecimalRound(Q);
        uint256 short = shortBids.divideDecimalRound(Q);
        longPrice = long;
        shortPrice = short;
        emit PricesUpdated(long, short);
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

    function prices() public view returns (uint256 long, uint256 short) {
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

    function bidsOf(address bidder) public view returns (uint256 long, uint256 short) {
        return (longOption.bidOf(bidder), shortOption.bidOf(bidder));
    }

    function totalBids() public view returns (uint256 long, uint256 short) {
        return (longOption.totalBids(), shortOption.totalBids());
    }

    function _internalBid(uint256 bid, bool long) internal onlyDuringBidding {
        // TODO: Withdraw the tokens and burn them
        debt = debt.add(bid);
        factory.incrementTotalDebt(bid);
        if (long) {
            longOption.bid(msg.sender, bid);
            emit LongBid(msg.sender, bid);
        } else {
            shortOption.bid(msg.sender, bid);
            emit ShortBid(msg.sender, bid);
        }
        _updatePrices(longOption.totalBids(), shortOption.totalBids(), debt);
    }

    function bidLong(uint256 bid) public onlyDuringBidding {
        _internalBid(bid, true);
    }

    function bidShort(uint256 bid) public onlyDuringBidding {
        _internalBid(bid, false);
    }

    function _internalRefund(uint256 refund, bool long) internal onlyDuringBidding returns (uint256) {
        // TODO: Withdraw the tokens and burn them
        // Safe subtraction here and in related contracts will fail if either the
        // total supply, debt, or wallet balance are too small to support the refund.
        uint256 refundSansFee = refund.multiplyDecimalRound(SafeDecimalMath.unit().sub(refundFee));
        debt = debt.sub(refundSansFee);
        factory.decrementTotalDebt(refundSansFee);
        if (long) {
            longOption.refund(msg.sender, refund);
            emit LongRefund(msg.sender, refundSansFee, refund.sub(refundSansFee));
        } else {
            shortOption.refund(msg.sender, refund);
            emit ShortRefund(msg.sender, refundSansFee, refund.sub(refundSansFee));
        }
        _updatePrices(longOption.totalBids(), shortOption.totalBids(), debt);
        return refundSansFee;
    }

    function refundLong(uint256 refund) public onlyDuringBidding returns (uint256) {
        return _internalRefund(refund, true);
    }

    function refundShort(uint256 refund) public onlyDuringBidding returns (uint256) {
        return _internalRefund(refund, false);
    }

    event PricesUpdated(uint256 longPrice, uint256 shortPrice);

    event LongBid(address indexed bidder, uint256 bid);

    event ShortBid(address indexed bidder, uint256 bid);

    event LongRefund(address indexed refunder, uint256 refund, uint256 fee);

    event ShortRefund(address indexed refunder, uint256 refund, uint256 fee);
}
