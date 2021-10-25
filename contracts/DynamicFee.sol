pragma solidity ^0.5.16;

// Libraries
import "./SafeDecimalMath.sol";
import "./Math.sol";

library DynamicFee {
    using SafeDecimalMath for uint;
    using Math for uint;
    using SafeMath for uint;

    /// @notice Calculate price differential -
    /// The difference between the current price and the previous price
    /// @param price Current round price
    /// @param previousPrice Previous round price
    /// @param threshold Threshold constant -
    /// A system constant for the price differential default to 40 bps
    /// @return uint price differential with 18 decimals
    /// only return if non-zero value, otherwise return 0
    function getPriceDifferential(
        uint price,
        uint previousPrice,
        uint threshold
    ) public pure returns (uint) {
        require(price > 0, "Price cannot be 0");
        require(previousPrice > 0, "Previous price cannot be 0");

        int abs = int(price.divideDecimal(previousPrice)) - int(SafeDecimalMath.unit());
        abs = abs > 0 ? abs : -abs;
        int priceDifferential = abs - int(threshold);
        return priceDifferential > 0 ? uint(priceDifferential) : uint(0);
    }

    /// @notice Calculate Price Weight
    /// @param round A round number that go back from
    /// the current round from 0 to N
    /// @param weightDecay Weight decay constant
    /// @return uint price weight
    function getPriceWeight(uint round, uint weightDecay) public pure returns (uint) {
        return weightDecay.powDecimal(round);
    }

    /// @notice Calculate dynamic fee based on preceding 10 price differential
    /// @param prices A list of prices from the current round to the previous rounds
    /// @param threshold A threshold to determine the price differential
    /// @param weightDecay A weight decay constant
    /// @return uint dynamic fee
    function getDynamicFee(
        uint[] memory prices,
        uint threshold,
        uint weightDecay
    ) public pure returns (uint dynamicFee) {
        uint size = prices.length;
        require(size >= 2, "Not enough prices");
        for (uint i = 0; i < size - 1; i++) {
            uint priceDifferential = getPriceDifferential(prices[i], prices[i + 1], threshold);
            uint priceWeight = getPriceWeight(i, weightDecay);
            dynamicFee = dynamicFee.add(priceDifferential.multiplyDecimal(priceWeight));
        }
    }
}
