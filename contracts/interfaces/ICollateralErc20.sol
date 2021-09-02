pragma solidity >=0.4.24;

interface ICollateralErc20 {
    function open(
        uint collateral,
        uint amount,
        bytes32 currency
    ) external returns (uint id);

    function close(uint id) external returns (uint amount, uint collateral);

    function deposit(
        address borrower,
        uint id,
        uint amount
    ) external returns (uint principal, uint collateral);

    function withdraw(uint id, uint amount) external returns (uint principal, uint collateral);

    function repay(
        address borrower,
        uint id,
        uint amount
    )
        external
        returns (
            uint principal,
            uint collateral,
            bool isPaidOff
        );

    function draw(uint id, uint amount) external returns (uint principal, uint collateral);

    function liquidate(
        address borrower,
        uint id,
        uint amount
    ) external;
}
