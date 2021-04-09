pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";

// Internal references
import "./BinaryOptionMarket.sol";

// https://docs.synthetix.io/contracts/source/contracts/binaryoptionmarket
contract BinaryOptionMarketMastercopy is BinaryOptionMarket {
    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver) {}
}
