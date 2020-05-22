pragma solidity ^0.5.16;

import "../BinaryOptionMarket.sol";

contract TestableBinaryOptionMarket is BinaryOptionMarket {
    constructor(
        address _resolver,
        uint256 _endOfBidding, uint256 _maturity, uint256 _destruction,
        bytes32 _oracleKey, uint256 _targetPrice,
        uint256 _oracleMaturityWindow,
        address creator, uint256 longBid, uint256 shortBid,
        uint256 _poolFee, uint256 _creatorFee, uint256 _refundFee
    )
        public
        BinaryOptionMarket(
            _resolver,
            _endOfBidding,
            _maturity,
            _destruction,
            _oracleKey,
            _targetPrice,
            _oracleMaturityWindow,
            creator, longBid, shortBid,
            _poolFee, _creatorFee, _refundFee)
    {}

    function updatePrices(uint256 longBids, uint256 shortBids, uint totalDebt) public {
        _updatePrices(longBids, shortBids, totalDebt);
    }
}
