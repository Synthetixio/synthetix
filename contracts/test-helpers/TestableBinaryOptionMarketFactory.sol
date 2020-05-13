pragma solidity ^0.5.16;

import "../BinaryOptionMarketFactory.sol";
import "../BinaryOptionMarket.sol";

contract TestableBinaryOptionMarketFactory is BinaryOptionMarketFactory {
    constructor(address _owner, uint256 _poolFee, uint256 _creatorFee, uint256 _refundFee) public
        BinaryOptionMarketFactory(_owner, _poolFee, _creatorFee, _refundFee) {}

    function addMarket(address market) public {
        activeMarkets.push(BinaryOptionMarket(market));
        isActiveMarket[market] = true;
    }
}
