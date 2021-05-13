pragma solidity >=0.4.24;

pragma experimental ABIEncoderV2;

import "./ICollateralLoan.sol";

interface ICollateralUtil {
    // TODO import Loan struct into this interface

    function getCollateralRatio(Loan calldata loan, bytes32 collateralKey) external view returns (uint cratio);

    function collateralizationInfo(Loan calldata loan, bytes32 collateralKey)
        external
        view
        returns (
            uint,
            uint,
            uint
        );

    function maxLoan(
        uint amount,
        bytes32 currency,
        uint minCratio,
        bytes32 collateralKey
    ) external view returns (uint max);

    function liquidationAmount(
        Loan calldata loan,
        uint minCratio,
        uint liquidationPenalty,
        bytes32 collateralKey
    ) external view returns (uint amount);

    function collateralRedeemed(
        bytes32 currency,
        uint amount,
        uint liquidationPenalty,
        bytes32 collateralKey
    ) external view returns (uint collateral);
}
