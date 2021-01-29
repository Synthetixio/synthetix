pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/ISynthetixBridgeToBase.sol";
import "./BaseSynthetixBridge.sol";

// Internal references
import "./interfaces/ISynthetix.sol";
import "./interfaces/ISynthetixBridgeToOptimism.sol";

// solhint-disable indent
import "@eth-optimism/contracts/build/contracts/iOVM/bridge/iOVM_BaseCrossDomainMessenger.sol";


contract SynthetixBridgeToBase is BaseSynthetixBridge, ISynthetixBridgeToBase {
    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_BASE_SYNTHETIXBRIDGETOOPTIMISM = "base:SynthetixBridgeToOptimism";

    // ========== CONSTRUCTOR ==========

    constructor(address _owner, address _resolver) public BaseSynthetixBridge(_owner, _resolver) {}

    // ========== INTERNALS ============

    function synthetixBridge() internal view returns (address) {
        return synthetixBridgeToOptimism();
    }

    function synthetixBridgeToOptimism() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_BASE_SYNTHETIXBRIDGETOOPTIMISM);
    }

    function onlyAllowFromOptimism() internal view {
        // ensure function only callable from the L2 bridge via messenger (aka relayer)
        iOVM_BaseCrossDomainMessenger _messenger = messenger();
        require(msg.sender == address(_messenger), "Only the relayer can call this");
        require(_messenger.xDomainMessageSender() == synthetixBridgeToOptimism(), "Only the L1 bridge can invoke");
    }

    modifier onlyOptimismBridge() {
        onlyAllowFromOptimism();
        _;
    }

    // ========== VIEWS ==========

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = BaseSynthetixBridge.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](1);
        newAddresses[0] = CONTRACT_BASE_SYNTHETIXBRIDGETOOPTIMISM;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    // ========== PUBLIC FUNCTIONS =========

    function initiateEscrowMigration(uint256[][] memory entryIDs) public requireActive {
        // TODO: implement a more flexible mechanism for checking the outstandin debt
        _initiateEscrowMigration(entryIDs);
    }

    // invoked by user on L2
    function initiateWithdrawal(uint amount) external {
        require(synthetix().transferableSynthetix(msg.sender) >= amount, "Not enough transferable SNX");

        // instruct L2 Synthetix to burn this supply
        synthetix().burnSecondary(msg.sender, amount);

        // create message payload for L1
        ISynthetixBridgeToOptimism bridgeToOptimism;
        bytes memory messageData = abi.encodeWithSelector(bridgeToOptimism.completeWithdrawal.selector, msg.sender, amount);

        // relay the message to Bridge on L1 via L2 Messenger
        messenger().sendMessage(
            synthetixBridgeToOptimism(),
            messageData,
            uint32(getCrossDomainMessageGasLimit(CrossDomainMessageGasLimits.Withdrawal))
        );

        emit WithdrawalInitiated(msg.sender, amount);
    }

    // ========= RESTRICTED FUNCTIONS ==============

    function completeEscrowMigration(
        address account,
        uint256 escrowedAmount,
        VestingEntries.VestingEntry[] calldata vestingEntries
    ) external onlyOptimismBridge {
        IRewardEscrowV2 rewardEscrow = rewardEscrowV2();
        // First, mint the escrowed SNX that are being migrated
        synthetix().mintSecondary(address(rewardEscrow), escrowedAmount);
        rewardEscrow.importVestingEntries(account, escrowedAmount, vestingEntries);
        emit ImportedVestingEntries(account, escrowedAmount, vestingEntries);
    }

    // invoked by Messenger on L2
    function completeDeposit(address account, uint256 depositAmount) external onlyOptimismBridge {
        // now tell Synthetix to mint these tokens, deposited in L1, into the same account for L2
        synthetix().mintSecondary(account, depositAmount);
        emit MintedSecondary(account, depositAmount);
    }

    // invoked by Messenger on L2
    function completeRewardDeposit(uint256 amount) external onlyOptimismBridge {
        // now tell Synthetix to mint these tokens, deposited in L1, into reward escrow on L2
        synthetix().mintSecondaryRewards(amount);
        emit MintedSecondaryRewards(amount);
    }

    // ========== EVENTS ==========
    event ImportedVestingEntries(
        address indexed account,
        uint256 escrowedAmount,
        VestingEntries.VestingEntry[] vestingEntries
    );
    event MintedSecondary(address indexed account, uint256 amount);
    event MintedSecondaryRewards(uint256 amount);
    event WithdrawalInitiated(address indexed account, uint256 amount);
}
