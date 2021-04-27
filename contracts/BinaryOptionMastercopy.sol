pragma solidity ^0.5.16;

// Internal references
import "./BinaryOption.sol";

// https://docs.synthetix.io/contracts/source/contracts/binaryoption
contract BinaryOptionMastercopy is BinaryOption {
    constructor() public {
        // Freeze mastercopy on deployment so it can never be initialized with real arguments
        initialized = true;
    }
}
