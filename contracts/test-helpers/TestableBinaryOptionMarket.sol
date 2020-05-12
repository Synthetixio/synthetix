pragma solidity ^0.5.16;

import "../BinaryOptionMarket.sol";

contract TestableBinaryOptionMarket is BinaryOptionMarket {

    constructor(uint256 _endOfBidding, uint256 _maturity,
                uint256 _targetPrice,
                uint256 longBid, uint256 shortBid,
                uint256 _poolFee, uint256 _creatorFee, uint256 _refundFee) public BinaryOptionMarket(_endOfBidding, _maturity, _targetPrice, longBid, shortBid, _poolFee, _creatorFee, _refundFee) {}


    function computePrices(uint256 longBids, uint256 shortBids, uint totalDebt) public view returns (uint256 longPrice, uint256 shortPrice) {
        return _computePrices(longBids, shortBids, totalDebt);
    }
}
