pragma solidity >=0.4.24;

pragma experimental ABIEncoderV2;

interface ILoan {
    struct Loan {
        // ID for the loan
        uint id;
        //  Acccount that created the loan
        address payable account;
        //  Amount of collateral deposited
        uint collateral;
        // The synth that was borowed
        bytes32 currency;
        //  Amount of synths borrowed
        uint amount;
        // interest amounts accrued
        uint accruedInterest;
        // last interest index
        uint interestIndex;
    }
}

interface ICollateral {
    function issuanceRatio() external view returns (uint iratio);

    function maxLoan(uint amount, bytes32 currency) external view returns (uint max);
}

interface ICollateralEth {
    function open(uint amount, bytes32 currency) external payable;

    function close(uint id) external;

    function deposit(address borrower, uint id) external payable;

    function withdraw(uint id, uint amount) external;

    function repay(address borrower, uint id, uint amount) external;

    function liquidate(address borrower, uint id, uint amount) external;

    function claim(uint amount) external;
}

interface ICollateralErc20 {
    function open(uint collateral, uint amount, bytes32 currency) external;

    function close(uint id) external;

    function deposit(address borrower, uint id, uint collateral) external;

    function withdraw(uint id, uint amount) external;

    function repay(address borrower, uint id, uint amount) external;

    function liquidate(address borrower, uint id, uint amount) external;
}
