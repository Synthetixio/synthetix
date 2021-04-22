pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./BaseSynthetixBridge.sol";
import "./interfaces/ISynthetixBridgeToOptimism.sol";
import "@eth-optimism/contracts/iOVM/bridge/tokens/iOVM_L1TokenGateway.sol";

// Internal references
import "./interfaces/IERC20.sol";
import "./interfaces/IIssuer.sol";
import "./interfaces/ISynthetixBridgeToBase.sol";
import "@eth-optimism/contracts/iOVM/bridge/tokens/iOVM_L2DepositedToken.sol";

contract SynthetixBridgeToOptimism is BaseSynthetixBridge, ISynthetixBridgeToOptimism, iOVM_L1TokenGateway {
    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_REWARDSDISTRIBUTION = "RewardsDistribution";
    bytes32 private constant CONTRACT_OVM_SYNTHETIXBRIDGETOBASE = "ovm:SynthetixBridgeToBase";
    bytes32 private constant CONTRACT_SYNTHETIXBRIDGEESCROW = "SynthetixBridgeEscrow";

    uint8 private constant MAX_ENTRIES_MIGRATED_PER_MESSAGE = 26;

    // ========== CONSTRUCTOR ==========

    constructor(
        address payable _proxy,
        address _owner,
        address _resolver
    ) public BaseSynthetixBridge(_proxy, _owner, _resolver) {}

    // ========== INTERNALS ============

    function synthetixERC20() internal view returns (IERC20) {
        return IERC20(requireAndGetAddress(CONTRACT_SYNTHETIX));
    }

    function issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER));
    }

    function rewardsDistribution() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_REWARDSDISTRIBUTION);
    }

    function synthetixBridgeToBase() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_OVM_SYNTHETIXBRIDGETOBASE);
    }

    function synthetixBridgeEscrow() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_SYNTHETIXBRIDGEESCROW);
    }

    function hasZeroDebt() internal view {
        require(issuer().debtBalanceOf(messageSender, "sUSD") == 0, "Cannot deposit or migrate with debt");
    }

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = BaseSynthetixBridge.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](4);
        newAddresses[0] = CONTRACT_ISSUER;
        newAddresses[1] = CONTRACT_REWARDSDISTRIBUTION;
        newAddresses[2] = CONTRACT_OVM_SYNTHETIXBRIDGETOBASE;
        newAddresses[3] = CONTRACT_SYNTHETIXBRIDGEESCROW;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    function getFinalizeDepositL2Gas() external view returns (uint32) {
        return uint32(getCrossDomainMessageGasLimit(CrossDomainMessageGasLimits.Deposit));
    }

    // ========== MODIFIERS ============

    modifier requireZeroDebt() {
        hasZeroDebt();
        _;
    }

    // ========== PUBLIC FUNCTIONS =========

    function deposit(uint256 amount) external requireInitiationActive requireZeroDebt onlyProxy {
        _initiateDeposit(messageSender, amount);
    }

    function depositTo(address to, uint amount) external requireInitiationActive requireZeroDebt {
        _initiateDeposit(to, amount);
    }

    function migrateEscrow(uint256[][] memory entryIDs) public requireInitiationActive requireZeroDebt {
        _migrateEscrow(entryIDs);
    }

    // invoked by a generous user on L1
    function depositReward(uint amount) external requireInitiationActive onlyProxy {
        // move the SNX into the deposit escrow
        synthetixERC20().transferFrom(messageSender, synthetixBridgeEscrow(), amount);

        _depositReward(amount);
    }

    // ========= RESTRICTED FUNCTIONS ==============

    // invoked by Messenger on L1 after L2 waiting period elapses
    function finalizeWithdrawal(address to, uint256 amount) external optionalProxy {
        // ensure function only callable from L2 Bridge via messenger (aka relayer)
        require(messageSender == address(messenger()), "Only the relayer can call this");
        require(messenger().xDomainMessageSender() == synthetixBridgeToBase(), "Only the L2 bridge can invoke");

        // transfer amount back to user
        synthetixERC20().transferFrom(synthetixBridgeEscrow(), to, amount);

        // no escrow actions - escrow remains on L2
        emitWithdrawalFinalized(to, amount);
    }

    // invoked by RewardsDistribution on L1 (takes SNX)
    function notifyRewardAmount(uint256 amount) external requireInitiationActive optionalProxy {
        require(messageSender == address(rewardsDistribution()), "Caller is not RewardsDistribution contract");

        // to be here means I've been given an amount of SNX to distribute onto L2
        _depositReward(amount);
    }

    function depositAndMigrateEscrow(uint256 depositAmount, uint256[][] memory entryIDs)
        public
        requireInitiationActive
        requireZeroDebt
        optionalProxy
    {
        if (entryIDs.length > 0) {
            _migrateEscrow(entryIDs);
        }

        if (depositAmount > 0) {
            _initiateDeposit(messageSender, depositAmount);
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

        emitRewardDeposit(messageSender, _amount);
    }

    function _initiateDeposit(address _to, uint256 _depositAmount) private {
        // Transfer SNX to L2
        // First, move the SNX into the deposit escrow
        synthetixERC20().transferFrom(messageSender, synthetixBridgeEscrow(), _depositAmount);
        // create message payload for L2
        iOVM_L2DepositedToken bridgeToBase;
        bytes memory messageData = abi.encodeWithSelector(bridgeToBase.finalizeDeposit.selector, _to, _depositAmount);

        // relay the message to this contract on L2 via L1 Messenger
        messenger().sendMessage(
            synthetixBridgeToBase(),
            messageData,
            uint32(getCrossDomainMessageGasLimit(CrossDomainMessageGasLimits.Deposit))
        );

        emitDepositInitiated(messageSender, _to, _depositAmount);
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
            (escrowedAccountBalance, vestingEntries) = rewardEscrowV2().burnForMigration(messageSender, _entryIDs[i]);

            // if there is an escrow amount to be migrated
            if (escrowedAccountBalance > 0) {
                // NOTE: transfer SNX to synthetixBridgeEscrow because burnForMigration() transfers them to this contract.
                synthetixERC20().transfer(synthetixBridgeEscrow(), escrowedAccountBalance);
                // create message payload for L2
                ISynthetixBridgeToBase bridgeToBase;
                bytes memory messageData =
                    abi.encodeWithSelector(
                        bridgeToBase.finalizeEscrowMigration.selector,
                        messageSender,
                        escrowedAccountBalance,
                        vestingEntries
                    );
                // relay the message to this contract on L2 via L1 Messenger
                messenger().sendMessage(
                    synthetixBridgeToBase(),
                    messageData,
                    uint32(getCrossDomainMessageGasLimit(CrossDomainMessageGasLimits.Escrow))
                );

                emitExportedVestingEntries(messageSender, escrowedAccountBalance, vestingEntries);
            }
        }
    }

    // ========== EVENTS ==========

    event DepositInitiated(address indexed from, address to, uint256 amount);
    bytes32 private constant DEPOSITINITIATED_SIG = keccak256("DepositInitiated(address,address,uint256)");

    function emitDepositInitiated(
        address from,
        address to,
        uint256 amount
    ) internal {
        proxy._emit(abi.encode(to, amount), 2, DEPOSITINITIATED_SIG, bytes32(uint256(uint160(from))), 0, 0);
    }

    event ExportedVestingEntries(
        address indexed account,
        uint256 escrowedAccountBalance,
        VestingEntries.VestingEntry[] vestingEntries
    );
    bytes32 private constant EXPORTEDVESTINGENTRIES_SIG =
        keccak256("ExportedVestingEntries(address,uint256,(uint64,uint256)[])");

    function emitExportedVestingEntries(
        address account,
        uint256 escrowedAccountBalance,
        VestingEntries.VestingEntry[] memory vestingEntries
    ) internal {
        proxy._emit(
            abi.encode(escrowedAccountBalance, vestingEntries),
            2,
            EXPORTEDVESTINGENTRIES_SIG,
            bytes32(uint256(uint160(account))),
            0,
            0
        );
    }

    event RewardDeposit(address indexed account, uint256 amount);
    bytes32 private constant REWARDDEPOSIT_SIG = keccak256("RewardDeposit(address,uint256)");

    function emitRewardDeposit(address account, uint256 amount) internal {
        proxy._emit(abi.encode(amount), 2, REWARDDEPOSIT_SIG, bytes32(uint256(uint160(account))), 0, 0);
    }

    event WithdrawalFinalized(address indexed to, uint256 amount);
    bytes32 private constant WITHDRAWALFINALIZED_SIG = keccak256("WithdrawalFinalized(address,uint256)");

    function emitWithdrawalFinalized(address to, uint256 amount) internal {
        proxy._emit(abi.encode(amount), 2, WITHDRAWALFINALIZED_SIG, bytes32(uint256(uint160(to))), 0, 0);
    }
}
