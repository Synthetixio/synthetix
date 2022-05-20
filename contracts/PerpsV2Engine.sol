pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./PerpsV2EngineBase.sol";
import "./PerpsV2EngineViewsMixin.sol";

/**
 * TODO: docs
 */

// https://docs.synthetix.io/contracts/source/contracts/PerpsV2Market
contract PerpsV2Engine is IPerpsV2EngineExternal, IPerpsV2EngineInternal, PerpsV2EngineBase, PerpsV2EngineViewsMixin {
    constructor(address _resolver) public PerpsV2EngineBase(_resolver) {}
}
