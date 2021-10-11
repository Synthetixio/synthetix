/* PublicSimulatedLiquidityMath.sol: expose the internal functions in SimulatedLiquidityMath library
 * for testing purposes.
 */
pragma solidity ^0.5.16;

import "../SimulatedLiquidityMath.sol";

contract PublicSimulatedLiquidityMath {
    function getSimulatedQuote(
        int openInterest,
        uint lambda,
        uint delta,
        uint oraclePrice,
        int buyAmount
    ) public view returns (int quotePrice, int quoteAmount) {
        return SimulatedLiquidityMath.getSimulatedQuote(openInterest, lambda, delta, oraclePrice, buyAmount);
    }
}
