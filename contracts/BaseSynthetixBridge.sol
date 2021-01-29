pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/IBaseSynthetixBridge.sol";

// Internal references
import "./interfaces/ISynthetix.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IRewardEscrowV2.sol";

// solhint-disable indent
import "@eth-optimism/contracts/build/contracts/iOVM/bridge/iOVM_BaseCrossDomainMessenger.sol";


contract BaseSynthetixBridge is Owned, MixinSystemSettings, IBaseSynthetixBridge {
    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_EXT_MESSENGER = "ext:Messenger";
    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_REWARDESCROW = "RewardEscrowV2";

    uint8 private constant MAX_ENTRIES_MIGRATED_PER_MESSAGE = 26;

    bool public activated;

    // ========== CONSTRUCTOR ==========

    constructor(address _owner, address _resolver) public Owned(_owner) MixinSystemSettings(_resolver) {
        activated = true;
    }

    //
    // ========== INTERNALS ============

    function messenger() internal view returns (iOVM_BaseCrossDomainMessenger) {
        return iOVM_BaseCrossDomainMessenger(requireAndGetAddress(CONTRACT_EXT_MESSENGER));
    }

    function rewardEscrowV2() internal view returns (IRewardEscrowV2) {
        return IRewardEscrowV2(requireAndGetAddress(CONTRACT_REWARDESCROW));
    }

    function synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX));
    }

    function synthetixERC20() internal view returns (IERC20) {
        return IERC20(requireAndGetAddress(CONTRACT_SYNTHETIX));
    }

    function synthetixBridge() internal view returns (address) {
        return address(0);
    }

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](3);
        newAddresses[0] = CONTRACT_EXT_MESSENGER;
        newAddresses[1] = CONTRACT_SYNTHETIX;
        newAddresses[2] = CONTRACT_REWARDESCROW;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    // ========== MODIFIERS ============

    modifier requireActive() {
        _isActive();
        _;
    }

    function _isActive() internal view {
        require(activated, "Function deactivated");
    }

    // ========== PUBLIC FUNCTIONS =========

    function initiateEscrowMigration(uint256[][] calldata entryIDs) external {}

    // ========= RESTRICTED FUNCTIONS ==============

    function completeEscrowMigration(
        address account,
        uint256 escrowedAmount,
        VestingEntries.VestingEntry[] calldata vestingEntries
    ) external {}

    function deactivate() external onlyOwner requireActive {
        activated = false;
    }

    // ========== PRIVATE/INTERNAL FUNCTIONS =========

    function _initiateEscrowMigration(uint256[][] memory _entryIDs) internal {
        // loop through the entryID array
        for (uint256 i = 0; i < _entryIDs.length; i++) {
            // Cannot send more than MAX_ENTRIES_MIGRATED_PER_MESSAGE entries due to ovm gas restrictions
            require(_entryIDs[i].length <= MAX_ENTRIES_MIGRATED_PER_MESSAGE, "Exceeds max entries per migration");
            // Burn their reward escrow first
            // Note: escrowSummary would lose the fidelity of the weekly escrows, so this may not be sufficient
            uint256 escrowedAccountBalance;
            VestingEntries.VestingEntry[] memory vestingEntries;
            (escrowedAccountBalance, vestingEntries) = rewardEscrowV2().burnForMigration(msg.sender, _entryIDs[i]);
            // if there is an escrow amount to be migrated
            if (escrowedAccountBalance > 0) {
                // create message payload for L2
                IBaseSynthetixBridge baseBridge;
                bytes memory messageData = abi.encodeWithSelector(
                    baseBridge.completeEscrowMigration.selector,
                    msg.sender,
                    escrowedAccountBalance,
                    vestingEntries
                );
                // relay the message to this contract on L2 via L1 Messenger
                messenger().sendMessage(
                    synthetixBridge(),
                    messageData,
                    uint32(getCrossDomainMessageGasLimit(CrossDomainMessageGasLimits.Escrow))
                );
                emit ExportedVestingEntries(msg.sender, escrowedAccountBalance, vestingEntries);
            }
        }
    }

    // ========== EVENTS ==========

    event ExportedVestingEntries(
        address indexed account,
        uint256 escrowedAccountBalance,
        VestingEntries.VestingEntry[] vestingEntries
    );
    event ImportedVestingEntries(
        address indexed account,
        uint256 escrowedAmount,
        VestingEntries.VestingEntry[] vestingEntries
    );
}
