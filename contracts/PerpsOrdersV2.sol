pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./PerpsOrdersV2Base.sol";
import "./PerpsOrdersV2NextPriceMixin.sol";

/*
 * Perps markets v2
 * TODO: docs
 */

contract PerpsOrdersV2 is IPerpsOrdersV2, PerpsOrdersV2Base, PerpsOrdersV2NextPriceMixin {
    constructor(address _resolver) public PerpsOrdersV2Base(_resolver) {}
}
