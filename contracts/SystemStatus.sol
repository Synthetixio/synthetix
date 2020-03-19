pragma solidity 0.4.25;

import "./Owned.sol";


// https://docs.synthetix.io/contracts/SystemStatus # TODO
contract SystemStatus is Owned {
    bool public paused;
    bool public isUpgrade;
    mapping(bytes32 => mapping(address => bool)) accessControl;
    mapping(bytes32 => bool) public synthDisabled;

    bytes32 public constant SECTION_SYSTEM = "System";
    bytes32 public constant SECTION_SYNTH = "Synth";

    constructor(address _owner) public Owned(_owner) {
        // updateAccessControl(_owner, SECTION_SYSTEM, true);
        // updateAccessControl(_owner, SECTION_SYNTH, true);
    }

    /* ========== VIEWS ========== */
    function requireSystemAvailable() external view {
        require(!paused, isUpgrade ? "Synthetix is paused, upgrade in progress... please stand by" : "Synthetix is paused");
    }

    function requireSynthEnabled(bytes32 currencyKey) external view {
        require(!synthDisabled[currencyKey], "Synth is disabled. Operation prohibited.");
    }

    /* ========== MUTATIVE FUNCTIONS ========== */
    function updateAccessControl(address account, bytes32 section, bool access) public onlyOwner {
        require(section == SECTION_SYSTEM || section == SECTION_SYNTH, "Invalid section supplied");
        accessControl[section][account] = access;
        emit AccessControlUpdated(account, section, access);
    }

    function pause(bool _isUpgrade) external {
        requireAccess(SECTION_SYSTEM);
        paused = true;
        isUpgrade = _isUpgrade;
        emit SystemPauseChange(true, isUpgrade);
    }

    function resume() external onlyOwner {
        requireAccess(SECTION_SYSTEM);
        paused = false;
        isUpgrade = false;
        emit SystemPauseChange(false, false);
    }

    function disableSynth(bytes32 currencyKey) external {
        requireAccess(SECTION_SYNTH);
        synthDisabled[currencyKey] = true;
        emit SynthStatusChange(currencyKey, true);
    }

    function enableSynth(bytes32 currencyKey) external {
        requireAccess(SECTION_SYNTH);
        synthDisabled[currencyKey] = false;
        emit SynthStatusChange(currencyKey, false);
    }

    /* ========== INTERNL FUNCTIONS ========== */

    function requireAccess(bytes32 section) internal view {
        require(accessControl[section][msg.sender], "Restricted to access control list");
    }

    /* ========== EVENTS ========== */

    event SystemPauseChange(bool isPaused, bool isUpgrade);
    event SynthStatusChange(bytes32 currencyKey, bool isDisabled);
    event AccessControlUpdated(address indexed account, bytes32 section, bool access);
}
