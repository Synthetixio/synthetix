pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./PerpsEngineV2Base.sol";
import "./PerpsEngineV2ViewsMixin.sol";

/// main comments in PerpsEngineV2Base.sol
/// views specific comments in PerpsEngineV2ViewsMixin.sol
contract PerpsEngineV2 is IPerpsEngineV2External, PerpsEngineV2Base, PerpsEngineV2ViewsMixin {
    constructor(address _resolver) public PerpsEngineV2Base(_resolver) {}
}
