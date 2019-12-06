pragma solidity 0.4.25;

import "./SafeDecimalMath.sol";

contract Math {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    function powDecimal(uint x, uint n)
        internal
        pure
        returns (uint)
    {
        uint temp = SafeDecimalMath.unit();
        while (n > 0) {
            if (n % 2 != 0) {
                temp = temp.multiplyDecimal(x);
            }
            x = x.multiplyDecimal(x);
            n = n / 2;
        }
        return temp;
    }
}
    