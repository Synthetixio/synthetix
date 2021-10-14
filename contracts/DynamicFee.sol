pragma solidity ^0.5.16;

// Libraries
import "./SafeDecimalMath.sol";
import "./Math.sol";

library DynamicFee {
    using SafeDecimalMath for uint;
    using Math for uint;
    using SafeMath for uint;

    /// @notice Get threshold constant default 0.4%
    /// @return uint threshold constant
    function threshold() public pure returns (uint) {
        return 4 * 10**uint(SafeDecimalMath.decimals() - 3);
    }

    /// @notice Get weight decay constant default 0.9
    /// @return uint weight decay constant
    function weightDecay() public pure returns (uint) {
        return 9 * 10**uint(SafeDecimalMath.decimals() - 1);
    }

    /// @notice Calculate price differential
    /// @param price Current round price
    /// @param previousPrice Previous round price
    /// @return uint price differential
    function getPriceDifferential(uint price, uint previousPrice) public pure returns (uint) {
        int(price.divideDecimal(previousPrice)) - 1;

        int abs = int(price.divideDecimal(previousPrice)) - int(SafeDecimalMath.unit());
        abs = abs > 0 ? abs : -abs;
        return abs > int(threshold()) ? uint(abs) : uint(0);
    }

    /// @notice Calculate Price Weight
    /// @param round A round number that go back from
    /// the current round from 0 to N
    /// @return uint price weight
    function getPriceWeight(uint round) public pure returns (uint) {
        return weightDecay().powDecimal(round);
    }

    /// @notice Calculate dynamic fee based on preceding 10 price differential
    /// @param prices A list of prices from the current round to the previous rounds
    /// @return uint dynamic fee
    function getDynamicFee(uint[] memory prices) public pure returns (uint dynamicFee) {
        uint size = prices.length;
        require(size >= 2, "Not enough prices");
        for (uint i = 0; i < size - 1; i++) {
            uint priceDifferential = getPriceDifferential(prices[i], prices[i + 1]);
            uint priceWeight = getPriceWeight(i);
            dynamicFee = dynamicFee.add(priceDifferential.multiplyDecimal(priceWeight));
        }
    }
}
