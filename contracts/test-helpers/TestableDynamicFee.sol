pragma solidity ^0.5.16;

// Libraries
import "../DynamicFee.sol";

contract TestableDynamicFee {
    function testThreshold() public pure returns (uint) {
        return DynamicFee.threshold();
    }

    function testWeightDecay() public pure returns (uint) {
        return DynamicFee.weightDecay();
    }

    function testGetPriceDifferential(uint price, uint previousPrice) public pure returns (uint) {
        return DynamicFee.getPriceDifferential(price, previousPrice);
    }

    function testGetPriceWeight(uint round) public pure returns (uint) {
        return DynamicFee.getPriceWeight(round);
    }

    function testGetDynamicFee(uint[] memory prices) public pure returns (uint) {
        return DynamicFee.getDynamicFee(prices);
    }
}
