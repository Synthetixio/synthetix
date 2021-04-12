pragma solidity ^0.5.16;

pragma experimental ABIEncoderV2;

import "./SafeDecimalMath.sol";
import "./CollateralState.sol";
import "./interfaces/ICollateralManager.sol";
import "./interfaces/ICollateralLoan.sol";

interface ICollateralState {
    function getLoan(address account, uint256 loanID) external view returns (ICollateralLoan.Loan memory loan);
}

interface ICollateral {
    function synthsByKey(bytes32) external view returns (bytes32);

    function manager() external view returns (address);

    function state() external view returns (ICollateralState);
}

contract AccruedInterestUtil is ICollateralLoan {
    /* ========== LIBRARIES ========== */
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    // define and emit events
    function getAccruedInterest(
        address userAddress,
        uint256 loanId,
        address collateralContract
    ) external view returns (uint) {
        ICollateral collateral = ICollateral(collateralContract);
        ICollateralManager _manager = ICollateralManager(collateral.manager());
        ICollateralState state = collateral.state();
        ICollateralLoan.Loan memory loan = state.getLoan(userAddress, loanId);

        // 1. Get the rates we need.
        (uint entryRate, uint lastRate, uint lastUpdated, ) =
            loan.short
                ? _manager.getShortRatesAndTime(loan.currency, loan.interestIndex)
                : _manager.getRatesAndTime(loan.interestIndex);

        // 2. Get the instantaneous rate.
        (uint rate, bool invalid) =
            loan.short ? _manager.getShortRate(collateral.synthsByKey(loan.currency)) : _manager.getBorrowRate();

        require(!invalid, "Rates are invalid");

        // 3. Get the time since we last updated the rate.
        uint timeDelta = block.timestamp.sub(lastUpdated).mul(SafeDecimalMath.unit());

        // 4. Get the latest cumulative rate. F_n+1 = F_n + F_last
        uint latestCumulative = lastRate.add(rate.multiplyDecimal(timeDelta));

        // 5. If the loan was just opened, don't record any interest. Otherwise multiple by the amount outstanding.
        uint interest = loan.interestIndex == 0 ? 0 : loan.amount.multiplyDecimal(latestCumulative.sub(entryRate));

        // 6. return the accrued interest from last time user updated the loan plus accrued interest since then
        return loan.accruedInterest.add(interest);
    }
}
