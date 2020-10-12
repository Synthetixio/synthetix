pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/ISecondaryDeposit.sol";

// Internal references
import "./interfaces/ISynthetix.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IIssuer.sol";
import "./interfaces/IRewardEscrow.sol";

// solhint-disable indent
import "@eth-optimism/rollup-contracts/build/contracts/bridge/interfaces/CrossDomainMessenger.interface.sol";


contract SecondaryDeposit is Owned, MixinResolver, MixinSystemSettings, ISecondaryDeposit {
    bool public activated;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_EXT_MESSENGER = "ext:Messenger";
    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_REWARDESCROW = "RewardEscrow";
    bytes32 private constant CONTRACT_ALT_SECONDARYDEPOSIT = "alt:SecondaryDeposit";

    bytes32[24] private addressesToCache = [
        CONTRACT_EXT_MESSENGER,
        CONTRACT_SYNTHETIX,
        CONTRACT_ISSUER,
        CONTRACT_REWARDESCROW,
        CONTRACT_ALT_SECONDARYDEPOSIT
    ];

    //
    // ========== CONSTRUCTOR ==========

    constructor(address _owner, address _resolver)
        public
        Owned(_owner)
        MixinResolver(_resolver, addressesToCache)
        MixinSystemSettings()
    {
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

    function rewardEscrow() internal view returns (IRewardEscrow) {
        return IRewardEscrow(requireAndGetAddress(CONTRACT_REWARDESCROW, "Missing RewardEscrow address"));
    }

    function companion() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_ALT_SECONDARYDEPOSIT, "Missing Companion address");
    }

    /// ========= VIEWS =================

    function maximumDeposit() external view returns (uint) {
        return getMaximumDeposit();
    }

    // ========== PUBLIC FUNCTIONS =========

    // invoked by user on L1
    function deposit(uint amount) external {
        require(activated, "Function deactivated");

        require(amount <= getMaximumDeposit(), "Cannot deposit more than the max");

        require(issuer().debtBalanceOf(msg.sender, "sUSD") == 0, "Cannot deposit with debt");

        // now remove their reward escrow
        // Note: escrowSummary would lose the fidelity of the weekly escrows, so this may not be sufficient
        // uint escrowSummary = rewardEscrow().burnForMigration(msg.sender);

        // move the SNX into this contract
        synthetixERC20().transferFrom(msg.sender, address(this), amount);

        // create message payload for L2
        bytes memory messageData = abi.encodeWithSignature("mintSecondaryFromDeposit(address,uint256)", msg.sender, amount);

        // relay the message to this contract on L2 via Messenger1
        messenger().sendMessage(companion(), messageData, 3e6);

        emit Deposit(msg.sender, amount);
    }

    // invoked by user on L2
    function initiateWithdrawal(
        uint /*amount*/
    ) external {
        revert("Not implemented");

        // instruct L2 Synthetix to burn this supply
        // synthetix().burnSecondary(msg.sender, amount);

        // // create message payload for L1
        // bytes memory messageData = abi.encodeWithSignature("completeWithdrawal(address,uint256)", msg.sender, amount);

        // // relay the message to SecondaryDepost on L1 via Messenger2
        // messenger().sendMessage(companion(), messageData, 3e6);
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

    // invoked by Messenger1 on L1 after L2 waiting period elapses
    function completeWithdrawal(
        address, /*account*/
        uint /*amount*/
    ) external {
        revert("Not implemented");
        // ensure function only callable from SecondaryDeposit2 via messenger (aka relayer)
        // require(msg.sender == address(messenger()), "Only the relayer can call this");
        // require(messenger().xDomainMessageSender() == companion(), "Only deposit contract can invoke");

        // // transfer amount back to user
        // synthetixERC20().transfer(account, amount);

        // no escrow actions - escrow remains on L2
    }

    // invoked by the owner for migrating the contract to the new version that will allow for withdrawals
    function migrateDeposit(address newDeposit) external onlyOwner {
        activated = false;

        IERC20 ERC20Synthetix = synthetixERC20();
        // get the current contract balance and transfer it to the new SecondaryDeposit contract
        uint contractBalance = ERC20Synthetix.balanceOf(address(this));
        ERC20Synthetix.transfer(newDeposit, contractBalance);

        emit DepositMigrated(address(this), newDeposit, contractBalance);
    }

    // ========== EVENTS ==========

    event Deposit(address indexed account, uint amount);
    event DepositMigrated(address oldDeposit, address newDeposit, uint amount);
    event MintedSecondary(address indexed account, uint amount);
}
