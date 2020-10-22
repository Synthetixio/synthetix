pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./interfaces/ISynthetixL2ToL1Bridge.sol";

// Internal references
import "./interfaces/ISynthetix.sol";

// solhint-disable indent
import "@eth-optimism/rollup-contracts/build/contracts/bridge/interfaces/CrossDomainMessenger.interface.sol";


contract SynthetixL2ToL1Bridge is Owned, MixinResolver, ISynthetixL2ToL1Bridge {
    uint32 private constant CROSS_DOMAIN_MESSAGE_GAS_LIMIT = 3e6; //TODO: verify value

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_EXT_MESSENGER = "ext:Messenger";
    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_ALT_SYNTHETIX_BRIDGE = "alt:SynthetixOptimisticBridge";

    bytes32[24] private addressesToCache = [CONTRACT_EXT_MESSENGER, CONTRACT_SYNTHETIX, CONTRACT_ALT_SYNTHETIX_BRIDGE];

    //
    // ========== CONSTRUCTOR ==========

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver, addressesToCache) {}

    //
    // ========== INTERNALS ============

    function messenger() internal view returns (ICrossDomainMessenger) {
        return ICrossDomainMessenger(requireAndGetAddress(CONTRACT_EXT_MESSENGER, "Missing Messenger address"));
    }

    function synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX, "Missing Synthetix address"));
    }

    function synthetixBridge() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_ALT_SYNTHETIX_BRIDGE, "Missing Bridge address");
    }

    // ========== PUBLIC FUNCTIONS =========

    // invoked by user on L2
    function initiateWithdrawal(uint amount) external {
        // instruct L2 Synthetix to burn this supply
        synthetix().burnSecondary(msg.sender, amount);

        // create message payload for L1
        bytes memory messageData = abi.encodeWithSignature("completeWithdrawal(address,uint256)", msg.sender, amount);

        // relay the message to Bridge on L1 via L2 Messenger
        messenger().sendMessage(synthetixBridge(), messageData, CROSS_DOMAIN_MESSAGE_GAS_LIMIT);

        emit WithdrawalInitiated(msg.sender, amount);
    }

    // ========= RESTRICTED FUNCTIONS ==============

    // invoked by Messenger2 on L2
    function mintSecondaryFromDeposit(address account, uint amount) external {
        // ensure function only callable from SynthetixL1ToL2Bridge via messenger (aka relayer)
        require(msg.sender == address(messenger()), "Only the relayer can call this");
        require(messenger().xDomainMessageSender() == synthetixBridge(), "Only the L2 bridge can invoke");

        // now tell Synthetix to mint these tokens, deposited in L1, into the same account for L2
        synthetix().mintSecondary(account, amount);

        emit MintedSecondary(account, amount);
    }

    // ========== EVENTS ==========
    event MintedSecondary(address indexed account, uint amount);
    event WithdrawalInitiated(address indexed account, uint amount);
}
