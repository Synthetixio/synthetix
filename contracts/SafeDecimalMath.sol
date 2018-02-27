/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       SafeDecimalMath.sol
version:    0.2
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

pragma solidity ^0.4.20;


/* Safely manipulate unsigned fixed-point decimals at a given precision level.
 * All functions accepting uints in this contract and derived contracts
 * are taken to be such fixed point decimals (including fiat, ether, and
 * nomin quantities). */
contract SafeDecimalMath {

    // Number of decimal places in the representation.
    uint8 public constant decimals = 18;

    // The number representing 1.0.
    uint public constant UNIT = 10 ** uint(decimals);

    /* True iff adding x and y will not overflow. */
    function addIsSafe(uint x, uint y)
        pure
        internal
        returns (bool)
    {
        return x + y >= y;
    }

    /* Return the result of adding x and y, throwing an exception in case of overflow. */
    function safeAdd(uint x, uint y)
        pure
        internal
        returns (uint)
    {
        require(addIsSafe(x, y));
        return x + y;
    }

    /* True iff subtracting y from x will not overflow in the negative direction. */
    function subIsSafe(uint x, uint y)
        pure
        internal
        returns (bool)
    {
        return y <= x;
    }

    /* Return the result of subtracting y from x, throwing an exception in case of overflow. */
    function safeSub(uint x, uint y)
        pure
        internal
        returns (uint)
    {
        require(subIsSafe(x, y));
        return x - y;
    }

    /* True iff multiplying x and y would not overflow. */
    function mulIsSafe(uint x, uint y)
        pure
        internal
        returns (bool)
    {
        if (x == 0) {
            return true;
        }
        uint r = x * y;
        return r / x == y;
    }

    /* Return the result of multiplying x and y, throwing an exception in case of overflow.*/
    function safeMul(uint x, uint y)
        pure
        internal
        returns (uint)
    {
        require(mulIsSafe(x, y));
        return x * y;
    }

    /* Return the result of multiplying x and y, interpreting the operands as fixed-point
     * demicimals. Throws an exception in case of overflow. A unit factor is divided out
     * after the product of x and y is evaluated, so that product must be less than 2**256.
     * 
     * Incidentally, the internal division always rounds down: we could have rounded to the nearest integer,
     * but then we would be spending a significant fraction of a cent (of order a microether
     * at present gas prices) in order to save less than one part in 0.5 * 10^18 per operation, if the operands
     * contain small enough fractional components. It would also marginally diminish the 
     * domain this function is defined upon. 
     */
    function safeDecMul(uint x, uint y)
        pure
        internal
        returns (uint)
    {
        // Divide by UNIT to remove the extra factor introduced by the product.
        // UNIT be 0.
        return safeMul(x, y) / UNIT;

    }

    /* True iff the denominator of x/y is nonzero. */
    function divIsSafe(uint x, uint y)
        pure
        internal
        returns (bool)
    {
        return y != 0;
    }

    /* Return the result of dividing x by y, throwing an exception if the divisor is zero. */
    function safeDiv(uint x, uint y)
        pure
        internal
        returns (uint)
    {
        // Although a 0 denominator already throws an exception,
        // it is equivalent to a THROW operation, which consumes all gas.
        // A require statement emits REVERT instead, which remits remaining gas.
        require(divIsSafe(x, y));
        return x / y;
    }

    /* Return the result of dividing x by y, interpreting the operands as fixed point decimal numbers.
     * Throws an exception in case of overflow or zero divisor; x must be less than 2^256 / UNIT.
     * Internal rounding is downward: a similar caveat holds as with safeDecMul().*/
    function safeDecDiv(uint x, uint y)
        pure
        internal
        returns (uint)
    {
        // Reintroduce the UNIT factor that will be divided out by y.
        return safeDiv(safeMul(x, UNIT), y);
    }

    /* Convert an unsigned integer to a unsigned fixed-point decimal.
     * Throw an exception if the result would be out of range. */
    function intToDec(uint i)
        pure
        internal
        returns (uint)
    {
        return safeMul(i, UNIT);
    }
}
