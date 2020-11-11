pragma solidity ^0.5.16;

import "./RewardEscrow.sol";


contract RewardEscrowV2 is RewardEscrow {
    constructor(
        address _owner,
        ISynthetix _synthetix,
        IFeePool _feePool
    ) public RewardEscrow(_owner, _synthetix, _feePool) {}

    function burnForMigration(address account)
        external
        returns (
            uint256,
            uint64[52] memory,
            uint256[52] memory
        )
    {}

    function migrateAccountEscrowBalances(
        address[] calldata accounts,
        uint256[] calldata escrowBalances,
        uint256[] calldata vestedBalances
    ) external {}

    function importVestingEntries(
        address account,
        uint64[52] calldata timestamps,
        uint256[52] calldata amounts
    ) external {}
}
