pragma solidity ^0.5.16;

import "../SafeDecimalMath.sol";

contract MockEtherWrapper {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    uint public totalIssuedSynths;

    constructor() public {}

    function mint(uint amount) external {
        totalIssuedSynths = totalIssuedSynths.add(amount);
    }

    function burn(uint amount) external {
        totalIssuedSynths = totalIssuedSynths.sub(amount);
    }
}
