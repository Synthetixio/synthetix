pragma solidity ^0.5.16;

import "../SafeDecimalMath.sol";

contract MockEtherWrapper {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    uint public totalIssuedSynths;

    constructor() public {}

    function setTotalIssuedSynths(uint value) external {
        totalIssuedSynths = value;
    }
}
