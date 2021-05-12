pragma solidity ^0.5.16;

pragma experimental ABIEncoderV2;

// Inheritance
import "./interfaces/IAddressResolver.sol";
import "./interfaces/ICollateralLoan.sol";
import "./interfaces/IExchangeRates.sol";

import "./SafeDecimalMath.sol";

contract CollateralUtil is ICollateralLoan {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";
    bytes32 private constant sUSD = "sUSD";

    IAddressResolver public addressResolverProxy;

    function _exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(addressResolverProxy.requireAndGetAddress(CONTRACT_EXRATES, "Missing ExchangeRates contract"));
    }

    constructor(address _resolver) public {
        addressResolverProxy = IAddressResolver(_resolver);
    }

    /* ========== VIEW FUNCS ========== */

    function getCollateralRatio(Loan memory loan, bytes32 collateralKey) public view returns (uint cratio) {
        uint cvalue = _exchangeRates().effectiveValue(collateralKey, loan.collateral, sUSD);
        uint dvalue = _exchangeRates().effectiveValue(loan.currency, loan.amount.add(loan.accruedInterest), sUSD);
        return cvalue.divideDecimal(dvalue);
    }

    function collateralizationInfo(uint id, address account)
        external
        view
        returns (
            uint,
            uint,
            uint
        )
    {
        uint cratio = getCollateralRatio(id, account);
        uint amount = getAmount(id, account);
        uint collateral = getCollateral(id, account);
        return (cratio, amount, collateral);
    }

    function maxLoan(
        uint amount,
        bytes32 currency,
        uint minCratio
    ) public view returns (uint max) {
        uint ratio = SafeDecimalMath.unit().divideDecimalRound(minCratio);
        return ratio.multiplyDecimal(_exchangeRates().effectiveValue(collateralKey, amount, currency));
    }

    function liquidationAmount(
        Loan memory loan,
        uint minCratio,
        uint liquidationPenalty
    ) public view returns (uint amount) {
        uint debtValue = _exchangeRates().effectiveValue(loan.currency, loan.amount.add(loan.accruedInterest), sUSD);
        uint collateralValue = _exchangeRates().effectiveValue(collateralKey, loan.collateral, sUSD);
        uint unit = SafeDecimalMath.unit();

        uint dividend = debtValue.sub(collateralValue.divideDecimal(minCratio));
        uint divisor = unit.sub(unit.add(liquidationPenalty).divideDecimal(minCratio));

        uint sUSDamount = dividend.divideDecimal(divisor);

        return _exchangeRates().effectiveValue(sUSD, sUSDamount, loan.currency);
    }

    function collateralRedeemed(
        bytes32 currency,
        uint amount,
        uint liquidationPenalty
    ) public view returns (uint collateral) {
        collateral = _exchangeRates().effectiveValue(currency, amount, collateralKey);

        return collateral.multiplyDecimal(SafeDecimalMath.unit().add(liquidationPenalty));
    }
}
