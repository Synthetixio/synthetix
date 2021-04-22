pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./BaseSynthetixBridge.sol";
import "./interfaces/ISynthetixBridgeToBase.sol";
import "@eth-optimism/contracts/iOVM/bridge/tokens/iOVM_L2DepositedToken.sol";

// Internal references
import "@eth-optimism/contracts/iOVM/bridge/tokens/iOVM_L1TokenGateway.sol";

contract SynthetixBridgeToBase is BaseSynthetixBridge, ISynthetixBridgeToBase, iOVM_L2DepositedToken {
    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_BASE_SYNTHETIXBRIDGETOOPTIMISM = "base:SynthetixBridgeToOptimism";

    // ========== CONSTRUCTOR ==========

    constructor(
        address payable _proxy,
        address _owner,
        address _resolver
    ) public BaseSynthetixBridge(_proxy, _owner, _resolver) {}

    // ========== INTERNALS ============

    function synthetixBridgeToOptimism() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_BASE_SYNTHETIXBRIDGETOOPTIMISM);
    }

    function onlyAllowFromOptimism() internal view {
        // ensure function only callable from the L2 bridge via messenger (aka relayer)
        iAbs_BaseCrossDomainMessenger _messenger = messenger();
        require(messageSender == address(_messenger), "Only the relayer can call this");
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

    function getFinalizeWithdrawalL1Gas() external view returns (uint32) {
        return uint32(getCrossDomainMessageGasLimit(CrossDomainMessageGasLimits.Withdrawal));
    }

    // ========== PUBLIC FUNCTIONS =========

    // invoked by user on L2
    function withdraw(uint amount) external requireInitiationActive optionalProxy {
        _initiateWithdraw(messageSender, amount);
    }

    function withdrawTo(address to, uint amount) external requireInitiationActive optionalProxy {
        _initiateWithdraw(to, amount);
    }

    function _initiateWithdraw(address to, uint amount) private {
        require(synthetix().transferableSynthetix(messageSender) >= amount, "Not enough transferable SNX");

        // instruct L2 Synthetix to burn this supply
        synthetix().burnSecondary(messageSender, amount);

        // create message payload for L1
        iOVM_L1TokenGateway bridgeToOptimism;
        bytes memory messageData = abi.encodeWithSelector(bridgeToOptimism.finalizeWithdrawal.selector, to, amount);

        // relay the message to Bridge on L1 via L2 Messenger
        messenger().sendMessage(
            synthetixBridgeToOptimism(),
            messageData,
            uint32(getCrossDomainMessageGasLimit(CrossDomainMessageGasLimits.Withdrawal))
        );

        emit WithdrawalInitiated(messageSender, to, amount);
    }

    // ========= RESTRICTED FUNCTIONS ==============

    function finalizeEscrowMigration(
        address account,
        uint256 escrowedAmount,
        VestingEntries.VestingEntry[] calldata vestingEntries
    ) external onlyOptimismBridge optionalProxy {
        IRewardEscrowV2 rewardEscrow = rewardEscrowV2();
        // First, mint the escrowed SNX that are being migrated
        synthetix().mintSecondary(address(rewardEscrow), escrowedAmount);
        rewardEscrow.importVestingEntries(account, escrowedAmount, vestingEntries);

        emitImportedVestingEntries(account, escrowedAmount, vestingEntries);
    }

    // invoked by Messenger on L2
    function finalizeDeposit(address to, uint256 amount) external onlyOptimismBridge optionalProxy {
        // now tell Synthetix to mint these tokens, deposited in L1, into the specified account for L2
        synthetix().mintSecondary(to, amount);

        emit DepositFinalized(to, amount);
    }

    // invoked by Messenger on L2
    function finalizeRewardDeposit(uint256 amount) external onlyOptimismBridge optionalProxy {
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
    bytes32 private constant IMPORTEDVESTINGENTRIES_SIG =
        keccak256("ImportedVestingEntries(address,uint256,(uint64,uint256)[])");

    function emitImportedVestingEntries(
        address account,
        uint256 escrowedAmount,
        VestingEntries.VestingEntry[] memory vestingEntries
    ) internal {
        proxy._emit(
            abi.encode(escrowedAmount, vestingEntries),
            2,
            IMPORTEDVESTINGENTRIES_SIG,
            bytes32(uint256(uint160(account))),
            0,
            0
        );
    }

    event DepositFinalized(address indexed to, uint256 amount);
    bytes32 private constant DEPOSITFINALIZED_SIG = keccak256("DepositFinalized(address,uint256)");

    function emitDepositFinalized(address to, uint256 amount) internal {
        proxy._emit(abi.encode(amount), 2, DEPOSITFINALIZED_SIG, bytes32(uint256(uint160(to))), 0, 0);
    }

    event MintedSecondaryRewards(uint256 amount);
    bytes32 private constant MINTEDSECONDARYREWARDS_SIG = keccak256("MintedSecondaryRewards(uint256)");

    function emitMintedSecondaryRewards(uint256 amount) internal {
        proxy._emit(abi.encode(amount), 1, DEPOSITFINALIZED_SIG, 0, 0, 0);
    }

    event WithdrawalInitiated(address indexed from, address to, uint256 amount);
    bytes32 private constant WITHDRAWALINITIATED_SIG = keccak256("WithdrawalInitiated(address,address,uint256)");

    function emitWithdrawalInitiated(
        address from,
        address to,
        uint256 amount
    ) internal {
        proxy._emit(abi.encode(to, amount), 2, WITHDRAWALINITIATED_SIG, bytes32(uint256(uint160(from))), 0, 0);
    }
}
