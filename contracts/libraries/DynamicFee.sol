pragma solidity ^0.5.16;

// Libraries
import "./SafeDecimalMath.sol";

library DynamicFee {
    using SafeDecimalMath for uint;
    uint public constant PRICE_DIFFERENTIAL_THREASHOLD_NUMERATOR = 4;
    uint public constant PRICE_DIFFERENTIAL_THREASHOLD_DENUMERATOR = 100;

    /// @notice Calculate price differential
    /// @param price Current round price
    /// @param previousPrice Previous round price
    function getPriceDifferential(uint price, uint previousPrice) public pure returns (uint) {
        int(price.divideDecimal(previousPrice)) - 1;
    }
}
