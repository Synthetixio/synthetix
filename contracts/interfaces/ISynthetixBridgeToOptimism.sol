pragma solidity >=0.4.24;


interface ISynthetixBridgeToOptimism {
    // invoked by users on L1
    function initiateDeposit(uint amount) external;

    // invoked by the relayer on L1
    function completeWithdrawal(address account, uint amount) external;
}
