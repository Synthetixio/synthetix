pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/ISynthetixBridgeToOptimism.sol";

// Internal references
import "./interfaces/ISynthetix.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IIssuer.sol";
import "./interfaces/IRewardEscrowV2.sol";
import "./interfaces/ISynthetixBridgeToBase.sol";

// solhint-disable indent
import "@eth-optimism/contracts/iOVM/bridge/messaging/iAbs_BaseCrossDomainMessenger.sol";
import "@eth-optimism/contracts/iOVM/bridge/tokens/iOVM_L1TokenGateway.sol";
import "@eth-optimism/contracts/iOVM/bridge/tokens/iOVM_L2DepositedToken.sol";

contract SynthetixBridgeToOptimism is Owned, MixinSystemSettings, ISynthetixBridgeToOptimism, iOVM_L1TokenGateway {
    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_EXT_MESSENGER = "ext:Messenger";
    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_REWARDSDISTRIBUTION = "RewardsDistribution";
    bytes32 private constant CONTRACT_REWARDESCROW = "RewardEscrowV2";
    bytes32 private constant CONTRACT_OVM_SYNTHETIXBRIDGETOBASE = "ovm:SynthetixBridgeToBase";
    bytes32 private constant CONTRACT_SYNTHETIXBRIDGEESCROW = "SynthetixBridgeEscrow";

    uint8 private constant MAX_ENTRIES_MIGRATED_PER_MESSAGE = 26;

    bool public initiationActive;

    // ========== CONSTRUCTOR ==========

    constructor(address _owner, address _resolver) public Owned(_owner) MixinSystemSettings(_resolver) {
        initiationActive = true;
    }

    // ========== INTERNALS ============

    function messenger() internal view returns (iAbs_BaseCrossDomainMessenger) {
        return iAbs_BaseCrossDomainMessenger(requireAndGetAddress(CONTRACT_EXT_MESSENGER));
    }

    function synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX));
    }

    function synthetixERC20() internal view returns (IERC20) {
        return IERC20(requireAndGetAddress(CONTRACT_SYNTHETIX));
    }

    function issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER));
    }

    function rewardsDistribution() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_REWARDSDISTRIBUTION);
    }

    function rewardEscrowV2() internal view returns (IRewardEscrowV2) {
        return IRewardEscrowV2(requireAndGetAddress(CONTRACT_REWARDESCROW));
    }

    function synthetixBridgeToBase() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_OVM_SYNTHETIXBRIDGETOBASE);
    }

    function synthetixBridgeEscrow() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_SYNTHETIXBRIDGEESCROW);
    }

    function initiatingActive() internal view {
        require(initiationActive, "Initiation deactivated");
    }

    function hasZeroDebt() internal view {
        require(issuer().debtBalanceOf(msg.sender, "sUSD") == 0, "Cannot deposit or migrate with debt");
    }

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](7);
        newAddresses[0] = CONTRACT_EXT_MESSENGER;
        newAddresses[1] = CONTRACT_SYNTHETIX;
        newAddresses[2] = CONTRACT_ISSUER;
        newAddresses[3] = CONTRACT_REWARDSDISTRIBUTION;
        newAddresses[4] = CONTRACT_OVM_SYNTHETIXBRIDGETOBASE;
        newAddresses[5] = CONTRACT_REWARDESCROW;
        newAddresses[6] = CONTRACT_SYNTHETIXBRIDGEESCROW;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    function getFinalizeDepositL2Gas() external view returns (uint32) {
        return uint32(getCrossDomainMessageGasLimit(CrossDomainMessageGasLimits.Deposit));
    }

    // ========== MODIFIERS ============

    modifier requireInitiationActive() {
        initiatingActive();
        _;
    }

    modifier requireZeroDebt() {
        hasZeroDebt();
        _;
    }

    // ========== PUBLIC FUNCTIONS =========

    function deposit(uint256 amount) external requireInitiationActive requireZeroDebt {
        _initiateDeposit(msg.sender, amount);
    }

    function depositTo(address to, uint amount) external requireInitiationActive requireZeroDebt {
        _initiateDeposit(to, amount);
    }

    function migrateEscrow(uint256[][] memory entryIDs) public requireInitiationActive requireZeroDebt {
        _migrateEscrow(entryIDs);
    }

    // invoked by a generous user on L1
    function depositReward(uint amount) external requireInitiationActive {
        // move the SNX into the deposit escrow
        synthetixERC20().transferFrom(msg.sender, synthetixBridgeEscrow(), amount);

        _depositReward(amount);
    }

    // ========= RESTRICTED FUNCTIONS ==============

    // invoked by Messenger on L1 after L2 waiting period elapses
    function finalizeWithdrawal(address to, uint256 amount) external {
        // ensure function only callable from L2 Bridge via messenger (aka relayer)
        require(msg.sender == address(messenger()), "Only the relayer can call this");
        require(messenger().xDomainMessageSender() == synthetixBridgeToBase(), "Only the L2 bridge can invoke");

        // transfer amount back to user
        synthetixERC20().transferFrom(synthetixBridgeEscrow(), to, amount);

        // no escrow actions - escrow remains on L2
        emit WithdrawalFinalized(to, amount);
    }

    // invoked by RewardsDistribution on L1 (takes SNX)
    function notifyRewardAmount(uint256 amount) external requireInitiationActive {
        require(msg.sender == address(rewardsDistribution()), "Caller is not RewardsDistribution contract");

        // to be here means I've been given an amount of SNX to distribute onto L2
        _depositReward(amount);
    }

    function suspendInitiation() external onlyOwner {
        initiationActive = false;
        emit InitiationSuspended();
    }

    function resumeInitiation() external onlyOwner {
        initiationActive = true;
        emit InitiationResumed();
    }

    function depositAndMigrateEscrow(uint256 depositAmount, uint256[][] memory entryIDs)
        public
        requireInitiationActive
        requireZeroDebt
    {
        if (entryIDs.length > 0) {
            _migrateEscrow(entryIDs);
        }

        if (depositAmount > 0) {
            _initiateDeposit(msg.sender, depositAmount);
        }
    }

    // ========== PRIVATE/INTERNAL FUNCTIONS =========

    function _depositReward(uint256 _amount) internal {
        // create message payload for L2
        ISynthetixBridgeToBase bridgeToBase;
        bytes memory messageData = abi.encodeWithSelector(bridgeToBase.finalizeRewardDeposit.selector, _amount);

        // relay the message to this contract on L2 via L1 Messenger
        messenger().sendMessage(
            synthetixBridgeToBase(),
            messageData,
            uint32(getCrossDomainMessageGasLimit(CrossDomainMessageGasLimits.Reward))
        );

        emit RewardDeposit(msg.sender, _amount);
    }

    function _initiateDeposit(address _to, uint256 _depositAmount) private {
        // Transfer SNX to L2
        // First, move the SNX into the deposit escrow
        synthetixERC20().transferFrom(msg.sender, synthetixBridgeEscrow(), _depositAmount);
        // create message payload for L2
        iOVM_L2DepositedToken bridgeToBase;
        bytes memory messageData = abi.encodeWithSelector(bridgeToBase.finalizeDeposit.selector, _to, _depositAmount);

        // relay the message to this contract on L2 via L1 Messenger
        messenger().sendMessage(
            synthetixBridgeToBase(),
            messageData,
            uint32(getCrossDomainMessageGasLimit(CrossDomainMessageGasLimits.Deposit))
        );

        emit DepositInitiated(msg.sender, _to, _depositAmount);
    }

    function _migrateEscrow(uint256[][] memory _entryIDs) private {
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
                // NOTE: transfer SNX to synthetixBridgeEscrow because burnForMigration() transfers them to this contract.
                synthetixERC20().transfer(synthetixBridgeEscrow(), escrowedAccountBalance);
                // create message payload for L2
                ISynthetixBridgeToBase bridgeToBase;
                bytes memory messageData =
                    abi.encodeWithSelector(
                        bridgeToBase.finalizeEscrowMigration.selector,
                        msg.sender,
                        escrowedAccountBalance,
                        vestingEntries
                    );
                // relay the message to this contract on L2 via L1 Messenger
                messenger().sendMessage(
                    synthetixBridgeToBase(),
                    messageData,
                    uint32(getCrossDomainMessageGasLimit(CrossDomainMessageGasLimits.Escrow))
                );

                emit ExportedVestingEntries(msg.sender, escrowedAccountBalance, vestingEntries);
            }
        }
    }

    // ========== EVENTS ==========

    event InitiationSuspended();
    event InitiationResumed();
    event DepositInitiated(address indexed from, address to, uint256 amount);
    event ExportedVestingEntries(
        address indexed account,
        uint256 escrowedAccountBalance,
        VestingEntries.VestingEntry[] vestingEntries
    );
    event RewardDeposit(address indexed account, uint256 amount);
    event WithdrawalFinalized(address indexed to, uint256 amount);
}
