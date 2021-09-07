pragma solidity ^0.5.16;

// Libraries
import "./SafeDecimalMath.sol";
import "openzeppelin-solidity-2.3.0/contracts/drafts/SignedSafeMath.sol";

library SignedSafeDecimalMath {
  using SignedSafeMath for int;

  /* Number of decimal places in the representations. */
  uint8 public constant decimals = 18;
  uint8 public constant highPrecisionDecimals = 27;

  /* The number representing 1.0. */
  int public constant UNIT = int(10**uint(decimals));

  /* The number representing 1.0 for higher fidelity numbers. */
  int public constant PRECISE_UNIT = int(10**uint(highPrecisionDecimals));
  int private constant UNIT_TO_HIGH_PRECISION_CONVERSION_FACTOR = int(10**uint(highPrecisionDecimals - decimals));

  /**
   * @return Provides an interface to UNIT.
   */
  function unit() external pure returns (int) {
    return UNIT;
  }

  /**
   * @return Provides an interface to PRECISE_UNIT.
   */
  function preciseUnit() external pure returns (int) {
    return PRECISE_UNIT;
  }

  /**
   * @return The result of multiplying x and y, interpreting the operands as fixed-point
   * decimals.
   *
   * @dev A unit factor is divided out after the product of x and y is evaluated,
   * so that product must be less than 2**256. As this is an integer division,
   * the internal division always rounds down. This helps save on gas. Rounding
   * is more expensive on gas.
   */
  function multiplyDecimal(int x, int y) internal pure returns (int) {
    /* Divide by UNIT to remove the extra factor introduced by the product. */
    return x.mul(y) / UNIT;
  }

  /**
   * @return The result of safely multiplying x and y, interpreting the operands
   * as fixed-point decimals of the specified precision unit.
   *
   * @dev The operands should be in the form of a the specified unit factor which will be
   * divided out after the product of x and y is evaluated, so that product must be
   * less than 2**256.
   *
   * Unlike multiplyDecimal, this function rounds the result to the nearest increment.
   * Rounding is useful when you need to retain fidelity for small decimal numbers
   * (eg. small fractions or percentages).
   */
  function _multiplyDecimalRound(
    int x,
    int y,
    int precisionUnit
  ) private pure returns (int) {
    /* Divide by UNIT to remove the extra factor introduced by the product. */
    int quotientTimesTen = x.mul(y) / (precisionUnit / 10);

    if (quotientTimesTen % 10 >= 5) {
      quotientTimesTen += 10;
    }

    return quotientTimesTen / 10;
  }

  /**
   * @return The result of safely multiplying x and y, interpreting the operands
   * as fixed-point decimals of a precise unit.
   *
   * @dev The operands should be in the precise unit factor which will be
   * divided out after the product of x and y is evaluated, so that product must be
   * less than 2**256.
   *
   * Unlike multiplyDecimal, this function rounds the result to the nearest increment.
   * Rounding is useful when you need to retain fidelity for small decimal numbers
   * (eg. small fractions or percentages).
   */
  function multiplyDecimalRoundPrecise(int x, int y) internal pure returns (int) {
    return _multiplyDecimalRound(x, y, PRECISE_UNIT);
  }

  /**
   * @return The result of safely multiplying x and y, interpreting the operands
   * as fixed-point decimals of a standard unit.
   *
   * @dev The operands should be in the standard unit factor which will be
   * divided out after the product of x and y is evaluated, so that product must be
   * less than 2**256.
   *
   * Unlike multiplyDecimal, this function rounds the result to the nearest increment.
   * Rounding is useful when you need to retain fidelity for small decimal numbers
   * (eg. small fractions or percentages).
   */
  function multiplyDecimalRound(int x, int y) internal pure returns (int) {
    return _multiplyDecimalRound(x, y, UNIT);
  }

  /**
   * @return The result of safely dividing x and y. The return value is a high
   * precision decimal.
   *
   * @dev y is divided after the product of x and the standard precision unit
   * is evaluated, so the product of x and UNIT must be less than 2**256. As
   * this is an integer division, the result is always rounded down.
   * This helps save on gas. Rounding is more expensive on gas.
   */
  function divideDecimal(int x, int y) internal pure returns (int) {
    /* Reintroduce the UNIT factor that will be divided out by y. */
    return x.mul(UNIT).div(y);
  }

  /**
   * @return The result of safely dividing x and y. The return value is as a rounded
   * decimal in the precision unit specified in the parameter.
   *
   * @dev y is divided after the product of x and the specified precision unit
   * is evaluated, so the product of x and the specified precision unit must
   * be less than 2**256. The result is rounded to the nearest increment.
   */
  function _divideDecimalRound(
    int x,
    int y,
    int precisionUnit
  ) private pure returns (int) {
    int resultTimesTen = x.mul(precisionUnit * 10).div(y);

    if (resultTimesTen % 10 >= 5) {
      resultTimesTen += 10;
    }

    return resultTimesTen / 10;
  }

  /**
   * @return The result of safely dividing x and y. The return value is as a rounded
   * standard precision decimal.
   *
   * @dev y is divided after the product of x and the standard precision unit
   * is evaluated, so the product of x and the standard precision unit must
   * be less than 2**256. The result is rounded to the nearest increment.
   */
  function divideDecimalRound(int x, int y) internal pure returns (int) {
    return _divideDecimalRound(x, y, UNIT);
  }

  /**
   * @return The result of safely dividing x and y. The return value is as a rounded
   * high precision decimal.
   *
   * @dev y is divided after the product of x and the high precision unit
   * is evaluated, so the product of x and the high precision unit must
   * be less than 2**256. The result is rounded to the nearest increment.
   */
  function divideDecimalRoundPrecise(int x, int y) internal pure returns (int) {
    return _divideDecimalRound(x, y, PRECISE_UNIT);
  }

  /**
   * @dev Convert a standard decimal representation to a high precision one.
   */
  function decimalToPreciseDecimal(int i) internal pure returns (int) {
    return i.mul(UNIT_TO_HIGH_PRECISION_CONVERSION_FACTOR);
  }

  /**
   * @dev Convert a high precision decimal to a standard decimal representation.
   */
  function preciseDecimalToDecimal(int i) internal pure returns (int) {
    int quotientTimesTen = i / (UNIT_TO_HIGH_PRECISION_CONVERSION_FACTOR / 10);

    if (quotientTimesTen % 10 >= 5) {
      quotientTimesTen += 10;
    }

    return quotientTimesTen / 10;
  }
}


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

  /**
   * @dev Returns the exponent of the value using taylor expansion with range reduction.
   */
  function exp(uint x) public pure  returns (uint) {
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
  function exp(int x) public pure  returns (uint) {
    if (0 <= x) {
      return exp(uint(x));
    } else if (x < MIN_EXP) {
      // exp(-63) < 1e-27, so we just return 0
      return 0;
    } else {
      return PRECISE_UNIT.divideDecimalRoundPrecise(exp(uint(-x)));
    }
  }
}
