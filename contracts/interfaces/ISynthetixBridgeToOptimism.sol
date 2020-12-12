pragma solidity >=0.4.24;


interface ISynthetixBridgeToOptimism {
    // invoked by the relayer on L1
    function completeWithdrawal(address account, uint depositAmount) external;

    // invoked by users on L1
    function initiateDeposit(uint amount) external;

    // invoked users on L1
    function depositAndMigrateEscrow(uint256 depositAmount, uint256[] calldata entryIDs) external;
}
