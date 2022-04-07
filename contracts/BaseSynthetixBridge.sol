pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/IBaseSynthetixBridge.sol";

// Internal references
import "./interfaces/ISynthetix.sol";
import "./interfaces/IRewardEscrowV2.sol";
import "./interfaces/IIssuer.sol";
import "./interfaces/IFeePool.sol";
import "@eth-optimism/contracts/iOVM/bridge/messaging/iAbs_BaseCrossDomainMessenger.sol";

contract BaseSynthetixBridge is Owned, MixinSystemSettings, IBaseSynthetixBridge {
    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_EXT_MESSENGER = "ext:Messenger";
    bytes32 internal constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_REWARDESCROW = "RewardEscrowV2";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_FEEPOOL = "FeePool";

    bool public initiationActive;

    // ========== CONSTRUCTOR ==========

    constructor(address _owner, address _resolver) public Owned(_owner) MixinSystemSettings(_resolver) {
        initiationActive = true;
    }

    // ========== INTERNALS ============

    function messenger() internal view returns (iAbs_BaseCrossDomainMessenger) {
        return iAbs_BaseCrossDomainMessenger(requireAndGetAddress(CONTRACT_EXT_MESSENGER));
    }

    function synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX));
    }

    function rewardEscrowV2() internal view returns (IRewardEscrowV2) {
        return IRewardEscrowV2(requireAndGetAddress(CONTRACT_REWARDESCROW));
    }

    function issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER));
    }

    function feePool() internal view returns (IFeePool) {
        return IFeePool(requireAndGetAddress(CONTRACT_FEEPOOL));
    }

    function initiatingActive() internal view {
        require(initiationActive, "Initiation deactivated");
    }

    function counterpart() internal view returns (address);

    function onlyAllowFromCounterpart() internal view {
        // ensure function only callable from the L2 bridge via messenger (aka relayer)
        iAbs_BaseCrossDomainMessenger _messenger = messenger();
        require(msg.sender == address(_messenger), "Only the relayer can call this");
        require(_messenger.xDomainMessageSender() == counterpart(), "Only a counterpart bridge can invoke");
    }

    modifier onlyCounterpart() {
        onlyAllowFromCounterpart();
        _;
    }

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](5);
        newAddresses[0] = CONTRACT_EXT_MESSENGER;
        newAddresses[1] = CONTRACT_SYNTHETIX;
        newAddresses[2] = CONTRACT_REWARDESCROW;
        newAddresses[3] = CONTRACT_ISSUER;
        newAddresses[4] = CONTRACT_FEEPOOL;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    // ========== MODIFIERS ============

    modifier requireInitiationActive() {
        initiatingActive();
        _;
    }

    // ========= RESTRICTED FUNCTIONS ==============

    function suspendInitiation() external onlyOwner {
        require(initiationActive, "Initiation suspended");
        initiationActive = false;
        emit InitiationSuspended();
    }

    function resumeInitiation() external onlyOwner {
        require(!initiationActive, "Initiation not suspended");
        initiationActive = true;
        emit InitiationResumed();
    }

    function initiateSynthTransfer(
        bytes32 currencyKey,
        address destination,
        uint amount
    ) external {
        require(destination != address(0), "Cannot send to zero address");

        issuer().burnFreeSynths(currencyKey, msg.sender, amount);

        // create message payload
        bytes memory messageData =
            abi.encodeWithSelector(this.finalizeSynthTransfer.selector, currencyKey, destination, amount);

        // relay the message to Bridge on L1 via L2 Messenger
        messenger().sendMessage(
            counterpart(),
            messageData,
            uint32(getCrossDomainMessageGasLimit(CrossDomainMessageGasLimits.Withdrawal))
        );

        emit InitiateSynthTransfer(currencyKey, destination, amount);
    }

    function finalizeSynthTransfer(
        bytes32 currencyKey,
        address destination,
        uint amount
    ) external onlyCounterpart {
        issuer().issueFreeSynths(currencyKey, destination, amount);

        emit FinalizeSynthTransfer(currencyKey, destination, amount);
    }

    // ========== EVENTS ==========

    event InitiationSuspended();

    event InitiationResumed();

    event InitiateSynthTransfer(bytes32 indexed currencyKey, address indexed destination, uint256 amount);
    event FinalizeSynthTransfer(bytes32 indexed currencyKey, address indexed destination, uint256 amount);
}
