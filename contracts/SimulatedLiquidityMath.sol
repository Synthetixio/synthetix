pragma solidity ^0.5.16;

// Libraries
import "./Math.sol";
import "./SafeDecimalMath.sol";
import "./SignedSafeDecimalMath.sol";

library SimulatedLiquidityMath {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using SignedSafeDecimalMath for int;

    function _calculatePricePremiumIntegral(
        int n,
        uint delta,
        uint lambda
    ) public view returns (int) {
        int num = int(delta) - n;
        int denom = int(delta) + n;

        if (denom <= 0) {
            return -int(SafeDecimalMath.unit()) / 5; // -0.2
        } else if (num <= 0) {
            return int(SafeDecimalMath.unit()) / 5; // 0.2
        }

        // Math.ln accepts integers encoded with 27dp.
        // This scales from the default UNIT of 18dp.
        uint LN_SCALE_FACTOR = 10**9;
        uint UNIT = SafeDecimalMath.unit();

        return
            int(lambda).multiplyDecimal(int(delta) - n).multiplyDecimal(
                Math.ln(uint(num).divideDecimal(uint(denom)) * LN_SCALE_FACTOR) / int(LN_SCALE_FACTOR)
            ) +
            int(2 * UNIT).multiplyDecimal(int(delta)).multiplyDecimal(int(lambda)).multiplyDecimal(
                Math.ln((delta + uint(n)) * LN_SCALE_FACTOR) / int(LN_SCALE_FACTOR)
            );
    }

    function calculateQuotePrice(
        int s,
        int n,
        uint _O,
        uint lambda,
        uint delta
    ) internal view returns (int) {
        if (s == 0) {
            return int(_O);
        }

        return
            int(_O) +
            int(_O).divideDecimal(s).multiplyDecimal(
                _calculatePricePremiumIntegral(n + s, delta, lambda) - _calculatePricePremiumIntegral(n, delta, lambda)
            );
    }

    // Gets the quote for a trade to buy `buyAmount` of an asset at a given oracle price,
    // given the simulated liquidity parameters of the asset.
    function getSimulatedQuote(
        int openInterest,
        uint priceImpactFactor,
        uint maxOpenInterest,
        uint oraclePrice,
        int buyAmount
    ) public view returns (int quotePrice, int quoteAmount) {
        // premium_ = premium(open_interest + amount, delta, lambda_)
        // mark_price = rate * (1 + premium_)
        quotePrice = calculateQuotePrice(buyAmount, openInterest, oraclePrice, priceImpactFactor, maxOpenInterest);
        quoteAmount = buyAmount.multiplyDecimal(quotePrice);
        return (quotePrice, quoteAmount);
    }
}
