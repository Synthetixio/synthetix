pragma solidity >=0.4.24;
pragma experimental ABIEncoderV2;

import "./IRewardEscrowV2.sol";


interface IBaseSynthetixBridge {
    function initiateEscrowMigration(uint256[][] calldata entryIDs) external;

    function completeEscrowMigration(
        address account,
        uint256 escrowedAmount,
        VestingEntries.VestingEntry[] calldata vestingEntries
    ) external;
}
