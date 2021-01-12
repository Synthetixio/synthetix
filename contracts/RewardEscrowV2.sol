pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./BaseRewardEscrowV2.sol";

// Internal references
import "./interfaces/IRewardEscrow.sol";
import "./interfaces/ISystemStatus.sol";


// https://docs.synthetix.io/contracts/RewardEscrow
contract RewardEscrowV2 is BaseRewardEscrowV2 {
    mapping(address => uint256) public totalBalancePendingMigration;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYNTHETIX_BRIDGE_OPTIMISM = "SynthetixBridgeToOptimism";
    bytes32 private constant CONTRACT_REWARD_ESCROW = "RewardEscrow";
    bytes32 private constant CONTRACT_SYSTEMSTATUS = "SystemStatus";

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _resolver) public BaseRewardEscrowV2(_owner, _resolver) {}

    /* ========== VIEWS ======================= */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = BaseRewardEscrowV2.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](3);
        newAddresses[0] = CONTRACT_SYNTHETIX_BRIDGE_OPTIMISM;
        newAddresses[1] = CONTRACT_REWARD_ESCROW;
        newAddresses[2] = CONTRACT_SYSTEMSTATUS;
        return combineArrays(existingAddresses, newAddresses);
    }

    function synthetixBridgeToOptimism() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_SYNTHETIX_BRIDGE_OPTIMISM);
    }

    function oldRewardEscrow() internal view returns (IRewardEscrow) {
        return IRewardEscrow(requireAndGetAddress(CONTRACT_REWARD_ESCROW));
    }

    function systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS));
    }

    /* ========== OLD ESCROW LOOKUP ========== */

    uint internal constant TIME_INDEX = 0;
    uint internal constant QUANTITY_INDEX = 1;

    /* ========== MIGRATION OLD ESCROW ========== */

    /**
     * Import function for owner to import vesting schedule
     * Addresses with totalEscrowedAccountBalance == 0 will not be migrated as they have all vested
     */
    function importVestingSchedule(
        address[] calldata accounts,
        uint256[] calldata vestingTimestamps,
        uint256[] calldata escrowAmounts
    ) external onlyDuringSetup onlyOwner {
        require(accounts.length == vestingTimestamps.length, "Account and vestingTimestamps Length mismatch");
        require(accounts.length == escrowAmounts.length, "Account and escrowAmounts Length mismatch");

        for (uint i = 0; i < accounts.length; i++) {
            address addressToMigrate = accounts[i];
            uint256 vestingTimestamp = vestingTimestamps[i];
            uint256 escrowAmount = escrowAmounts[i];

            // ensure account have escrow migration pending
            require(totalEscrowedAccountBalance[addressToMigrate] > 0, "Address escrow balance is 0");
            require(totalBalancePendingMigration[addressToMigrate] > 0, "No escrow migration pending");

            /* Import vesting entry with endTime as vestingTimestamp and escrowAmount */
            _importVestingEntry(
                addressToMigrate,
                VestingEntries.VestingEntry({
                    endTime: uint64(vestingTimestamp),
                    duration: uint64(52 weeks),
                    lastVested: 0,
                    escrowAmount: escrowAmount,
                    remainingAmount: escrowAmount
                })
            );

            /* update totalBalancePendingMigration - reverts if escrowAmount > remaining balance to migrate */
            totalBalancePendingMigration[addressToMigrate] = totalBalancePendingMigration[addressToMigrate].sub(
                escrowAmount
            );

            emit ImportedVestingSchedule(addressToMigrate, vestingTimestamp, escrowAmount);
        }
    }

    /**
     * Migration for owner to migrate escrowed and vested account balances
     * Addresses with totalEscrowedAccountBalance == 0 will not be migrated as they have all vested
     */
    function migrateAccountEscrowBalances(
        address[] calldata accounts,
        uint256[] calldata escrowBalances,
        uint256[] calldata vestedBalances
    ) external onlyDuringSetup onlyOwner {
        require(accounts.length == escrowBalances.length, "Number of accounts and balances don't match");
        require(accounts.length == vestedBalances.length, "Number of accounts and vestedBalances don't match");

        for (uint i = 0; i < accounts.length; i++) {
            address account = accounts[i];
            uint escrowedAmount = escrowBalances[i];
            uint vestedAmount = vestedBalances[i];

            // ensure account doesn't have escrow migration pending / being imported more than once
            require(totalBalancePendingMigration[account] == 0, "Account migration is pending already");

            /* Update totalEscrowedBalance for tracking the Synthetix balance of this contract. */
            totalEscrowedBalance = totalEscrowedBalance.add(escrowedAmount);

            /* Update totalEscrowedAccountBalance and totalVestedAccountBalance for each account */
            totalEscrowedAccountBalance[account] = totalEscrowedAccountBalance[account].add(escrowedAmount);
            totalVestedAccountBalance[account] = totalVestedAccountBalance[account].add(vestedAmount);

            /* update totalBalancePendingMigration for account */
            totalBalancePendingMigration[account] = escrowedAmount;

            emit MigratedAccountEscrow(account, escrowedAmount, vestedAmount, now);
        }
    }

    /* Internal function to add entry to vestingSchedules and emit event */
    function _importVestingEntry(address account, VestingEntries.VestingEntry memory entry) internal {
        uint entryID = nextEntryId;
        vestingSchedules[account][entryID] = entry;

        /* append entryID to list of entries for account */
        accountVestingEntryIDs[account].push(entryID);

        /* Increment the next entry id. */
        nextEntryId = nextEntryId.add(1);

        emit ImportedVestingEntry(
            account,
            entryID,
            entry.escrowAmount,
            entry.remainingAmount,
            entry.endTime,
            entry.duration,
            entry.lastVested
        );
    }

    /* ========== L2 MIGRATION ========== */

    function burnForMigration(address account, uint[] calldata entryIDs)
        external
        onlySynthetixBridge
        returns (uint256 escrowedAccountBalance, VestingEntries.VestingEntry[] memory vestingEntries)
    {
        require(entryIDs.length > 0, "Entry IDs required");

        vestingEntries = new VestingEntries.VestingEntry[](entryIDs.length);

        for (uint i = 0; i < entryIDs.length; i++) {
            VestingEntries.VestingEntry storage entry = vestingSchedules[account][entryIDs[i]];

            if (entry.remainingAmount > 0) {
                vestingEntries[i] = entry;
                escrowedAccountBalance = escrowedAccountBalance.add(entry.remainingAmount);

                /* Delete the vesting entry being migrated */
                delete vestingSchedules[account][entryIDs[i]];
            }
        }

        /**
         *  update account total escrow balances for migration
         *  transfer the escrowed SNX being migrated to the L2 deposit contract
         */
        if (escrowedAccountBalance > 0) {
            _reduceAccountEscrowBalances(account, escrowedAccountBalance);
            IERC20(address(synthetix())).transfer(synthetixBridgeToOptimism(), escrowedAccountBalance);
        }

        emit BurnedForMigrationToL2(account, entryIDs, escrowedAccountBalance, block.timestamp);

        return (escrowedAccountBalance, vestingEntries);
    }

    /* ========== MODIFIERS ========== */

    modifier onlySynthetixBridge() {
        require(msg.sender == synthetixBridgeToOptimism(), "Can only be invoked by SynthetixBridgeToOptimism contract");
        _;
    }

    modifier systemActive() {
        systemStatus().requireSystemActive();
        _;
    }

    /* ========== EVENTS ========== */
    event MigratedAccountEscrow(address indexed account, uint escrowedAmount, uint vestedAmount, uint time);
    event ImportedVestingSchedule(address indexed account, uint time, uint escrowAmount);
    event BurnedForMigrationToL2(address indexed account, uint[] entryIDs, uint escrowedAmountMigrated, uint time);
    event ImportedVestingEntry(
        address indexed account,
        uint entryID,
        uint escrowAmount,
        uint remainingAmount,
        uint endTime,
        uint duration,
        uint lastVested
    );
}
