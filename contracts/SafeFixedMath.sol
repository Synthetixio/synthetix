pragma solidity ^0.4.19;

/* Safely manipulate fixed-point decimals at a given precision level. 
 * All functions accepting uints in this contract and derived contracts
 * are taken to be such fixed point decimals (including fiat, ether, and
 * nomin quantities). */
contract SafeFixedMath {
    
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
        assert(addIsSafe(x, y));
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
        assert(subIsSafe(x, y));
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

    /* Return the result of multiplying x and y, throwing an exception in case of overflow. */
    function safeMul(uint x, uint y)
        pure 
        internal 
        returns (uint)
    {
        assert(mulIsSafe(x, y));
        // Divide by UNIT to remove the extra factor introduced by the product.
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

    /* Return the result of dividing x by y, throwing an exception in case of overflow or zero divisor. */
    function safeDiv(uint x, uint y)
        pure
        internal
        returns (uint)
    {
        assert(mulIsSafe(x, UNIT)); // No need to use divIsSafe() here, as a 0 denominator already throws an exception.
        // Reintroduce the UNIT factor that will be divided out.
        return (x * UNIT) / y;
    }
}

