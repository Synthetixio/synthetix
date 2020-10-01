pragma solidity ^0.5.16;

// Inheritance
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/ISecondaryDeposit.sol";

// Internal references
import "./interfaces/ISynthetix.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IIssuer.sol";

import {
    ICrossDomainMessenger
} from "@eth-optimism/rollup-contracts/build/contracts/bridge/interfaces/CrossDomainMessenger.interface.sol";


contract SecondaryDeposit is MixinResolver, MixinSystemSettings, ISecondaryDeposit {
    mapping(address => uint) public pendingWithdrawals;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_MESSENGER = "Messenger";
    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_SECONDARY_DEPOSIT_COMPANION = "SecondaryDeposit:Companion";

    bytes32[24] private addressesToCache = [
        CONTRACT_MESSENGER,
        CONTRACT_SYNTHETIX,
        CONTRACT_ISSUER,
        CONTRACT_SECONDARY_DEPOSIT_COMPANION
    ];

    //
    // ========== CONSTRUCTOR ==========

    // Note: no more owner!
    constructor(address _resolver) public MixinResolver(_resolver, addressesToCache) MixinSystemSettings() {}

    //
    // ========== INTERNALS ============

    function messenger() internal view returns (ICrossDomainMessenger) {
        return ICrossDomainMessenger(requireAndGetAddress(CONTRACT_MESSENGER, "Missing Messenger address"));
    }

    function synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX, "Missing Synthetix address"));
    }

    function issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER, "Missing Issuer address"));
    }

    function companion() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_SECONDARY_DEPOSIT_COMPANION, "Missing Companion address");
    }

    /// ========= VIEWS =================

    function maximumDeposit() external view returns (uint) {
        return getMaximumDeposit();
    }

    // ========== PUBLIC FUNCTIONS =========

    // invoked by user on L1
    function deposit(uint amount) external {
        require(amount <= getMaximumDeposit(), "Cannot deposit more than the max");

        // TBD: requirement that user has some escrow on L2
        // require(...)

        // grab the Issuer from the resolver
        IIssuer _issuer = issuer();

        require(_issuer.debtBalanceOf(msg.sender, "sUSD") == 0, "Cannot deposit with debt");

        // move the SNX into this contract
        IERC20(address(synthetix())).transferFrom(msg.sender, address(this), amount);

        // notify issuer to lock L1 issuance
        // _issuer.lockEscrow(msg.sender);

        // create message payload for L2
        bytes memory messageData = abi.encodeWithSignature("mintSecondaryFromDeposit(address,uint256)", msg.sender, amount);

        // relay the message to this contract on L2 via Messenger1
        messenger().sendMessage(companion(), messageData, 3e6);
    }

    // invoked by user on L2
    function initiateWithdrawal(uint amount) external {
        // instruct L2 Synthetix to burn this supply
        synthetix().burnSecondary(msg.sender, amount);

        // create message payload for L1
        bytes memory messageData = abi.encodeWithSignature("completeWithdrawal(address,uint256)", msg.sender, amount);

        // relay the message to SecondaryDepost on L1 via Messenger2
        messenger().sendMessage(companion(), messageData, 3e6);
    }

    // ========= RESTRICTED FUNCTIONS ==============

    // invoked by Messenger2 on L2
    function mintSecondaryFromDeposit(address account, uint amount) external {
        // ensure function only callable from SecondaryDeposit1 (via messenger)
        require(messenger().xDomainMessageSender() == companion(), "Only deposit contract can invoke");

        // now tell Synthetix to mint these tokens, deposited in L1, into the same account for L2
        synthetix().mintSecondary(account, amount);
    }

    // invoked by Messenger1 on L1 after L2 waiting period elapses
    function completeWithdrawal(address account, uint amount) external {
        // ensure function only callable from SecondaryDeposit2 (via messenger)
        require(messenger().xDomainMessageSender() == companion(), "Only deposit contract can invoke");

        // transfer amount back to user
        IERC20(address(synthetix())).transfer(account, amount);

        // finally unlock their L1 escrow
        // issuer().unlockEscrow(account);
    }
}
