pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/ILiquidityOracle.sol";

contract LiquidityOracle is Owned, MixinResolver, ILiquidityOracle {
    using SafeDecimalMath for uint;

    // TODO: Move these to SystemSettings.
    mapping(bytes32 => uint) internal _priceImpactFactor;
    mapping(bytes32 => uint) internal _maxOpenInterestDelta;

    mapping(bytes32 => int) public openInterest;

    bytes32 internal constant sETH = "sETH";

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver) {}

    //
    // TODO: permission these funcs.
    //

    function priceImpactFactor(bytes32 asset) public view returns (uint v) {
        v = _priceImpactFactor[asset];
        require(v != 0, "unset: priceImpactFactor");
        return v;
    }

    function maxOpenInterestDelta(bytes32 asset) public view returns (uint v) {
        v = _maxOpenInterestDelta[asset];
        require(v != 0, "unset: maxOpenInterestDelta");
        return v;
    }

    function setPriceImpactFactor(bytes32 asset, uint value) public onlyOwner {
        _priceImpactFactor[asset] = value;
    }

    function setMaxOpenInterestDelta(bytes32 asset, uint value) public onlyOwner {
        _maxOpenInterestDelta[asset] = value;
    }

    function resetOpenInterest(bytes32 asset) public {
        // New epoch.
        openInterest[asset] = 0;
    }

    function updateOpenInterest(bytes32 asset, int amount) public {
        openInterest[asset] += amount;
    }
}
