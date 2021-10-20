pragma solidity ^0.8.8;

import "../SafeDecimalMath.sol";

contract MockEtherWrapper {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    uint public totalIssuedSynths;

    constructor() {}

    function setTotalIssuedSynths(uint value) external {
        totalIssuedSynths = value;
    }
}
