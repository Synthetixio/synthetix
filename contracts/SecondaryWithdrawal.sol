pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/ISecondaryWithdrawal.sol";

// Internal references
import "./interfaces/ISynthetix.sol";
import "./interfaces/IERC20.sol";

// solhint-disable indent
import "@eth-optimism/rollup-contracts/build/contracts/bridge/interfaces/CrossDomainMessenger.interface.sol";


contract SecondaryWithdrawal is Owned, MixinResolver, MixinSystemSettings, ISecondaryWithdrawal {

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_EXT_MESSENGER = "ext:Messenger";
    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_ALT_SECONDARYDEPOSIT = "alt:SecondaryDeposit";

    bytes32[24] private addressesToCache = [
        CONTRACT_EXT_MESSENGER,
        CONTRACT_SYNTHETIX,
        CONTRACT_ALT_SECONDARYDEPOSIT
    ];

    //
    // ========== CONSTRUCTOR ==========

    constructor(address _owner, address _resolver)
        public
        Owned(_owner)
        MixinResolver(_resolver, addressesToCache)
    {}

    //
    // ========== INTERNALS ============

    function messenger() internal view returns (ICrossDomainMessenger) {
        return ICrossDomainMessenger(requireAndGetAddress(CONTRACT_EXT_MESSENGER, "Missing Messenger address"));
    }

    function synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX, "Missing Synthetix address"));
    }

    function companion() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_ALT_SECONDARYDEPOSIT, "Missing Companion address");
    }

    // ========== PUBLIC FUNCTIONS =========

    // invoked by user on L2
    function initiateWithdrawal(uint amount) external {
        // instruct L2 Synthetix to burn this supply
        synthetix().burnSecondary(msg.sender, amount);

        // // create message payload for L1
        bytes memory messageData = abi.encodeWithSignature("completeWithdrawal(address,uint256)", msg.sender, amount);

        // // relay the message to SecondaryDepost on L1 via Messenger2
        messenger().sendMessage(companion(), messageData, 3e6);

        emit WithdrawalInitiated(msg.sender, amount);
    }

    // ========= RESTRICTED FUNCTIONS ==============

     // invoked by Messenger2 on L2
    function mintSecondaryFromDeposit(address account, uint amount) external {
        // ensure function only callable from SecondaryDeposit1 via messenger (aka relayer)
        require(msg.sender == address(messenger()), "Only the relayer can call this");
        require(messenger().xDomainMessageSender() == companion(), "Only deposit contract can invoke");

        // now tell Synthetix to mint these tokens, deposited in L1, into the same account for L2
        synthetix().mintSecondary(account, amount);

        emit MintedSecondary(account, amount);
    }


    // ========== EVENTS ==========
    event MintedSecondary(address indexed account, uint amount);
    event WithdrawalInitiated(address indexed account, uint amount);
}
