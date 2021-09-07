pragma solidity ^0.5.16;

import "./Owned.sol";
import "./MixinResolver.sol";
import "./interfaces/ILiquidityOracle.sol";

contract LiquidityOracle is Owned, MixinResolver, ILiquidityOracle {

    // TODO: Move these to SystemSettings.
    mapping(bytes32 => uint) public priceImpactFactor;
    mapping(bytes32 => int) public maxOpenInterestDelta;

    mapping(bytes32 => int) public openInterest;

    bytes32 constant sETH = bytes32("sETH");
    
    constructor(
        address _owner,
        address _resolver
    ) public Owned(_owner) MixinResolver(_resolver) {
    }

    function resetOpenInterest(bytes32 asset) public {
        // New epoch.
        maxOpenInterestDelta[asset] = 0;
    }

    function updateOpenInterest(bytes32 asset, uint amount) public {
        maxOpenInterestDelta[asset] += amount;
    }
}