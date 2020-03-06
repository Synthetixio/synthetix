pragma solidity ^0.5.16;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";

/**
 * @title The safe math test
 */

contract SafeMathTest {
    using SafeMath for uint;

    function doAdd(uint _a, uint _b) public pure returns(uint) {
        uint result = _a.add(_b);
        return result;
    }

    function doDiv(uint _a, uint _b) public pure returns(uint) {
        uint result = _a.div(_b);
        return result;
    }
}
