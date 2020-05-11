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

// TODO: Modifiers for specific times periods

// Events for bids being placed/refunded.

contract BinaryOptionMarket {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    enum Phase { Bidding, Trading, Matured }

    BinaryOption public longOption;
    BinaryOption public shortOption;

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
        (uint256 longPrice, uint256 shortPrice) = _computePrices(longBid, shortBid);
        longOption = new BinaryOption(_endOfBidding, msg.sender, longBid, longPrice);
        shortOption = new BinaryOption(_endOfBidding, msg.sender, shortBid, shortPrice);
    }

    function _computePrices(uint256 longBids, uint256 shortBids) internal view returns (uint256 long, uint256 short) {
        // The math library rounds up on a half-increment -- the price on one side may be an increment too high,
        // but this only implies a tiny extra quantity will go to fees.
        uint256 Q = longBids.add(shortBids).multiplyDecimalRound(SafeDecimalMath.unit().sub(fee));
        return (longBids.divideDecimalRound(Q), shortBids.divideDecimalRound(Q));
    }

    function currentPrices() public view returns (uint256 long, uint256 short) {
        uint256 longBids = longOption.totalBids();
        uint256 shortBids = shortOption.totalBids();
        return _computePrices(longBids, shortBids);
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

    function bidLong(uint256 bid) public {
        require(!biddingEnded(), "Bidding must be active.");
        // TODO: Withdraw the tokens and burn them
        // Compute the new price.
        (uint256 longPrice, uint256 shortPrice) = _computePrices(longOption.totalBids().add(bid), shortOption.totalBids());

        // Make the bid and update prices on the token contracts.
        longOption.bidUpdatePrice(msg.sender, bid, longPrice);
        shortOption.updatePrice(shortPrice);
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

    function bidShort(uint256 bid) public {
        require(!biddingEnded(), "Bidding must be active.");
        // TODO: Withdraw the tokens and burn them
        // Compute the new price.
        (uint256 longPrice, uint256 shortPrice) = _computePrices(longOption.totalBids(), shortOption.totalBids().add(bid));

        // Make the bid and update prices on the token contracts.
        shortOption.bidUpdatePrice(msg.sender, bid, shortPrice);
        longOption.updatePrice(longPrice);
    }


    // TODO: bid/refund short

    // TODO: total supply

    // TODO: Oracle integration.

    // TODO: Oracle snapshot at maturity.

    // TODO: Maturity predicate.

    // TODO: Exercise options.

    // TODO: Cleanup / self destruct

    // TODO: Oracle failure.
}
