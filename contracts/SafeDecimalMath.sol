/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       SafeDecimalMath.sol
version:    1.0
author:     Anton Jurisevic

date:       2018-2-5

checked:    Mike Spain
approved:   Samuel Brooks

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

A fixed point decimal library that provides basic mathematical
operations, and checks for unsafe arguments, for example that
would lead to overflows.

Exceptions are thrown whenever those unsafe operations
occur.

-----------------------------------------------------------------
*/

pragma solidity 0.4.25;


/**
 * @title Safely manipulate unsigned fixed-point decimals at a given precision level.
 * @dev Functions accepting uints in this contract and derived contracts
 * are taken to be such fixed point decimals (including fiat, ether, and nomin quantities).
 */
contract SafeDecimalMath {

    /* Number of decimal places in the representation. */
    uint8 public constant decimals = 18;
    // uint8 public constant highPrecisionDecimals = 27;

    /* The number representing 1.0. */
    uint public constant UNIT = 10 ** uint(decimals);
    // uint private constant HIGH_PRECISION_UNIT = 10 ** uint(highPrecisionDecimals);
    // uint private constant HIGH_PRECISION_UNIT_EXPANDED = HIGH_PRECISION_UNIT * 10;
    // uint private constant UNIT_TO_HIGH_PRECISION_UNIT_CONVERTER = 10 ** uint(highPrecisionDecimals - decimals);

    /**
     * @return True iff adding x and y will not overflow.
     */
    function addIsSafe(uint x, uint y)
        internal
        pure
        returns (bool)
    {
        return x + y >= y;
    }

    /**
     * @return The result of adding x and y, throwing an exception in case of overflow.
     */
    function safeAdd(uint x, uint y)
        internal
        pure
        returns (uint)
    {
        require(x + y >= y, "Addition would cause overflow");
        return x + y;
    }

    /**
     * @return True if subtracting y from x will not overflow in the negative direction.
     */
    function subIsSafe(uint x, uint y)
        internal
        pure
        returns (bool)
    {
        return y <= x;
    }

    /**
     * @return The result of subtracting y from x, throwing an exception in case of overflow.
     */
    function safeSub(uint x, uint y)
        internal
        pure
        returns (uint)
    {
        require(y <= x, "Subtraction would cause overflow");
        return x - y;
    }

    /**
     * @return True if multiplying x and y would not overflow.
     */
    function mulIsSafe(uint x, uint y)
        internal
        pure
        returns (bool)
    {
        if (x == 0) {
            return true;
        }
        return (x * y) / x == y;
    }

    /**
     * @return The result of multiplying x and y, throwing an exception in case of overflow.
     */
    function safeMul(uint x, uint y)
        internal
        pure
        returns (uint)
    {
        if (x == 0) {
            return 0;
        }
        uint p = x * y;
        require(p / x == y, "Safe mul failed");
        return p;
    }

    /**
     * @return The result of multiplying x and y, interpreting the operands as fixed-point
     * decimals. Throws an exception in case of overflow.
     * 
     * @dev A unit factor is divided out after the product of x and y is evaluated,
     * so that product must be less than 2**256.
     * Incidentally, the internal division always rounds down: one could have rounded to the nearest integer,
     * but then one would be spending a significant fraction of a cent (of order a microether
     * at present gas prices) in order to save less than one part in 0.5 * 10^18 per operation, if the operands
     * contain small enough fractional components. It would also marginally diminish the 
     * domain this function is defined upon. 
     */
    function safeMul_dec(uint x, uint y)
        internal
        pure
        returns (uint)
    {
        /* Divide by UNIT to remove the extra factor introduced by the product. */
        return safeMul(x, y) / UNIT;
    }

    // TODO: Docs
    function safeMul_dec_round(uint x, uint y)
        internal
        pure
        returns (uint)
    {
        /* Divide by UNIT to remove the extra factor introduced by the product. */
        // uint product = safeMul(x, y);
        // uint modifiedUnit = UNIT / 10;

        uint quotientTen = safeMul(x, y) / (UNIT / 10);

        if (quotientTen % 10 >= 5) {
            quotientTen = quotientTen + 10;
        }

        return quotientTen / 10;
    }

    /**
     * @return True if the denominator of x/y is nonzero.
     */
    function divIsSafe(uint, uint y)
        internal
        pure
        returns (bool)
    {
        return y != 0;
    }

    /**
     * @return The result of dividing x by y, throwing an exception if the divisor is zero.
     */
    function safeDiv(uint x, uint y)
        internal
        pure
        returns (uint)
    {
        /* Although a 0 denominator already throws an exception,
         * it is equivalent to a THROW operation, which consumes all gas.
         * A require statement emits REVERT instead, which remits remaining gas. */
        require(y != 0, "Denominator cannot be zero");
        return x / y;
    }

    /**
     * @return The result of dividing x by y, interpreting the operands as fixed point decimal numbers.
     * @dev Throws an exception in case of overflow or zero divisor; x must be less than 2^256 / UNIT.
     * Internal rounding is downward: a similar caveat holds as with safeDecMul().
     */
    function safeDiv_dec(uint x, uint y)
        internal
        pure
        returns (uint)
    {
        /* Reintroduce the UNIT factor that will be divided out by y. */
        return safeDiv(safeMul(x, UNIT), y);
    }

    function safeDiv_dec_round(uint x, uint y)
        internal
        pure
        returns (uint)
    {
        uint resultTimesTen = safeDiv(safeMul(x, UNIT * 10), y);

        if (resultTimesTen % 10 >= 5) {
            resultTimesTen += 10;
        }

        return resultTimesTen / 10;
    }

    // function safeDiv_dec_high_precision(uint x, uint y)
    //     internal
    //     pure
    //     returns (uint)
    // {
    //     uint resultTimesTen = safeDiv(safeMul(x, HIGH_PRECISION_UNIT_EXPANDED), y);

    //     if (resultTimesTen % 10 >= 5) {
    //         resultTimesTen += 10;
    //     }

    //     return resultTimesTen / 10;
    // }

    // function safeDiv_dec_round(uint x, uint y)
    //     internal
    //     pure
    //     returns (uint)
    // {
    //     /* Reintroduce the UNIT factor that will be divided out by y. */
    //     uint divResultTimesTen = safeDiv(safeMul(x, HIGH_PRECISION_UNIT), y);
    //     uint divResultExtraZero = safeMul(safeDiv(divResultTimesTen, 10), 10);

    //     uint divResult = safeDiv(safeMul(x, UNIT), y);

    //     uint difference = divResultTimesTen - divResultExtraZero;
    //     return difference >= 5 ? divResult + 1 : divResult;
    // }

    /**
     * @dev Convert an unsigned integer to a unsigned fixed-point decimal.
     * Throw an exception if the result would be out of range.
     */
    function intToDec(uint i)
        internal
        pure
        returns (uint)
    {
        return safeMul(i, UNIT);
    }

    // TODO: Docs
    // function intToHighPrecisionDec(uint i)
    //     internal
    //     pure
    //     returns (uint)
    // {
    //     return safeMul(i, HIGH_PRECISION_UNIT);
    // }

    // // TODO: Docs
    // function decToHighPrecisionDec(uint i)
    //     internal
    //     pure
    //     returns (uint)
    // {
    //     return safeMul(i, UNIT_TO_HIGH_PRECISION_UNIT_CONVERTER);
    // }

    // /**
    //  * @dev Divides two numbers and returns the remainder (unsigned integer modulo),
    //  * reverts when dividing by zero.
    //  */
    // function mod(uint x, uint y) internal pure returns (uint256) {
    //     require(y != 0);
    //     return a % b;
    // }
}
