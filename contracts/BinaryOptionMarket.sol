pragma solidity ^0.5.16;

import "./SafeDecimalMath.sol";
import "./BinaryOption.sol";

// TODO: Self destructible
// TODO: Factory (pausable)
// TODO: Integrate sUSD
// TODO: Protect against refunding of all tokens (so no zero prices).

// TODO: Set denominating asset
// TODO: Set oracle
// TODO: Withdraw capital and check it is greater than minimal capitalisation
// TODO: populate the price from the oracle at construction

// Events for bids being placed/refunded.

// Enum for market phases (enum Phase { Bidding, Trading, Matured })

contract BinaryOptionMarket {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    BinaryOption public long;
    BinaryOption public short;

    uint256 public endOfBidding;
    uint256 public maturity;
    uint256 public targetPrice;
    uint256 public price;

    uint256 public poolFee;
    uint256 public creatorFee;
    uint256 public fee;

    constructor(uint256 _endOfBidding, uint256 _maturity,
                uint256 _targetPrice,
                uint256 longBid, uint256 shortBid,
                uint256 _poolFee, uint256 _creatorFee) public {
        require(now < _endOfBidding, "End of bidding must be in the future.");
        require(_endOfBidding < _maturity, "Maturity must be after the end of bidding.");
        require(0 < _targetPrice, "The target price must be nonzero.");

        fee = _poolFee.add(_creatorFee);
        require(fee < SafeDecimalMath.unit(), "Fee must be less than 100%.");
        poolFee = _poolFee;
        creatorFee = _creatorFee;

        endOfBidding = _endOfBidding;
        maturity = _maturity;
        targetPrice = _targetPrice;
        (uint256 longPrice, uint256 shortPrice) = computePrices(longBid, shortBid);
        long = new BinaryOption(_endOfBidding, msg.sender, longBid, longPrice);
        short = new BinaryOption(_endOfBidding, msg.sender, shortBid, shortPrice);
    }

    function computePrices(uint256 longBids, uint256 shortBids) internal view returns (uint256 longPrice, uint256 shortPrice) {
        uint256 Q = longBids.add(shortBids).multiplyDecimal(SafeDecimalMath.unit().sub(fee));
        return (longBids.divideDecimal(Q), shortBids.divideDecimal(Q));
    }

    function newPrices(uint256 longBids, uint256 newLongBid, uint256 shortBids, uint256 newShortBid) internal view returns (uint256 longPrice, uint256 shortPrice) {
        return computePrices(longBids.add(newLongBid), shortBids.add(newShortBid));
    }

    function currentPrices() public view returns (uint256 longPrice, uint256 shortPrice) {
        uint256 longBids = long.totalBids();
        uint256 shortBids = short.totalBids();
        return computePrices(longBids, shortBids);
    }

    function biddingEnded() public view returns (bool) {
        return endOfBidding <= now;
    }

    function matured() public view returns (bool) {
        return maturity <= now;
    }

    function bidsOf(address bidder) public view returns (uint256 longBid, uint256 shortBid) {
        return (long.bidOf(bidder), short.bidOf(bidder));
    }

    function totalBids() public view returns (uint256 longBids, uint256 shortBids) {
        return (long.totalBids(), short.totalBids());
    }

    function bidLong(uint256 bid) public {
        require(!biddingEnded(), "Bidding must be active.");
        // TODO: Withdraw the tokens and burn them
        // Compute the new price.

        (uint256 longPrice, uint256 shortPrice) = newPrices(long.totalBids(), bid, short.totalBids(), 0);

        // Make the bid and update prices on the token contracts.
        long.bidUpdatePrice(msg.sender, bid, longPrice);
        short.updatePrice(shortPrice);
    }

    /*
    function refundLong(uint256 quantity) {
        // TODO: Must only operate within the bidding period.
        // TODO: Withdraw the tokens and burn them
        // TODO: Check there is sufficient balance.
        // TODO: refund them, minus the fee
        // TODO: Rebalance remaining quantity between pots.
    }
    */

    // TODO: bid/refund short

    // TODO: total supply

    // TODO: Oracle integration.

    // TODO: Oracle snapshot at maturity.

    // TODO: Maturity predicate.

    // TODO: Exercise options.

    // TODO: Cleanup / self destruct

    // TODO: Oracle failure.
}
