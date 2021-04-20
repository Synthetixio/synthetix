pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/ISynthetixBridgeToBase.sol";

// Internal references
import "./interfaces/ISynthetix.sol";
import "./interfaces/IRewardEscrowV2.sol";

// solhint-disable indent
import "@eth-optimism/contracts/iOVM/bridge/messaging/iAbs_BaseCrossDomainMessenger.sol";
import "@eth-optimism/contracts/iOVM/bridge/tokens/iOVM_L1TokenGateway.sol";
import "@eth-optimism/contracts/iOVM/bridge/tokens/iOVM_L2DepositedToken.sol";

contract SynthetixBridgeToBase is Owned, MixinSystemSettings, ISynthetixBridgeToBase, iOVM_L2DepositedToken {
    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_EXT_MESSENGER = "ext:Messenger";
    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_REWARDESCROW = "RewardEscrowV2";
    bytes32 private constant CONTRACT_BASE_SYNTHETIXBRIDGETOOPTIMISM = "base:SynthetixBridgeToOptimism";

    // ========== CONSTRUCTOR ==========

    constructor(address _owner, address _resolver) public Owned(_owner) MixinSystemSettings(_resolver) {}

    //
    // ========== INTERNALS ============

    function messenger() internal view returns (iAbs_BaseCrossDomainMessenger) {
        return iAbs_BaseCrossDomainMessenger(requireAndGetAddress(CONTRACT_EXT_MESSENGER));
    }

    function synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX));
    }

    function rewardEscrowV2() internal view returns (IRewardEscrowV2) {
        return IRewardEscrowV2(requireAndGetAddress(CONTRACT_REWARDESCROW));
    }

    function synthetixBridgeToOptimism() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_BASE_SYNTHETIXBRIDGETOOPTIMISM);
    }

    function onlyAllowFromOptimism() internal view {
        // ensure function only callable from the L2 bridge via messenger (aka relayer)
        iAbs_BaseCrossDomainMessenger _messenger = messenger();
        require(msg.sender == address(_messenger), "Only the relayer can call this");
        require(_messenger.xDomainMessageSender() == synthetixBridgeToOptimism(), "Only the L1 bridge can invoke");
    }

    modifier onlyOptimismBridge() {
        onlyAllowFromOptimism();
        _;
    }

    // ========== VIEWS ==========

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](4);
        newAddresses[0] = CONTRACT_EXT_MESSENGER;
        newAddresses[1] = CONTRACT_SYNTHETIX;
        newAddresses[2] = CONTRACT_BASE_SYNTHETIXBRIDGETOOPTIMISM;
        newAddresses[3] = CONTRACT_REWARDESCROW;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    function getFinalizeWithdrawalL1Gas() external view returns (uint32) {
        return uint32(getCrossDomainMessageGasLimit(CrossDomainMessageGasLimits.Withdrawal));
    }

    // ========== PUBLIC FUNCTIONS =========

    // invoked by user on L2
    function withdraw(uint amount) external {
        _initiateWithdraw(msg.sender, amount);
    }

    function withdrawTo(address to, uint amount) external {
        _initiateWithdraw(to, amount);
    }

    function _initiateWithdraw(address to, uint amount) private {
        require(synthetix().transferableSynthetix(msg.sender) >= amount, "Not enough transferable SNX");

        // instruct L2 Synthetix to burn this supply
        synthetix().burnSecondary(msg.sender, amount);

        // create message payload for L1
        iOVM_L1TokenGateway bridgeToOptimism;
        bytes memory messageData = abi.encodeWithSelector(bridgeToOptimism.finalizeWithdrawal.selector, to, amount);

        // relay the message to Bridge on L1 via L2 Messenger
        messenger().sendMessage(
            synthetixBridgeToOptimism(),
            messageData,
            uint32(getCrossDomainMessageGasLimit(CrossDomainMessageGasLimits.Withdrawal))
        );

        emit WithdrawalInitiated(msg.sender, to, amount);
    }

    // ========= RESTRICTED FUNCTIONS ==============

    function finalizeEscrowMigration(
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
    function finalizeDeposit(address to, uint256 amount) external onlyOptimismBridge {
        // now tell Synthetix to mint these tokens, deposited in L1, into the specified account for L2
        synthetix().mintSecondary(to, amount);

        emit DepositFinalized(to, amount);
    }

    // invoked by Messenger on L2
    function finalizeRewardDeposit(uint256 amount) external onlyOptimismBridge {
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
    event DepositFinalized(address indexed to, uint256 amount);
    event MintedSecondaryRewards(uint256 amount);
    event WithdrawalInitiated(address indexed from, address to, uint256 amount);
}
