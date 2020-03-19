pragma solidity 0.4.25;

import "./Owned.sol";


// https://docs.synthetix.io/contracts/SystemStatus # TODO
contract SystemStatus is Owned {
    struct Status {
        bool canSuspend;
        bool canResume;
    }

    mapping(bytes32 => mapping(address => Status)) accessControl;

    mapping(bytes32 => bool) public synthSuspension;

    bool public paused;
    bool public isUpgrade;

    bytes32 public constant SECTION_SYSTEM = "System";
    bytes32 public constant SECTION_SYNTH = "Synth";

    constructor(address _owner) public Owned(_owner) {
        _internalUpdateAccessControl(_owner, SECTION_SYSTEM, true, true);
        _internalUpdateAccessControl(_owner, SECTION_SYNTH, true, true);
    }

    /* ========== VIEWS ========== */
    function requireSystemAvailable() external view {
        require(!paused, isUpgrade ? "Synthetix is paused, upgrade in progress... please stand by" : "Synthetix is paused");
    }

    function requireSynthEnabled(bytes32 currencyKey) external view {
        require(!synthSuspension[currencyKey], "Synth is disabled. Operation prohibited.");
    }

    /* ========== MUTATIVE FUNCTIONS ========== */
    function updateAccessControl(address account, bytes32 section, bool canSuspend, bool canResume) external onlyOwner {
        _internalUpdateAccessControl(account, section, canSuspend, canResume);
    }

    function suspendSystem(bool _isUpgrade) external {
        _requireAccessToSuspend(SECTION_SYSTEM);
        paused = true;
        isUpgrade = _isUpgrade;
        emit SystemSuspended(isUpgrade);
    }

    function resumeSystem() external onlyOwner {
        _requireAccessToResume(SECTION_SYSTEM);
        paused = false;
        bool wasUpgrade = isUpgrade;
        isUpgrade = false;
        emit SystemResumed(wasUpgrade);
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

    function _internalUpdateAccessControl(address account, bytes32 section, bool canSuspend, bool canResume) internal {
        require(section == SECTION_SYSTEM || section == SECTION_SYNTH, "Invalid section supplied");
        accessControl[section][account].canSuspend = canSuspend;
        accessControl[section][account].canSuspend = canResume;
        emit AccessControlUpdated(account, section, canSuspend, canResume);
    }

    /* ========== EVENTS ========== */

    event SystemSuspended(bool isUpgrade);
    event SystemResumed(bool wasUpgrade);

    event SynthSuspended(bytes32 currencyKey);
    event SynthResumed(bytes32 currencyKey);

    event AccessControlUpdated(address indexed account, bytes32 section, bool canSuspend, bool canResume);
}
