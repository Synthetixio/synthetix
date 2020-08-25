pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";

// Internal references
import "./interfaces/IGasTankState.sol";


contract GasTankState is Owned, MixinResolver, IGasTankState {
    /* ========== STATE VARIABLES ========== */

    mapping(address => uint) public deposits;
    mapping(address => uint) public maxGasPrices;
    /* ---------- Address Resolver Configuration ---------- */

    bytes32 internal constant CONTRACT_GASTANK = "GasTank";

    bytes32[24] internal addressesToCache = [CONTRACT_GASTANK];

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver, addressesToCache) {}

    /* ========== VIEWS ========== */

    /* ---------- Related Contracts ---------- */

    function _gasTank() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_GASTANK, "Missing GasTank address");
    }

    /* ---------- GasTankState Information ---------- */

    function balanceOf(address _account) external view returns (uint) {
        return deposits[_account];
    }

    function maxGasPriceOf(address _account) external view returns (uint) {
        return maxGasPrices[_account];
    }
}
