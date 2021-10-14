pragma solidity ^0.5.16;

// Libraries
import "../libraries/DynamicFee.sol";

contract TestableDynamicFee {
    function testGetDynamicFee(uint[] memory prices) public pure returns (uint) {
        return DynamicFee.getDynamicFee(prices);
    }
}
