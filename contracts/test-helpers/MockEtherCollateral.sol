pragma solidity 0.4.25;

import "../SafeDecimalMath.sol";

contract MockEtherCollateral {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    uint public totalIssuedSynths;

    constructor () public { }

    // Mock openLoan function
    function openLoan(uint amount) external {
        // Increment totalIssuedSynths
        totalIssuedSynths = totalIssuedSynths.add(amount);
    }
    
    function closeLoan(uint amount) external {
        // Increment totalIssuedSynths
        totalIssuedSynths = totalIssuedSynths.sub(amount);
    }
}
