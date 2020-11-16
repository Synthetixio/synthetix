pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./Pausable.sol";
import "./MixinResolver.sol";
import "./SafeDecimalMath.sol";

import "./interfaces/ISystemStatus.sol";
import "./interfaces/IIssuer.sol";
import "./interfaces/IMultiCollateral.sol";
import "./interfaces/IMultiCollateralManager.sol";

contract MultiCollateralManager is Owned, MixinResolver, Pausable, IMultiCollateralManager {
    using SafeMath for uint256;
    using SafeDecimalMath for uint256;

    bytes32 private constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";

    bytes32[24] private addressesToCache = [CONTRACT_SYSTEMSTATUS, CONTRACT_ISSUER];

    address[] public collaterals;

    // The set of all synths issuable by mutli collateral contracts
    bytes32[] public synths;

    struct balance {
        uint long;
        uint short;
    }

    mapping(bytes32 => balance) totalIssued;

    /* ========== CONSTRUCTOR ========== */
    constructor(address _owner, address _resolver) Owned(_owner) Pausable() MixinResolver(_resolver, addressesToCache) public {}

    /* ========== VIEWS ========== */

    /* ---------- Related Contracts ---------- */

    function _systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS, "Missing SystemStatus address"));
    }

    function _issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER, "Missing Issuer address"));
    }

    /* ---------- Loan Information ---------- */

    // Do we have this collateral address? Used by contracts that want to know the caller is valid.
    function collateralByAddress(address collateral) external view returns (bool) {
        // in practice, this list is going to be very short.
        for  (uint i  = 0; i < collaterals.length; i++) {
            if (collaterals[i] == collateral) {
                return true;
            }
        }
        return false;
    }

    function getUtilisation(bool exclude) external view returns (uint256) {

        // Are we just getting the snx only debt here? Because its excluding collateral?

        uint total = _issuer().totalIssuedSynths("sUSD", exclude);
        // uint exlude = _issuer().totalIssuedSynths("sUSD", exclude);
        
        return total;
    }

    // Issuer should call this to workout what the current multi collat issued is.
    function issuedSynths(bytes32 synth) public view returns (uint256 long, uint256 short) {
        return (totalIssued[synth].long, totalIssued[synth].short);
    }

    function addCollateral(address collateral) external onlyOwner {
        collaterals.push(collateral);
    }

    // only MC contracts
    function incrementLongs(bytes32 synth, uint256 amount) external {
        totalIssued[synth].long = totalIssued[synth].long.add(amount);
    }

    // only MC contracts
    function decrementLongs(bytes32 synth, uint256 amount) external {
        totalIssued[synth].long = totalIssued[synth].long.sub(amount);
    }

    // only MC contracts
    function incrementShorts(bytes32 synth, uint256 amount) external {
        totalIssued[synth].short = totalIssued[synth].short.add(amount);
    }

    // only MC contracts
    function decrementShorts(bytes32 synth, uint256 amount) external {
        totalIssued[synth].short = totalIssued[synth].short.sub(amount);
    }

    function getShortRate(bytes32 synth) external view returns (uint256 rate) {
        return 0;
    }

    function getBorrowRate() external view returns (uint256 rate) {

        // get the total system debt
        uint totalDebt = _issuer().totalIssuedSynths("sUSD", false);

        // now get the exlcuded debt
        uint collateralDebt = _issuer().totalIssuedSynths("sUSD", true);

        if (collateralDebt == 0) {
            return 0;
        }

        uint cd = totalDebt - collateralDebt;

        uint256 ratio = cd.divideDecimalRound(totalDebt);

        uint256 slope =  2 * SafeDecimalMath.unit(); // Get this from the manager?

        rate = ratio.multiplyDecimal(slope);
    }
}