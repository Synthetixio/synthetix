pragma solidity >=0.4.24;
pragma experimental ABIEncoderV2;

import "./IRewardEscrowV2.sol";


interface ISynthetixBridgeToBase {
    // invoked by the xDomain messenger on L2
    function completeDeposit(address account, uint depositAmount) external;

    // invoked by the xDomain messenger on L2
    function completeRewardDeposit(uint amount) external;

    // invoked by the xDomain messenger on L2
    function completeEscrowMigration(
        address account,
        uint256 escrowedAmount,
        VestingEntries.VestingEntry[] calldata vestingEntries
    ) external;

    // invoked by users on L2
    function initiateWithdrawal(uint amount) external;
}
