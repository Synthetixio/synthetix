pragma solidity >=0.4.24;


interface ISecondaryWithdrawal {
    // invoked by users on the secondary (L2)
    function initiateWithdrawal(uint amount) external;

    // invoked by the relayer on the primary (L1)
    function completeWithdrawal(address account, uint amount) external;
}
