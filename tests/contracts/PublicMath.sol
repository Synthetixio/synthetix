/* PublicMath.sol: expose the internal functions in SafeDecimalMath
 * for testing purposes.
 */
pragma solidity ^0.4.21;

import "contracts/SafeDecimalMath.sol";

contract PublicMath is SafeDecimalMath {
    
    function pubAddIsSafe(uint x, uint y)
        pure
        public
        returns (bool)
    {
        return addIsSafe(x, y);
    }

    function pubSafeAdd(uint x, uint y)
        pure
        public
        returns (uint)
    {
        return safeAdd(x, y);
    }

    function pubSubIsSafe(uint x, uint y)
        pure
        public
        returns (bool)
    {
        return subIsSafe(x, y);
    }

    function pubSafeSub(uint x, uint y)
        pure
        public
        returns (uint)
    {
        return safeSub(x, y);
    }

    function pubMulIsSafe(uint x, uint y)
        pure
        public
        returns (bool)
    {
        return mulIsSafe(x, y);
    }

    function pubSafeMul(uint x, uint y)
        pure
        public
        returns (uint)
    {
        return safeMul(x, y);
    }

    function pubSafeMul_dec(uint x, uint y)
        pure
        public
        returns (uint)
    {
        return safeMul_dec(x, y);
    }

    function pubDivIsSafe(uint x, uint y)
        pure
        public
        returns (bool)
    {
        return divIsSafe(x, y);
    }

    function pubSafeDiv(uint x, uint y)
        pure
        public
        returns (uint)
    {
        return safeDiv(x, y);
    }

    function pubSafeDiv_dec(uint x, uint y)
        pure
        public
        returns (uint)
    {
        return safeDiv_dec(x, y);
    }

    function pubIntToDec(uint i)
        pure
        public
        returns (uint)
    {
        return intToDec(i);
    }
}
