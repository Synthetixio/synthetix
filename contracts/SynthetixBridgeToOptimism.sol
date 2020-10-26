pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./interfaces/ISynthetixBridgeToOptimism.sol";

// Internal references
import "./interfaces/ISynthetix.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IIssuer.sol";
// import "./interfaces/IRewardEscrow.sol";

// solhint-disable indent
import "@eth-optimism/rollup-contracts/build/contracts/bridge/interfaces/CrossDomainMessenger.interface.sol";


contract SynthetixBridgeToOptimism is Owned, MixinResolver, ISynthetixBridgeToOptimism {
    uint32 private constant CROSS_DOMAIN_MESSAGE_GAS_LIMIT = 3e6; //TODO: verify value, uint32 to uint in new version

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_EXT_MESSENGER = "ext:Messenger";
    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    // bytes32 private constant CONTRACT_REWARDESCROW = "RewardEscrow";
    bytes32 private constant CONTRACT_SYNTHETIX_BRIDGE_TO_BASE = "ovm:SynthetixBridgeToBase";

    bytes32[24] private addressesToCache = [
        CONTRACT_EXT_MESSENGER,
        CONTRACT_SYNTHETIX,
        CONTRACT_ISSUER,
        // CONTRACT_REWARDESCROW,
        CONTRACT_SYNTHETIX_BRIDGE_TO_BASE
    ];

    bool public activated;

    // ========== CONSTRUCTOR ==========

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver, addressesToCache) {
        activated = true;
    }

    //
    // ========== INTERNALS ============

    function messenger() internal view returns (ICrossDomainMessenger) {
        return ICrossDomainMessenger(requireAndGetAddress(CONTRACT_EXT_MESSENGER, "Missing Messenger address"));
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

    // Commented out until it is required by external functions.
    // function rewardEscrow() internal view returns (IRewardEscrow) {
    //     return IRewardEscrow(requireAndGetAddress(CONTRACT_REWARDESCROW, "Missing RewardEscrow address"));
    // }

    function synthetixBridgeToBase() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_SYNTHETIX_BRIDGE_TO_BASE, "Missing Bridge address");
    }

    // ========== PUBLIC FUNCTIONS =========

    // invoked by user on L1
    function deposit(uint amount) external {
        require(activated, "Function deactivated");

        require(issuer().debtBalanceOf(msg.sender, "sUSD") == 0, "Cannot deposit with debt");

        // now remove their reward escrow
        // Note: escrowSummary would lose the fidelity of the weekly escrows, so this may not be sufficient
        // uint escrowSummary = rewardEscrow().burnForMigration(msg.sender);

        // move the SNX into this contract
        synthetixERC20().transferFrom(msg.sender, address(this), amount);

        // create message payload for L2
        bytes memory messageData = abi.encodeWithSignature("mintSecondaryFromDeposit(address,uint256)", msg.sender, amount);

        // relay the message to this contract on L2 via L1 Messenger
        messenger().sendMessage(synthetixBridgeToBase(), messageData, CROSS_DOMAIN_MESSAGE_GAS_LIMIT);

        emit Deposit(msg.sender, amount);
    }

    // ========= RESTRICTED FUNCTIONS ==============

    // invoked by Messenger on L1 after L2 waiting period elapses
    function completeWithdrawal(address account, uint amount) external {
        // ensure function only callable from L2 Bridge via messenger (aka relayer)
        require(msg.sender == address(messenger()), "Only the relayer can call this");
        require(messenger().xDomainMessageSender() == synthetixBridgeToBase(), "Only the L2 bridge can invoke");

        // transfer amount back to user
        synthetixERC20().transfer(account, amount);

        // no escrow actions - escrow remains on L2
        emit WithdrawalCompleted(account, amount);
    }

    // invoked by the owner for migrating the contract to the new version that will allow for withdrawals
    function migrateBridge(address newBridge) external onlyOwner {
        activated = false;

        IERC20 ERC20Synthetix = synthetixERC20();
        // get the current contract balance and transfer it to the new SynthetixL1ToL2Bridge contract
        uint contractBalance = ERC20Synthetix.balanceOf(address(this));
        ERC20Synthetix.transfer(newBridge, contractBalance);

        emit BridgeMigrated(address(this), newBridge, contractBalance);
    }

    // ========== EVENTS ==========

    event Deposit(address indexed account, uint amount);
    event BridgeMigrated(address oldBridge, address newBridge, uint amount);
    event WithdrawalCompleted(address indexed account, uint amount);
}
