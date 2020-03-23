pragma solidity 0.4.25;

import "./Owned.sol";


// https://docs.synthetix.io/contracts/SystemStatus # TODO
contract SystemStatus is Owned {
    struct Status {
        bool canSuspend;
        bool canResume;
    }

    mapping(bytes32 => mapping(address => Status)) public accessControl;

    mapping(bytes32 => bool) public synthSuspension;

    bool public systemSuspended;
    bool public systemUpgrading;

    bool public issuanceSuspended;

    bytes32 public constant SECTION_SYSTEM = "System";
    bytes32 public constant SECTION_ISSUANCE = "Issuance";
    bytes32 public constant SECTION_SYNTH = "Synth";

    constructor(address _owner) public Owned(_owner) {
        _internalUpdateAccessControl(_owner, SECTION_SYSTEM, true, true);
        _internalUpdateAccessControl(_owner, SECTION_ISSUANCE, true, true);
        _internalUpdateAccessControl(_owner, SECTION_SYNTH, true, true);
    }

    /* ========== VIEWS ========== */
    function requireSystemActive() external view {
        _internalRequireSystemActive();
    }

    function requireIssuanceActive() external view {
        // Issuance requires the system be active
        _internalRequireSystemActive();
        require(!issuanceSuspended, "Issuance is suspended. Operation prohibited.");
    }

    function requireSynthActive(bytes32 currencyKey) external view {
        // Synth exchange and transfer requires the system be active
        _internalRequireSystemActive();
        require(!synthSuspension[currencyKey], "Synth is suspended. Operation prohibited.");
    }

    function requireSynthsActive(bytes32 sourceCurrencyKey, bytes32 destinationCurrencyKey) external view {
        // Synth exchange and transfer requires the system be active
        _internalRequireSystemActive();

        require(
            !synthSuspension[sourceCurrencyKey] && !synthSuspension[destinationCurrencyKey],
            "One or more synths are suspended. Operation prohibited."
        );
    }

    /* ========== MUTATIVE FUNCTIONS ========== */
    function updateAccessControl(address account, bytes32 section, bool canSuspend, bool canResume) external onlyOwner {
        _internalUpdateAccessControl(account, section, canSuspend, canResume);
    }

    function suspendSystem(bool _systemUpgrading) external {
        _requireAccessToSuspend(SECTION_SYSTEM);
        systemSuspended = true;
        systemUpgrading = _systemUpgrading;
        emit SystemSuspended(systemUpgrading);
    }

    function resumeSystem() external {
        _requireAccessToResume(SECTION_SYSTEM);
        systemSuspended = false;
        emit SystemResumed(systemUpgrading);
        systemUpgrading = false;
    }

    function suspendIssuance() external {
        _requireAccessToSuspend(SECTION_ISSUANCE);
        issuanceSuspended = true;
        emit IssuanceSuspended();
    }

    function resumeIssuance() external {
        _requireAccessToResume(SECTION_ISSUANCE);
        issuanceSuspended = false;
        emit IssuanceResumed();
    }

    function suspendSynth(bytes32 currencyKey) external {
        _requireAccessToSuspend(SECTION_SYNTH);
        synthSuspension[currencyKey] = true;
        emit SynthSuspended(currencyKey);
    }

    function resumeSynth(bytes32 currencyKey) external {
        _requireAccessToResume(SECTION_SYNTH);
        synthSuspension[currencyKey] = false;
        emit SynthResumed(currencyKey);
    }

    /* ========== INTERNL FUNCTIONS ========== */

    function _requireAccessToSuspend(bytes32 section) internal view {
        require(accessControl[section][msg.sender].canSuspend, "Restricted to access control list");
    }

    function _requireAccessToResume(bytes32 section) internal view {
        require(accessControl[section][msg.sender].canResume, "Restricted to access control list");
    }

    function _internalRequireSystemActive() internal view {
        require(
            !systemSuspended,
            systemUpgrading
                ? "Synthetix is suspended, upgrade in progress... please stand by"
                : "Synthetix is suspended. Operation prohibited."
        );
    }

    function _internalUpdateAccessControl(address account, bytes32 section, bool canSuspend, bool canResume) internal {
        require(
            section == SECTION_SYSTEM || section == SECTION_ISSUANCE || section == SECTION_SYNTH,
            "Invalid section supplied"
        );
        accessControl[section][account].canSuspend = canSuspend;
        accessControl[section][account].canResume = canResume;
        emit AccessControlUpdated(account, section, canSuspend, canResume);
    }

    /* ========== EVENTS ========== */

    event SystemSuspended(bool systemUpgrading);
    event SystemResumed(bool systemUpgrading);

    event IssuanceSuspended();
    event IssuanceResumed();

    event SynthSuspended(bytes32 currencyKey);
    event SynthResumed(bytes32 currencyKey);

    event AccessControlUpdated(address indexed account, bytes32 section, bool canSuspend, bool canResume);
}
