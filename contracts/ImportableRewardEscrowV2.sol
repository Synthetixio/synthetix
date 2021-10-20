pragma solidity ^0.8.9;

// Inheritance
import "./BaseRewardEscrowV2.sol";

// https://docs.synthetix.io/contracts/RewardEscrow
contract ImportableRewardEscrowV2 is BaseRewardEscrowV2 {
    using SafeMath for uint;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_SYNTHETIX_BRIDGE_BASE = "SynthetixBridgeToBase";

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _resolver) BaseRewardEscrowV2(_owner, _resolver) {}

    /* ========== VIEWS ======================= */

    function resolverAddressesRequired() public view virtual override returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = BaseRewardEscrowV2.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](1);
        newAddresses[0] = CONTRACT_SYNTHETIX_BRIDGE_BASE;
        return combineArrays(existingAddresses, newAddresses);
    }

    function synthetixBridgeToBase() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_SYNTHETIX_BRIDGE_BASE);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function importVestingEntries(
        address account,
        uint256 escrowedAmount,
        VestingEntries.VestingEntry[] calldata vestingEntries
    ) external override onlySynthetixBridge {
        // There must be enough balance in the contract to provide for the escrowed balance.
        totalEscrowedBalance = totalEscrowedBalance.add(escrowedAmount);
        require(
            totalEscrowedBalance <= IERC20(address(synthetix())).balanceOf(address(this)),
            "Insufficient balance in the contract to provide for escrowed balance"
        );

        /* Add escrowedAmount to account's escrowed balance */
        totalEscrowedAccountBalance[account] = totalEscrowedAccountBalance[account].add(escrowedAmount);

        for (uint i = 0; i < vestingEntries.length; i++) {
            _importVestingEntry(account, vestingEntries[i]);
        }
    }

    function _importVestingEntry(address account, VestingEntries.VestingEntry memory entry) internal {
        uint entryID = nextEntryId;
        vestingSchedules[account][entryID] = entry;

        /* append entryID to list of entries for account */
        accountVestingEntryIDs[account].push(entryID);

        /* Increment the next entry id. */
        nextEntryId = nextEntryId.add(1);
    }

    modifier onlySynthetixBridge() {
        require(msg.sender == synthetixBridgeToBase(), "Can only be invoked by SynthetixBridgeToBase contract");
        _;
    }
}
