pragma solidity ^0.8.8;

// Inheritance
import "./BaseSynthetixBridge.sol";
import "./interfaces/ISynthetixBridgeToOptimism.sol";
import "@eth-optimism/contracts/iOVM/bridge/tokens/iOVM_L1TokenGateway.sol";

// Internal references
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IIssuer.sol";
import "./interfaces/ISynthetixBridgeToBase.sol";
import "@eth-optimism/contracts/iOVM/bridge/tokens/iOVM_L2DepositedToken.sol";

contract SynthetixBridgeToOptimism is BaseSynthetixBridge, ISynthetixBridgeToOptimism, iOVM_L1TokenGateway {
    using SafeERC20 for IERC20;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_REWARDSDISTRIBUTION = "RewardsDistribution";
    bytes32 private constant CONTRACT_OVM_SYNTHETIXBRIDGETOBASE = "ovm:SynthetixBridgeToBase";
    bytes32 private constant CONTRACT_SYNTHETIXBRIDGEESCROW = "SynthetixBridgeEscrow";

    uint8 private constant MAX_ENTRIES_MIGRATED_PER_MESSAGE = 26;

    // ========== CONSTRUCTOR ==========

    constructor(address _owner, address _resolver) BaseSynthetixBridge(_owner, _resolver) {}

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
        require(issuer().debtBalanceOf(msg.sender, "sUSD") == 0, "Cannot deposit or migrate with debt");
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

    // ========== MODIFIERS ============

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

        _depositReward(msg.sender, amount);
    }

    // forward any accidental tokens sent here to the escrow
    function forwardTokensToEscrow(address token) external {
        IERC20 erc20 = IERC20(token);
        erc20.safeTransfer(synthetixBridgeEscrow(), erc20.balanceOf(address(this)));
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
        emit iOVM_L1TokenGateway.WithdrawalFinalized(to, amount);
    }

    // invoked by RewardsDistribution on L1 (takes SNX)
    function notifyRewardAmount(uint256 amount) external {
        require(msg.sender == address(rewardsDistribution()), "Caller is not RewardsDistribution contract");

        // NOTE: transfer SNX to synthetixBridgeEscrow because RewardsDistribution transfers them initially to this contract.
        synthetixERC20().transfer(synthetixBridgeEscrow(), amount);

        // to be here means I've been given an amount of SNX to distribute onto L2
        _depositReward(msg.sender, amount);
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

    function _depositReward(address _from, uint256 _amount) internal {
        // create message payload for L2
        ISynthetixBridgeToBase bridgeToBase;
        bytes memory messageData = abi.encodeWithSelector(bridgeToBase.finalizeRewardDeposit.selector, _from, _amount);

        // relay the message to this contract on L2 via L1 Messenger
        messenger().sendMessage(
            synthetixBridgeToBase(),
            messageData,
            uint32(getCrossDomainMessageGasLimit(CrossDomainMessageGasLimits.Reward))
        );

        emit RewardDepositInitiated(_from, _amount);
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

        emit iOVM_L1TokenGateway.DepositInitiated(msg.sender, _to, _depositAmount);
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

    event ExportedVestingEntries(
        address indexed account,
        uint256 escrowedAccountBalance,
        VestingEntries.VestingEntry[] vestingEntries
    );

    event RewardDepositInitiated(address indexed account, uint256 amount);
}
