pragma solidity ^0.5.16;

contract BinaryOptionMarket {
    /*
    Option long;
    Option short;
    uint256 endOfBidding;
    uint256 maturity;
    uint256 targetPrice
    uint256 price;
    constant uint256 poolFee;
    constant uint256 creatorFee;
    constant uint256 fee = poolFee + creatorFee;
    constructor(uint256 _endOfBidding, uint256 _maturity, uint256 _targetPrice, uint256 longBid, uint256 shortBid) public {
        // TODO: Set denominating asset
        // TODO: Set oracle
        // TODO: Withdraw capital and check it is greater than minimal capitalisation
        require(now < _endOfBidding, "End of bidding must be in the future.");
        require(_endOfBidding < _maturity, "Maturity must be after the end of bidding.");
        require(0 < targetPrice, "The target Price must be nonzero.");
        endOfBidding = _endOfBidding;
        maturity = _maturity;
        targetPrice = _targetPrice;
        uint256 longPrice, shortPrice = computePrices(longBid, shortBid);
        long = new Option(this, _endOfBidding, msg.sender, longBid, longPrice);
        short = new Option(this, _endOfBidding, msg.sender, shortBid, shortPrice);
    }
    function computePrices(uint256 longBids, uint256 shortBids) internal pure returns (uint256 longPrice, uint256 shortPrice) {
        // TODO: Decimalise
        uint256 Q = (longBids + shortBids) * fee;
        return (longBids/Q, shortBids/Q);
    }
    function biddingActive() returns (bool) {
        return endOfBidding <= now;
    }
    function matured() returns (bool) {
        return maturity <= now;
    }
    function bids() public returns (uint256 longBid, uint256 shortBid) {
        return long.bids(msg.sender), short.bids(msg.sender);
    }
    function computePrice(uint256 longBids, uint256 shortBids) internal returns (uint256) {
        return
    }
    function bidLong(uint256 quantity) {
        // TODO: Must only operate within the bidding period.
        require(biddingActive(), "Bidding must be active.");
        // TODO: Withdraw the tokens and burn them
        // Compute the new price.
        // TODO: issue new tokens on the long option contract
        // TODO: Incrememnt total supplies
        // TODO: Update price.
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