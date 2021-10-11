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
    mapping(bytes32 => int) internal _openInterest;

    /* ========== CONSTRUCTOR ========== */
    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver) {}

    /* ========== SETTERS ========== */

    function setPriceImpactFactor(bytes32 asset, uint value) public onlyOwner {
        _priceImpactFactor[asset] = value;
    }

    function setMaxOpenInterestDelta(bytes32 asset, uint value) public onlyOwner {
        _maxOpenInterestDelta[asset] = value;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function resetOpenInterest(bytes32 asset) public {
        // New epoch.
        _openInterest[asset] = 0;
    }

    function updateOpenInterest(bytes32 asset, int amount) public {
        _openInterest[asset] += amount;
    }

    /* ========== GETTERS ========== */

    // Returns the liquidity parameters for an `asset`.
    function parameters(bytes32 asset)
        public
        view
        returns (
            int,
            uint,
            uint
        )
    {
        return (openInterest(asset), priceImpactFactor(asset), maxOpenInterestDelta(asset));
    }

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

    function openInterest(bytes32 asset) public view returns (int v) {
        return _openInterest[asset];
    }
}
