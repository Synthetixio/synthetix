pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./interfaces/ISynthetixBridgeToOptimism.sol";

// Internal references
import "./interfaces/ISynthetix.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IIssuer.sol";
import "./interfaces/IRewardEscrowV2.sol";

// solhint-disable indent
import "@eth-optimism/contracts/build/contracts/iOVM/bridge/iOVM_BaseCrossDomainMessenger.sol";


contract SynthetixBridgeToOptimism is Owned, MixinResolver, ISynthetixBridgeToOptimism {
    uint32 private constant CROSS_DOMAIN_MESSAGE_GAS_LIMIT = 3e6; //TODO: from constant to an updateable value

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_EXT_MESSENGER = "ext:Messenger";
    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_REWARDSDISTRIBUTION = "RewardsDistribution";
    bytes32 private constant CONTRACT_REWARDESCROW = "RewardEscrowV2";
    bytes32 private constant CONTRACT_OVM_SYNTHETIXBRIDGETOBASE = "ovm:SynthetixBridgeToBase";

    bytes32[24] private addressesToCache = [
        CONTRACT_EXT_MESSENGER,
        CONTRACT_SYNTHETIX,
        CONTRACT_ISSUER,
        CONTRACT_REWARDSDISTRIBUTION,
        CONTRACT_REWARDESCROW,
        CONTRACT_OVM_SYNTHETIXBRIDGETOBASE
    ];

    bool public activated;

    // ========== CONSTRUCTOR ==========

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver, addressesToCache) {
        activated = true;
    }

    //
    // ========== INTERNALS ============

    function messenger() internal view returns (iOVM_BaseCrossDomainMessenger) {
        return iOVM_BaseCrossDomainMessenger(requireAndGetAddress(CONTRACT_EXT_MESSENGER, "Missing Messenger address"));
    }

    function synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX, "Missing Synthetix address"));
    }

    function synthetixERC20() internal view returns (IERC20) {
        return IERC20(requireAndGetAddress(CONTRACT_SYNTHETIX, "Missing Synthetix address"));
    }

    function issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER, "Missing Issuer address"));
    }

    function rewardsDistribution() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_REWARDSDISTRIBUTION, "Missing RewardsDistribution address");
    }

    function rewardEscrowV2() internal view returns (IRewardEscrowV2) {
        return IRewardEscrowV2(requireAndGetAddress(CONTRACT_REWARDESCROW, "Missing RewardEscrow address"));
    }

    function synthetixBridgeToBase() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_OVM_SYNTHETIXBRIDGETOBASE, "Missing Bridge address");
    }

    function isActive() internal view {
        require(activated, "Function deactivated");
    }

    function _rewardDeposit(uint256 amount) internal {
        // create message payload for L2
        bytes memory messageData = abi.encodeWithSignature("mintSecondaryFromDepositForRewards(uint256)", amount);

        // relay the message to this contract on L2 via L1 Messenger
        messenger().sendMessage(synthetixBridgeToBase(), messageData, CROSS_DOMAIN_MESSAGE_GAS_LIMIT);

        emit RewardDeposit(msg.sender, amount);
    }

    // ========== MODIFIERS ============

    modifier requireActive() {
        isActive();
        _;
    }

    // ========== PUBLIC FUNCTIONS =========

    function deposit(uint256 _depositAmount) external requireActive {
        _deposit(_depositAmount, 0);
    }

    function depositAndMigrateEscrow(uint256 _depositAmount, uint256[] calldata _entryIDs) external requireActive {
        // Burn their reward escrow first
        // Note: escrowSummary would lose the fidelity of the weekly escrows, so this may not be sufficient
        uint256 escrowedAccountBalance;
        uint64[] memory vestingTimestamps;
        uint64[] memory durations;
        uint64[] memory lastVested;
        uint256[] memory escrowAmounts;
        uint256[] memory remainingAmounts;

        (
            escrowedAccountBalance,
            vestingTimestamps,
            durations,
            lastVested,
            escrowAmounts,
            remainingAmounts
        ) = rewardEscrowV2().burnForMigration(msg.sender, _entryIDs);

        // if there is an escrow amount to be migrated
        if (escrowedAccountBalance > 0) {
            // create message payload for L2
            bytes memory messageData = abi.encodeWithSignature(
                "importVestingEntries(address,uint256,uint64[],uint64[],uint64[],uint256[],uint256[])",
                msg.sender,
                escrowedAccountBalance,
                vestingTimestamps,
                durations,
                lastVested,
                escrowAmounts,
                remainingAmounts
            );
            // relay the message to this contract on L2 via L1 Messenger
            messenger().sendMessage(synthetixBridgeToBase(), messageData, CROSS_DOMAIN_MESSAGE_GAS_LIMIT);
            emit ExportedVestingEntries(msg.sender, vestingTimestamps, escrowAmounts);
        }

        if (_depositAmount > 0 && escrowedAccountBalance > 0) {
            _deposit(_depositAmount, escrowedAccountBalance);
        }
    }

    // invoked by a generous user on L1
    function rewardDeposit(uint256 amount) external requireActive {
        // move the SNX into this contract
        synthetixERC20().transferFrom(msg.sender, address(this), amount);
        _rewardDeposit(amount);
    }

    // ========= RESTRICTED FUNCTIONS ==============

    // invoked by Messenger on L1 after L2 waiting period elapses
    function completeWithdrawal(address account, uint256 amount) external requireActive {
        // ensure function only callable from L2 Bridge via messenger (aka relayer)
        require(msg.sender == address(messenger()), "Only the relayer can call this");
        require(messenger().xDomainMessageSender() == synthetixBridgeToBase(), "Only the L2 bridge can invoke");

        // transfer amount back to user
        synthetixERC20().transfer(account, amount);

        // no escrow actions - escrow remains on L2
        emit WithdrawalCompleted(account, amount);
    }

    // invoked by the owner for migrating the contract to the new version that will allow for withdrawals
    function migrateBridge(address newBridge) external onlyOwner requireActive {
        require(newBridge != address(0), "Cannot migrate to address 0");
        activated = false;

        IERC20 ERC20Synthetix = synthetixERC20();
        // get the current contract balance and transfer it to the new SynthetixL1ToL2Bridge contract
        uint256 contractBalance = ERC20Synthetix.balanceOf(address(this));
        ERC20Synthetix.transfer(newBridge, contractBalance);

        emit BridgeMigrated(address(this), newBridge, contractBalance);
    }

    // invoked by RewardsDistribution on L1 (takes SNX)
    function notifyRewardAmount(uint256 _amount) external requireActive {
        require(msg.sender == address(rewardsDistribution()), "Caller is not RewardsDistribution contract");

        // to be here means I've been given an amount of SNX to distribute onto L2
        _rewardDeposit(_amount);
    }

    // ========== PRIVATE FUNCTIONS =========

    function _deposit(uint256 _depositAmount, uint256 _escrowAmount) private {
        require(issuer().debtBalanceOf(msg.sender, "sUSD") == 0, "Cannot deposit with debt");
        // Transfer SNX to L2
        // First, move the SNX into this contract
        synthetixERC20().transferFrom(msg.sender, address(this), _depositAmount);
        // create message payload for L2
        bytes memory messageData = abi.encodeWithSignature(
            "mintSecondaryFromDeposit(address,uint256,uint256)",
            msg.sender,
            _depositAmount,
            _escrowAmount
        );
        // relay the message to this contract on L2 via L1 Messenger
        messenger().sendMessage(synthetixBridgeToBase(), messageData, CROSS_DOMAIN_MESSAGE_GAS_LIMIT);
        emit Deposit(msg.sender, _depositAmount, _escrowAmount);
    }

    // ========== EVENTS ==========

    event BridgeMigrated(address oldBridge, address newBridge, uint256 amount);
    event Deposit(address indexed account, uint256 amount, uint256 escrowAmount);
    event ExportedVestingEntries(address indexed account, uint64[] timestamps, uint256[] amounts);
    event RewardDeposit(address indexed account, uint256 amount);
    event WithdrawalCompleted(address indexed account, uint256 amount);
}
