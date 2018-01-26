/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       SafeDecimalMath.sol
version:    0.1
author:     Block8 Technologies, in partnership with Havven

            Anton Jurisevic

date:       2018-1-3

checked:    Samuel Brooks
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
LICENCE INFORMATION
-----------------------------------------------------------------

Copyright (c) 2018 Havven.io

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

-----------------------------------------------------------------
RELEASE NOTES
-----------------------------------------------------------------

-----------------------------------------------------------------
Block8 Technologies is accelerating blockchain technology
by incubating meaningful next-generation businesses.
Find out more at https://www.block8.io/
-----------------------------------------------------------------
*/

pragma solidity ^0.4.19;


/* Safely manipulate unsigned fixed-point decimals at a given precision level.
 * All functions accepting uints in this contract and derived contracts
 * are taken to be such fixed point decimals (including fiat, ether, and
 * nomin quantities). */
contract SafeDecimalMath {

    // Number of decimal places in the representation.
    uint public constant decimals = 18;

    // The number representing 1.0.
    uint public constant UNIT = 10 ** decimals;

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

    /* Return the result of multiplying x and y, throwing an exception in case of overflow.
     * A factor of the units is divided out AFTER the product of x and y is evaluated,
     * so that product must be less than 2**256.
     */
    function safeDecMul(uint x, uint y)
        pure
        internal
        returns (uint)
    {
        require(mulIsSafe(x, y));
        // Divide by UNIT to remove the extra factor introduced by the product.
        // UNIT can't actually be 0.
        return (x * y) / UNIT;
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
        // No need to use divIsSafe() here, as a 0 denominator already throws an exception.
        return x / y;
    }

    /* Return the result of dividing x by y, throwing an exception in case of overflow or zero divisor.
     * x must be less than 2^256 / UNIT. */
    function safeDecDiv(uint x, uint y)
        pure
        internal
        returns (uint)
    {
        // Reintroduce the UNIT factor that will be divided out by y.
        return safeDiv(safeMul(x, UNIT), y);
    }

    /* Convert an unsigned integer to a unsigned fixed-point decimal.*/
    function intToDec(uint i)
        pure
        internal
        returns (uint)
    {
        return safeDecMul(i, UNIT);
    }
}
