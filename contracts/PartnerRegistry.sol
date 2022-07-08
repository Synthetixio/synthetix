pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./Proxyable.sol";
import "./LimitedSetup.sol";
import "./MixinPartner.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/IVolumePartner.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/ISynth.sol";
import "./interfaces/IExchanger.sol";
import "./interfaces/IFuturesMarketManager.sol";

// https://docs.synthetix.io/contracts/source/contracts/partnerregistry
contract ParterRegistry is Owned, Proxyable, LimitedSetup, MixinSystemSettings, MixinPartner, IPartnerRegistry {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    bytes32 public constant CONTRACT_NAME = "PartnerRegistry";

    // Where fees are pooled in sUSD.
    address public constant FEE_ADDRESS = 0x0000fEefEeFeEFEEfEefeEfEEFeEfeefEEFEEfEE;

    // sUSD currencyKey. Fees stored and paid in sUSD
    bytes32 private sUSD = "sUSD";

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_EXCHANGER = "Exchanger";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_FUTURES_MARKET_MANAGER = "FuturesMarketManager";

    constructor(
        address payable _proxy,
        address _owner,
        address _resolver
    ) public Owned(_owner) Proxyable(_proxy) LimitedSetup(3 weeks) MixinSystemSettings(_resolver) {}

    /* ========== VIEWS ========== */

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](4);
        newAddresses[0] = CONTRACT_FLEXIBLESTORAGE;
        newAddresses[1] = CONTRACT_EXCHANGER;
        newAddresses[2] = CONTRACT_ISSUER;
        newAddresses[3] = CONTRACT_FUTURES_MARKET_MANAGER;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    function futuresMarketManager() internal view returns (IFuturesMarketManager) {
        return IFuturesMarketManager(requireAndGetAddress(CONTRACT_FUTURES_MARKET_MANAGER));
    }

    function exchanger() internal view returns (IExchanger) {
        return IExchanger(requireAndGetAddress(CONTRACT_EXCHANGER));
    }

    function issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER));
    }



    function ownerSlot(bytes32 volumePartnerCode) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(volumePartnerCode, "owner"));
    }

    function nominatedOwnerSlot(bytes32 volumePartnerCode) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(volumePartnerCode, "nominatedOwner"));
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function registerVolumePartnerCode(
        bytes32 volumePartnerCode,
        address volumePartnerCodeOwner,
        address volumePartnerDeposit,
        uint feeRate
    ) external {
        require(
            flexibleStorage().getAddressValue(CONTRACT_NAME, ownerSlot(volumePartnerCode)) == address(0),
            "This volume partner code has already been registered."
        );
        require(volumePartnerCodeOwner != address(0), "Owner cannot be the zero address.");
        require(feeRate <= getMaxVolumePartnerFee(), "Fee rate must be less than or equal to the maximum.");

        bytes32[] memory records = new bytes32[](2);
        records[0] = ownerSlot(volumePartnerCode);
        records[1] = depositSlot(volumePartnerCode);

        address[] memory addrs = new address[](2);
        addrs[0] = volumePartnerCodeOwner;
        addrs[1] = volumePartnerDeposit;
        flexibleStorage().setAddressValues(CONTRACT_NAME, records, addrs);
        
        flexibleStorage().setUIntValue(CONTRACT_NAME, feeRateSlot(volumePartnerCode), feeRate);

        emit VolumePartnerCodeRegistered(volumePartnerCode, volumePartnerCodeOwner, volumePartnerDeposit, msg.sender, feeRate);
    }

    function updateFeeRate(bytes32 volumePartnerCode, uint feeRate) external requirePartnerOwner(volumePartnerCode) {
        require(feeRate <= getMaxVolumePartnerFee(), "Fee rate must be less than or equal to the maximum.");

        flexibleStorage().setUIntValue(CONTRACT_NAME, feeRateSlot(volumePartnerCode), feeRate);

        emit FeeRateUpdated(volumePartnerCode, msg.sender, feeRate);
    }

    function updatePartnerDeposit(bytes32 volumePartnerCode, address newDeposit) external requirePartnerOwner(volumePartnerCode) {
        flexibleStorage().setAddressValue(CONTRACT_NAME, depositSlot(volumePartnerCode), newDeposit);

        emit PartnerDepositUpdated(volumePartnerCode, msg.sender, newDeposit);
    }

    function nominateParterOwner(bytes32 volumePartnerCode, address nominee) external requirePartnerOwner(volumePartnerCode) {
        flexibleStorage().setAddressValue(CONTRACT_NAME, nominatedOwnerSlot(volumePartnerCode), nominee);
        emit OwnerNominated(volumePartnerCode, nominee);
    }

    function acceptPartnerOwnership(bytes32 volumePartnerCode) external {
        bytes32[] memory records = new bytes32[](2);
        records[0] = ownerSlot(volumePartnerCode);
        records[1] = nominatedOwnerSlot(volumePartnerCode);

        address[] memory addrs = flexibleStorage().getAddressValues(CONTRACT_NAME, records);
        require(
            msg.sender == addrs[1],
            "You are not the nominated owner of this volume partner code"
        );

        address oldOwner = addrs[0];

        addrs[0] = addrs[1];
        addrs[1] = address(0);
        flexibleStorage().setAddressValues(CONTRACT_NAME, records, addrs);

        emit OwnershipTransferred(
            volumePartnerCode,
            oldOwner,
            addrs[0]
        );
    }

    /* ========== Modifiers ========== */

    modifier requirePartnerOwner(bytes32 volumePartnerCode) {
        require(
            msg.sender == flexibleStorage().getAddressValue(CONTRACT_NAME, ownerSlot(volumePartnerCode)),
            "You are not the owner of this volume partner code"
        );
        _;
    }

    modifier notFeeAddress(address account) {
        require(account != FEE_ADDRESS, "Fee address not allowed");
        _;
    }

    function _isInternalContract(address account) internal view returns (bool) {
        return account == address(exchanger()) || account == address(futuresMarketManager());
    }

    modifier onlyInternalContracts {
        require(_isInternalContract(msg.sender), "Only Internal Contracts");
        _;
    }

    // ========== EVENTS ==========
    event VolumePartnerCodeRegistered(
        bytes32 indexed volumePartnerCode,
        address indexed owner,
        address indexed deposit,
        address caller,
        uint feeRate
    );
    event FeeRateUpdated(bytes32 indexed volumePartnerCode, address caller, uint feeRate);
    event PartnerDepositUpdated(bytes32 indexed volumePartnerCode, address caller, address newDeposit);
    event OwnerNominated(bytes32 indexed volumePartnerCode, address nominee);
    event OwnershipTransferred(bytes32 indexed volumePartnerCode, address previousOwner, address newOwner);
}
