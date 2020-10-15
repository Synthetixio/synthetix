pragma solidity >=0.4.24;


interface ISecondaryDeposit {
    // invoked by users on the primary (L1)
    function deposit(uint amount) external;

    // invoked by the relayer on the primary (L1)
    function completeWithdrawal(address account, uint amount) external;

}
