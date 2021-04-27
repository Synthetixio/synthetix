pragma solidity ^0.5.16;

// Inheritance
import "./BinaryOptionMarket.sol";

// https://docs.synthetix.io/contracts/source/contracts/binaryoptionmarket
contract BinaryOptionMarketMastercopy is BinaryOptionMarket {
    constructor() public MinimalProxyFactory() OwnedWithInit() {}
}
