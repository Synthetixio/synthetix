pragma solidity ^0.5.16;

// Inheritance
import "./OwnedWithInit.sol";
import "./MixinResolver.sol";

// Internal references
import "./BinaryOptionMarket.sol";

// https://docs.synthetix.io/contracts/source/contracts/binaryoptionmarket
contract BinaryOptionMarketMastercopy is BinaryOptionMarket {
    constructor(address _owner) public OwnedWithInit(_owner) {}
}
