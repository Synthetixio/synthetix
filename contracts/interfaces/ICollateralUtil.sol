pragma solidity >=0.4.24;

pragma experimental ABIEncoderV2;

import "./ICollateralLoan.sol";

interface ICollateralUtil {
    function getCollateralRatio(ICollateralLoan.Loan calldata loan, bytes32 collateralKey)
        external
        view
        returns (uint cratio);

    function maxLoan(
        uint amount,
        bytes32 currency,
        uint minCratio,
        bytes32 collateralKey
    ) external view returns (uint max);

    function liquidationAmount(
        ICollateralLoan.Loan calldata loan,
        uint minCratio,
        bytes32 collateralKey
    ) external view returns (uint amount);

    function collateralRedeemed(
        bytes32 currency,
        uint amount,
        bytes32 collateralKey
    ) external view returns (uint collateral);
}
