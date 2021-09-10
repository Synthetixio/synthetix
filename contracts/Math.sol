pragma solidity ^0.5.16;

// Libraries
import "./SafeDecimalMath.sol";
import "./SignedSafeMath.sol";
import "./SignedSafeDecimalMath.sol";

// https://docs.synthetix.io/contracts/source/libraries/math
library Math {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using SignedSafeMath for int;
    using SignedSafeDecimalMath for int;

    uint private constant SECONDS_PER_YEAR = 31536000;
    /// @dev Internally this library uses 27 decimals of precision
    uint private constant PRECISE_UNIT = 1e27;
    uint private constant LN_2_PRECISE = 693147180559945309417232122;
    uint private constant SQRT_TWOPI = 2506628274631000502415765285;
    /// @dev Below this value, return 0
    int private constant MIN_CDF_STD_DIST_INPUT = (int(PRECISE_UNIT) * -45) / 10; // -4.5
    /// @dev Above this value, return 1
    int private constant MAX_CDF_STD_DIST_INPUT = int(PRECISE_UNIT) * 10;
    /// @dev Below this value, the result is always 0
    int private constant MIN_EXP = -63 * int(PRECISE_UNIT);
    /// @dev Above this value the a lot of precision is lost, and uint256s come close to not being able to handle the size
    uint private constant MAX_EXP = 100 * PRECISE_UNIT;
    /// @dev Value to use to avoid any division by 0 or values near 0
    uint private constant MIN_T_ANNUALISED = PRECISE_UNIT / SECONDS_PER_YEAR; // 1 second
    uint private constant MIN_VOLATILITY = PRECISE_UNIT / 10000; // 0.001%
    uint private constant VEGA_STANDARDISATION_MIN_DAYS = 7 days;

    /**
     * @dev Uses "exponentiation by squaring" algorithm where cost is 0(logN)
     * vs 0(N) for naive repeated multiplication.
     * Calculates x^n with x as fixed-point and n as regular unsigned int.
     * Calculates to 18 digits of precision with SafeDecimalMath.unit()
     */
    function powDecimal(uint x, uint n) internal pure returns (uint) {
        // https://mpark.github.io/programming/2014/08/18/exponentiation-by-squaring/

        uint result = SafeDecimalMath.unit();
        while (n > 0) {
            if (n % 2 != 0) {
                result = result.multiplyDecimal(x);
            }
            x = x.multiplyDecimal(x);
            n /= 2;
        }
        return result;
    }

    function max(uint a, uint b) public pure returns (uint) {
        return a > b ? a : b;
    }

    function max(int a, int b) public pure returns (int) {
        return a > b ? a : b;
    }

    /*
     * Math Operations
     */

    /**
     * @dev Returns absolute value of an int as a uint.
     */
    function abs(int x) public pure returns (uint) {
        return uint(x < 0 ? -x : x);
    }

    /**
     * @dev Returns the floor of a PRECISE_UNIT (x - (x % 1e27))
     */
    function floor(uint x) internal pure returns (uint) {
        return x - (x % PRECISE_UNIT);
    }

    /**
     * @dev Returns the natural log of the value using Halley's method.
     */
    function ln(uint x) internal pure returns (int) {
        int res;
        int next;

        for (uint i = 0; i < 8; i++) {
            int e = int(exp(res));
            next = res.add((int(x).sub(e).mul(2)).divideDecimalRoundPrecise(int(x).add(e)));
            if (next == res) {
                break;
            }
            res = next;
        }

        return res;
    }

    function log2(uint x) internal pure returns (uint y) {
        assembly {
            let arg := x
            x := sub(x, 1)
            x := or(x, div(x, 0x02))
            x := or(x, div(x, 0x04))
            x := or(x, div(x, 0x10))
            x := or(x, div(x, 0x100))
            x := or(x, div(x, 0x10000))
            x := or(x, div(x, 0x100000000))
            x := or(x, div(x, 0x10000000000000000))
            x := or(x, div(x, 0x100000000000000000000000000000000))
            x := add(x, 1)
            let m := mload(0x40)
            mstore(m, 0xf8f9cbfae6cc78fbefe7cdc3a1793dfcf4f0e8bbd8cec470b6a28a7a5a3e1efd)
            mstore(add(m, 0x20), 0xf5ecf1b3e9debc68e1d9cfabc5997135bfb7a7a3938b7b606b5b4b3f2f1f0ffe)
            mstore(add(m, 0x40), 0xf6e4ed9ff2d6b458eadcdf97bd91692de2d4da8fd2d0ac50c6ae9a8272523616)
            mstore(add(m, 0x60), 0xc8c0b887b0a8a4489c948c7f847c6125746c645c544c444038302820181008ff)
            mstore(add(m, 0x80), 0xf7cae577eec2a03cf3bad76fb589591debb2dd67e0aa9834bea6925f6a4a2e0e)
            mstore(add(m, 0xa0), 0xe39ed557db96902cd38ed14fad815115c786af479b7e83247363534337271707)
            mstore(add(m, 0xc0), 0xc976c13bb96e881cb166a933a55e490d9d56952b8d4e801485467d2362422606)
            mstore(add(m, 0xe0), 0x753a6d1b65325d0c552a4d1345224105391a310b29122104190a110309020100)
            mstore(0x40, add(m, 0x100))
            let magic := 0x818283848586878898a8b8c8d8e8f929395969799a9b9d9e9faaeb6bedeeff
            let shift := 0x100000000000000000000000000000000000000000000000000000000000000
            let a := div(mul(x, magic), shift)
            y := div(mload(add(m, sub(255, a))), shift)
            y := add(y, mul(256, gt(arg, 0x8000000000000000000000000000000000000000000000000000000000000000)))
        }
    }

    /**
     * @dev Returns the exponent of the value using taylor expansion with range reduction.
     */
    function exp(uint x) public pure returns (uint) {
        if (x == 0) {
            return PRECISE_UNIT;
        }
        require(x <= MAX_EXP, "cannot handle exponents greater than 100");

        uint k = floor(x.divideDecimalRoundPrecise(LN_2_PRECISE)) / PRECISE_UNIT;
        uint p = 2**k;
        uint r = x.sub(k.mul(LN_2_PRECISE));

        uint _T = PRECISE_UNIT;

        uint lastT;
        for (uint8 i = 16; i > 0; i--) {
            _T = _T.multiplyDecimalRoundPrecise(r / i).add(PRECISE_UNIT);
            if (_T == lastT) {
                break;
            }
            lastT = _T;
        }

        return p.mul(_T);
    }

    /**
     * @dev Returns the exponent of the value using taylor expansion with range reduction, with support for negative
     * numbers.
     */
    function exp(int x) public pure returns (uint) {
        if (0 <= x) {
            return exp(uint(x));
        } else if (x < MIN_EXP) {
            // exp(-63) < 1e-27, so we just return 0
            return 0;
        } else {
            return PRECISE_UNIT.divideDecimalRoundPrecise(exp(uint(-x)));
        }
    }

    /**
     * @dev Returns the square root of the value using Newton's method. This ignores the unit, so numbers should be
     * multiplied by their unit before being passed in.
     */
    function sqrt(uint x) public pure returns (uint y) {
        uint z = (x.add(1)) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    /**
     * @dev Returns the square root of the value using Newton's method.
     */
    function sqrtPrecise(uint x) internal pure returns (uint) {
        // Add in an extra unit factor for the square root to gobble;
        // otherwise, sqrt(x * UNIT) = sqrt(x) * sqrt(UNIT)
        return sqrt(x.mul(PRECISE_UNIT));
    }
}
