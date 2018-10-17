/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       SafeDecimalMath.sol
version:    1.0
author:     Anton Jurisevic
            Gavin Conway

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

import "./SafeMath.sol";

/**
 * @title Safely manipulate unsigned fixed-point decimals at a given precision level.
 * @dev Functions accepting uints in this contract and derived contracts
 * are taken to be such fixed point decimals (including fiat, ether, and nomin quantities).
 */
contract SafeDecimalMath {

    using SafeMath for uint;

    /* Number of decimal places in the representations. */
    uint8 public constant decimals = 18;
    uint8 public constant highPrecisionDecimals = 27;

    /* The number representing 1.0. */
    uint public constant UNIT = 10 ** uint(decimals);

    /* The number representing 1.0 for higher fidelity numbers. */
    uint public constant HIGH_PRECISION_UNIT = 10 ** uint(highPrecisionDecimals);
    uint private constant UNIT_TO_HIGH_PRECISION_UNIT_CONVERTER = 10 ** uint(highPrecisionDecimals - decimals);


    // TODO: Replace with OpenZeppelin's implementation
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

    // TODO: Replace with OpenZeppelin's implementation
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
        return x.mul(y) / UNIT;
    }

    function safeMul_dec_round_private(uint x, uint y, uint unit)
        private
        pure
        returns (uint)
    {
        /* Divide by UNIT to remove the extra factor introduced by the product. */
        // uint quotientTimesTen = safeMul(x, y) / (unit / 10);
        uint quotientTimesTen = x.mul(y) / (unit / 10);

        if (quotientTimesTen % 10 >= 5) {
            quotientTimesTen = quotientTimesTen + 10;
        }

        return quotientTimesTen / 10;
    }

    /**
     * @return The result of multiplying x and y, interpreting the operands as fixed-point
     * decimals. Throws an exception in case of overflow.
     *
     * @dev The operands should be in the form of a HIGH_PRECISION_UNIT factor which will be
     * divided out after the product of x and y is evaluated, so that product must be less than 2**256.
     *
     * Unlike safeMul_dec, this function is careful to round the result to the nearest integer.
     * This is useful when you need to retain fidelity for small decimal numbers (eg. small
     * fractions or percentages).
     */
    function safeMul_dec_round_high_precision(uint x, uint y)
        internal
        pure
        returns (uint)
    {
        return safeMul_dec_round_private(x, y, HIGH_PRECISION_UNIT);
    }

    /**
     * @return The result of multiplying x and y, interpreting the operands as fixed-point
     * decimals. Throws an exception in case of overflow.
     *
     * @dev The operands should be in the form of a standard UNIT factor which will be
     * divided out after the product of x and y is evaluated, so that product must be less than 2**256.
     *
     * Unlike safeMul_dec, this function is careful to round the result to the nearest integer.
     * This is useful when you need to retain fidelity for small decimal numbers (eg. small
     * fractions or percentages).
     */
    function safeMul_dec_round(uint x, uint y)
        internal
        pure
        returns (uint)
    {
        return safeMul_dec_round_private(x, y, UNIT);
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
        return x.mul(UNIT).div(y);
    }

    function safeDiv_dec_round_private(uint x, uint y, uint unit)
        private
        pure
        returns (uint)
    {
        uint resultTimesTen = x.mul(unit * 10).div(y);

        if (resultTimesTen % 10 >= 5) {
            resultTimesTen += 10;
        }

        return resultTimesTen / 10;
    }

    /**
     * @return The result of dividing x by y, interpreting the operands as fixed point decimal numbers.
     * @dev Throws an exception in case of overflow or zero divisor; x must be less than 2^256 / UNIT.
     * Internal rounding is to the nearest integer.
     */
    function safeDiv_dec_round(uint x, uint y)
        internal
        pure
        returns (uint)
    {
        return safeDiv_dec_round_private(x, y, UNIT);
    }

    /**
     * @return The result of dividing x by y, interpreting the operands as fixed point decimal numbers.
     * @dev Throws an exception in case of overflow or zero divisor; x must be less than 2^256 / HIGH_PRECISION_UNIT.
     * Internal rounding is to the nearest integer.
     */
    function safeDiv_dec_round_high_precision(uint x, uint y)
        internal
        pure
        returns (uint)
    {
        return safeDiv_dec_round_private(x, y, HIGH_PRECISION_UNIT);
    }

    /**
     * @dev Convert a standard decimal representation to a high precision one.
     * Throw an exception if the result would be out of range.
     */
    function decToHighPrecisionDec(uint i)
        internal
        pure
        returns (uint)
    {
        return i.mul(UNIT_TO_HIGH_PRECISION_UNIT_CONVERTER);
    }

    /**
     * @dev Convert a high precision decimal to a standard decimal representation.
     * Throw an exception if the result would be out of range.
     */
    function highPrecisionDecToDec(uint i)
        internal
        pure
        returns (uint)
    {
        uint quotientTimesTen = i / (UNIT_TO_HIGH_PRECISION_UNIT_CONVERTER / 10);

        if (quotientTimesTen % 10 >= 5) {
            quotientTimesTen += 10;
        }

        return quotientTimesTen / 10;
    }

}
