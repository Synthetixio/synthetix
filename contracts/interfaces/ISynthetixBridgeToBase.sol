pragma solidity >=0.4.24;
pragma experimental ABIEncoderV2;

import "./IRewardEscrowV2.sol";


interface ISynthetixBridgeToBase {
    // invoked by the xDomain messenger on L2
    function finalizeEscrowMigration(
        address account,
        uint256 escrowedAmount,
        VestingEntries.VestingEntry[] calldata vestingEntries
    ) external;

    // invoked by the xDomain messenger on L2
    function completeRewardDeposit(uint amount) external;
}
