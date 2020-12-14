pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./BaseRewardEscrowV2.sol";

// Internal references
import "./interfaces/IRewardEscrow.sol";
import "./interfaces/ISystemStatus.sol";


// https://docs.synthetix.io/contracts/RewardEscrow
contract RewardEscrowV2 is BaseRewardEscrowV2 {
    mapping(address => bool) public escrowMigrationPending;

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

    /* ========== MIGRATION OLD ESCROW ========== */

    /* Function to allow any address to migrate vesting entries from previous reward escrow */
    function migrateVestingSchedule(address addressToMigrate) external systemActive {
        require(escrowMigrationPending[addressToMigrate], "No escrow migration pending");

        uint numEntries = oldRewardEscrow().numVestingEntries(addressToMigrate);

        /* Ensure account escrow balance is not zero */
        require(totalEscrowedAccountBalance[addressToMigrate] > 0, "Address escrow balance is 0");

        /* remove address for migration from old escrow */
        delete escrowMigrationPending[addressToMigrate];

        /* Calculate entries that can be vested and total vested amount to deduct from
         * totalEscrowedAccountBalance */
        (uint vestedEntries, uint totalVested) = _getVestedEntriesAndAmount(addressToMigrate, numEntries);

        /* transfer vested tokens to account */
        if (totalVested != 0) {
            _transferVestedTokens(addressToMigrate, totalVested);
        }

        /* iterate and migrate old escrow schedules from vestingSchedules[vestedEntries - 1]
         * stop at the end of the vesting schedule list */
        for (uint i = vestedEntries - 1; i < numEntries; i++) {
            uint[2] memory vestingSchedule = oldRewardEscrow().getVestingScheduleEntry(addressToMigrate, i);

            _importVestingEntry(
                addressToMigrate,
                VestingEntries.VestingEntry({
                    endTime: uint64(vestingSchedule[TIME_INDEX]),
                    duration: uint64(52 weeks),
                    lastVested: 0,
                    escrowAmount: vestingSchedule[QUANTITY_INDEX],
                    remainingAmount: vestingSchedule[QUANTITY_INDEX]
                })
            );
        }

        emit MigratedVestingSchedules(addressToMigrate, block.timestamp);
    }

    /**
     * Determine which entries can be vested, based on the old escrow vest function
     * return number of entries vested and amount
     */
    function _getVestedEntriesAndAmount(address _account, uint _numEntries)
        internal
        view
        returns (uint vestedEntries, uint totalVestedAmount)
    {
        for (uint i = 0; i < _numEntries; i++) {
            /* get existing vesting entry [time, quantity] */
            uint[2] memory vestingSchedule = oldRewardEscrow().getVestingScheduleEntry(_account, i);
            /* The list is sorted on the old RewardEscrow; when we reach the first future time, bail out. */
            uint time = vestingSchedule[0];
            if (time > now) {
                break;
            }
            uint qty = vestingSchedule[1];
            if (qty > 0) {
                vestedEntries++;
                totalVestedAmount = totalVestedAmount.add(qty);
            }
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
    ) external onlyOwner {
        require(accounts.length == escrowBalances.length, "Number of accounts and balances don't match");
        require(accounts.length == vestedBalances.length, "Number of accounts and vestedBalances don't match");

        for (uint i = 0; i < accounts.length; i++) {
            address account = accounts[i];
            uint escrowedAmount = escrowBalances[i];
            uint vestedAmount = vestedBalances[i];

            // ensure account doesn't have escrow migratio pending / being imported more than once
            require(!escrowMigrationPending[account], "Account migration is pending already");

            /* Update totalEscrowedBalance for tracking the Synthetix balance of this contract. */
            totalEscrowedBalance = totalEscrowedBalance.add(escrowedAmount);

            /* Update totalEscrowedAccountBalance and totalVestedAccountBalance for each account */
            totalEscrowedAccountBalance[account] = totalEscrowedAccountBalance[account].add(escrowedAmount);
            totalVestedAccountBalance[account] = totalVestedAccountBalance[account].add(vestedAmount);

            /* flag address for migration from old escrow */
            escrowMigrationPending[account] = true;

            emit MigratedAccountEscrow(account, escrowedAmount, vestedAmount, now);
        }
    }

    /* ========== L2 MIGRATION ========== */

    function burnForMigration(address account, uint[] calldata entryIDs)
        external
        onlySynthetixBridge
        returns (uint256 escrowedAccountBalance, VestingEntries.VestingEntry[] memory vestingEntries)
    {
        require(entryIDs.length > 0, "Entry IDs required");

        /* check if account migrated on L1 */
        _checkEscrowMigrationPending(account);

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

    function _checkEscrowMigrationPending(address account) internal view {
        require(!escrowMigrationPending[account], "Escrow migration pending");
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
    event MigratedVestingSchedules(address indexed account, uint time);
    event BurnedForMigrationToL2(address indexed account, uint[] entryIDs, uint escrowedAmountMigrated, uint time);
}
