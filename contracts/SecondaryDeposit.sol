pragma solidity ^0.5.16;

// Inheritance
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/ISecondaryDeposit.sol";

// Internal references
import "./interfaces/ISynthetix.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IIssuer.sol";


// import {
//     ICrossDomainMessenger
// } from "@eth-optimism/rollup-contracts/build/contracts/bridge/interfaces/ICrossDomainMessenger.sol";

contract SecondaryDeposit is MixinResolver, MixinSystemSettings, ISecondaryDeposit {
    uint public maxDeposit = 2500 * 1e18;

    mapping(address => uint) public pendingWithdrawals;

    // L1 Resolver requires
    // bytes32[] addressesToCache = ["Messenger1", "Synthetix1", "SecondaryDeposit2", "Issuer1"];

    // L2 Resolver requires
    // bytes32[] addressesToCache = ["Messenger2", "Synthetix2", "SecondaryDeposit1"];

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

    function maximumDeposit() external view returns (uint) {
        return getMaximumDeposit();
    }

    // invoked by user on L1
    function deposit(uint amount) external {
        require(amount <= getMaximumDeposit(), "Cannot deposit more than the max");

        // TBD: requirement that user has some escrow on L2
        // require(...)

        // grab the Issuer from the resolver
        IIssuer issuer = IIssuer(resolver.getAddress("Issuer1"));

        require(issuer.debtBalanceOf(msg.sender) == 0, "Cannot deposit with debt");

        // grab Synthetix from the resolver
        ISynthetix synthetix = IERC20(resolver.getAddress("Synthetix"));

        // move the SNX into this contract
        synthetix.transferFrom(msg.sender, address(this), amount);

        // notify issuer to lock L1 issuance
        // issuer.lockEscrow(msg.sender);

        // create message payload for L2
        bytes memory messageData = abi.encodeWithSignature("mintSecondaryFromDeposit(address,uint256)", msg.sender, amount);

        // grab L1 messenger from resolver
        ICrossDomainMessenger messenger = ICrossDomainMessenger(resolver.getAddress("Messenger"));

        // grab L2 secondary deposit from resolver
        address secondaryDeposit2 = resolver.getAddress("SecondaryDeposit:Companion");

        // relay the message to this contract on L2 via Messenger1
        messenger.sendMessage(secondaryDeposit2, messageData, 7e6);
    }

    // invoked by Messenger2 on L2
    function mintSecondaryFromDeposit(address account, uint amount) external {
        // grab L2 messenger from resolver
        ICrossDomainMessenger messenger2 = ICrossDomainMessenger(resolver.getAddress("Messenger"));

        // grab L1 deposit contract
        address secondaryDeposit1 = resolver.getAddress("SecondaryDeposit:Companion");

        // ensure function only callable from SecondaryDeposit1 (via messenger)
        require(messenger2.crossDomainMsgSender() == secondaryDeposit1, "Only deposit contract can invoke");

        // grab Synthetix (L2) from the resolver
        ISynthetix synthetix = IERC20(resolver.getAddress("Synthetix"));

        // now tell Synthetix to mint these tokens, deposited in L1, into the same account for L2
        synthetix2.mintSecondaryFromDeposit(account, amount);
    }

    // invoked by user on L2
    function initiateWithdrawal(uint amount) external {
        ISynthetix synthetix2 = resolver.getAddress("Synthetix");

        // instruct L2 Synthetix to burn this supply
        synthetix2.burnSecondary(msg.sender, amount);

        // create message payload for L1
        bytes memory messageData = abi.encodeWithSignature("withdrawalRequestReceived(address,uint256)", msg.sender, amount);

        // grab L2 messenger from resolver
        ICrossDomainMessenger messenger2 = ICrossDomainMessenger(resolver.getAddress("Messenger"));

        // grab L1 version of this contract from resolver
        address secondaryDeposit1 = resolver.getAddress("SecondaryDeposit:Companion");

        // relay the message to SecondaryDepost on L1 via Messenger2
        messenger2.sendMessage(secondaryDeposit1, messageData);
    }

    // invoked by Messenger1 on L1 after L2 waiting period elapses
    function withdrawalRequestReceived(address account, uint amount) external {
        // grab L1 messenger from resolver
        ICrossDomainMessenger messenger1 = ICrossDomainMessenger(resolver.getAddress("Messenger"));

        // grab L2 deposit contract
        address secondaryDeposit2 = resolver.getAddress("SecondaryDeposit:Companion");

        // ensure function only callable from SecondaryDeposit2 (via messenger)
        require(messenger1.crossDomainMsgSender() == secondaryDeposit2, "Only deposit contract can invoke");

        // now indicate the pending withdrawal amount
        pendingWithdrawals[account] = pendingWithdrawals[account].add(amount);
    }

    // invoked by user on L1
    function withdraw(uint amount) external {
        // require user has sufficient balance
        require(pendingWithdrawals[msg.sender] >= amount, "Insufficient balance to withdraw");

        // deduct from pending withdrawals
        pendingWithdrawals[msg.sender] = pendingWithdrawals[msg.sender].sub(amount);

        // grab Synthetix from the resolver
        ISynthetix synthetix = IERC20(resolver.getAddress("Synthetix"));

        // transfer amount back to user
        synthetix.transfer(msg.sender, amount);

        // grab the Issuer from the resolver
        // IIssuer issuer = IIssuer(resolver.getAddress("Issuer"));

        // finally unlock their L1 escrow
        // issuer.unlockEscrow(msg.sender);
    }
}
