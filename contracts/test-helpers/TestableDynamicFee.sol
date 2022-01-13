pragma solidity ^0.5.16;

// Libraries
import "../DynamicFee.sol";

contract TestableDynamicFee {
    uint public threshold = (4 * SafeDecimalMath.unit()) / 1000;
    uint public weightDecay = (9 * SafeDecimalMath.unit()) / 10;

    function getPriceDifferential(uint price, uint previousPrice) external view returns (uint) {
        return DynamicFee.getPriceDifferential(price, previousPrice, threshold);
    }

    function getPriceWeight(uint round) external view returns (uint) {
        return DynamicFee.getRoundDecay(round, weightDecay);
    }

    function getDynamicFee(uint[] calldata prices) external view returns (uint) {
        return DynamicFee.getDynamicFee(prices, threshold, weightDecay);
    }
}
