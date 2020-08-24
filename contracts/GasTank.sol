pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";

// Internal references
import "./interfaces/IGasTankState.sol";
import "./interfaces/ISystemStatus.sol";
import "./interfaces/ISystemSettings.sol";


contract GasTank is Owned, MixinResolver {
    /* ---------- Address Resolver Configuration ---------- */

    bytes32 internal constant CONTRACT_GASTANKSTATE = "GasTankState";
    bytes32 internal constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 internal constant CONTRACT_SYSTEMSETTINGS = "SystemSettings";

    bytes32[24] internal addressesToCache = [CONTRACT_GASTANKSTATE, CONTRACT_SYSTEMSTATUS, CONTRACT_SYSTEMSETTINGS];

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver, addressesToCache) {}

    /* ========== VIEWS ========== */

    /* ---------- Related Contracts ---------- */

    function _gasTankState() internal view returns (IGasTankState) {
        return IGasTankState(requireAndGetAddress(CONTRACT_GASTANKSTATE, "Missing GasTankState address"));
    }

    function _systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS, "Missing SystemStatus address"));
    }

    function _systemSettings() internal view returns (ISystemSettings) {
        return ISystemSettings(requireAndGetAddress(CONTRACT_SYSTEMSETTINGS, "Missing SystemSettings address"));
    }
}
