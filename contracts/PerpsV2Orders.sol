pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./PerpsV2OrdersBase.sol";
import "./PerpsV2NextPriceMixin.sol";

/*
 * Perps markets v2
 * TODO: docs
 */

// https://docs.synthetix.io/contracts/source/contracts/PerpsV2Market
contract PerpsV2Orders is IPerpsV2Orders, PerpsV2OrdersBase, PerpsV2NextPriceMixin {
    constructor(address _resolver) public PerpsV2OrdersBase(_resolver) {}
}
