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
            int e = int(_exp(res));
            next = res.add((int(x).sub(e).mul(2)).divideDecimalRoundPrecise(int(x).add(e)));
            if (next == res) {
                break;
            }
            res = next;
        }

        return res;
    }

    /**
     * @dev Returns the exponent of the value using taylor expansion with range reduction.
     */
    function _exp(uint x) public pure returns (uint) {
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
    function _exp(int x) public pure returns (uint) {
        if (0 <= x) {
            return _exp(uint(x));
        } else if (x < MIN_EXP) {
            // exp(-63) < 1e-27, so we just return 0
            return 0;
        } else {
            return PRECISE_UNIT.divideDecimalRoundPrecise(_exp(uint(-x)));
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
