pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./interfaces/ILiquidations.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./EternalStorage.sol";

// Inheritance
import "./interfaces/ISynthetix.sol";
import "./interfaces/ISynthetixState.sol";
import "./interfaces/IIssuer.sol";


// https://docs.synthetix.io/contracts/Liquidations
// contract Liquidations is Owned, MixinResolver {
contract Liquidations is Owned, MixinResolver, ILiquidations {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    struct LiquidationEntry {
        uint deadline;
    }

    bytes32 private constant sUSD = "sUSD";

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_ETERNALSTORAGE_LIQUIDATIONS = "EternalStorageLiquidations";
    bytes32 private constant CONTRACT_SYNTHETIXSTATE = "SynthetixState";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";

    bytes32[24] private addressesToCache = [
        CONTRACT_SYNTHETIX,
        CONTRACT_ETERNALSTORAGE_LIQUIDATIONS,
        CONTRACT_SYNTHETIXSTATE,
        CONTRACT_ISSUER
    ];

    /* ========== STATE VARIABLES ========== */
    uint public constant MAX_LIQUIDATION_RATIO = 1e18; // 100% collateral ratio
    uint public constant MAX_LIQUIDATION_TARGET_RATIO = 1e19; // 1000% MAX target collateral ratio
    uint public constant MAX_LIQUIDATION_PENALTY = 1e18 / 4; // Max 25% liquidation penalty / bonus

    // Storage keys
    bytes32 public constant LIQUIDATION_DEADLINE = "LiquidationDeadline";

    uint public liquidationDelay = 2 weeks; // liquidation time delay after address flagged
    uint public liquidationRatio = 1e18 / 2; // collateral ratio when account can be flagged for liquidation
    uint public liquidationPenalty = 1e18 / 10; // 10%

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver, addressesToCache) {}

    /* ========== VIEWS ========== */
    function synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX, "Missing Synthetix address"));
    }

    function synthetixState() internal view returns (ISynthetixState) {
        return ISynthetixState(requireAndGetAddress(CONTRACT_SYNTHETIXSTATE, "Missing SynthetixState address"));
    }

    function issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER, "Missing Issuer address"));
    }

    // refactor to synthetix storage eternal storage contract once that's ready
    function eternalStorageLiquidations() internal view returns (EternalStorage) {
        return
            EternalStorage(
                requireAndGetAddress(CONTRACT_ETERNALSTORAGE_LIQUIDATIONS, "Missing EternalStorageLiquidations address")
            );
    }

    /* ========== VIEWS ========== */
    function isOpenForLiquidation(address account) external view returns (bool) {
        uint ratio = synthetix().collateralisationRatio(account);

        // Liquidation closed if collateral ratio less than or equal target issuance Ratio
        if (ratio <= synthetixState().issuanceRatio()) {
            return false;
        }

        LiquidationEntry memory liquidation = _getLiquidationEntryForAccount(account);

        // only need to check c-ratio is >= liquidationRatio, liquidation cap is checked above
        // check liquidation.deadline is set > 0
        if (ratio >= liquidationRatio && liquidation.deadline > 0 && now.add(liquidationDelay) > liquidation.deadline) {
            return true;
        }

        return false;
    }

    // function _isOpenForLiquidation(address account, uint ) external view returns (bool) {
    //     uint ratio = synthetix().collateralisationRatio(account);

    //     // Liquidation closed if collateral ratio less than or equal target issuance Ratio
    //     if (ratio <= synthetixState().issuanceRatio()) {
    //         return false;
    //     }

    //     LiquidationEntry memory liquidation = _getLiquidationEntryForAccount(account);

    //     // only need to check c-ratio is >= liquidationRatio, liquidation cap is checked above
    //     // check liquidation.deadline is set > 0
    //     if (ratio >= liquidationRatio && liquidation.deadline > 0 && now.add(liquidationDelay) > liquidation.deadline) {
    //         return true;
    //     }

    //     return false;
    // }
    // Add internal viewer for synthetix / issuer contract to check _OpenForLiqudation(collateralRatio)

    // get liquidationEntry for account
    // returns deadline = 0 when not set
    function _getLiquidationEntryForAccount(address account) internal view returns (LiquidationEntry memory _liquidation) {
        _liquidation.deadline = eternalStorageLiquidations().getUIntValue(_getKey(LIQUIDATION_DEADLINE, account));
    }

    function _getKey(bytes32 _scope, address _account) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_scope, _account));
    }

    /* ========== SETTERS ========== */
    function setLiquidationDelay(uint time) external onlyOwner {
        liquidationDelay = time;

        // emit event
        emit LiquidationDelayUpdated(time);
    }

    // Collateral ratio is higher when less collateral backing debt
    // Upper bound is 1.0 (100%)
    function setLiquidationRatio(uint _liquidationRatio) external onlyOwner {
        require(_liquidationRatio < MAX_LIQUIDATION_RATIO, "ratio >= MAX_LIQUIDATION_RATIO");
        liquidationRatio = _liquidationRatio;

        // emit event
        emit LiquidationRatioUpdated(_liquidationRatio);
    }

    function setLiquidationPenalty(uint penalty) external onlyOwner {
        require(penalty < MAX_LIQUIDATION_PENALTY, "penalty >= MAX_LIQUIDATION_PENALTY");
        liquidationPenalty = penalty;

        // emit event
        emit LiquidationPenaltyUpdated(penalty);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */
    function flagAccountForLiquidation(address account) external {
        LiquidationEntry memory liquidation = _getLiquidationEntryForAccount(account);

        // Don't set liquidation if account flagged already
        if (liquidation.deadline > 0) return;

        uint ratio = synthetix().collateralisationRatio(account);

        // if current collateral ratio is greater than or equal to liquidation ratio set liquidation entry
        if (ratio >= liquidationRatio) {
            uint deadline = now.add(liquidationDelay);

            _storeLiquidationEntry(account, deadline);

            // emit event
            emit AccountFlaggedForLiquidation(account, deadline);
        }
    }

    // Internal function to remove account from liquidations
    // Does not check collateral ratio is fixed
    function removeAccountInLiquidation(address account) external onlySynthetixOrIssuer {
        LiquidationEntry memory liquidation = _getLiquidationEntryForAccount(account);
        // Check account has liquidations deadline
        require(liquidation.deadline > 0, "Account has no liquidation set");

        _removeLiquidationEntry(account);
    }

    // Public function to allow an account to remove from liquidations
    // Checks collateral ratio is fixed - below target issuance ratio
    function checkAndRemoveAccountInLiquidation(address account) external {
        LiquidationEntry memory liquidation = _getLiquidationEntryForAccount(account);
        // Check account has liquidations deadline
        require(liquidation.deadline > 0, "Account has no liquidation set");

        uint ratio = synthetix().collateralisationRatio(account);

        // Remove from liquidations if ratio is fixed (less than equal target issuance ratio)
        if (ratio <= synthetixState().issuanceRatio()) {
            _removeLiquidationEntry(account);
        }
    }

    function _storeLiquidationEntry(
        address _account,
        uint _deadline
    ) internal {
        // record liquidation deadline
        eternalStorageLiquidations().setUIntValue(_getKey(LIQUIDATION_DEADLINE, _account), _deadline);
    }

    function _removeLiquidationEntry(address _account) internal {
        // delete liquidation deadline
        eternalStorageLiquidations().deleteUIntValue(_getKey(LIQUIDATION_DEADLINE, _account));

        // emit account removed from liquidations
        emit AccountRemovedFromLiqudation(_account, now);
    }

    /* ========== MODIFIERS ========== */

    modifier onlySynthetix() {
        require(msg.sender == address(synthetix()), "Liquidations: Only the synthetix contract can perform this action");
        _;
    }

    modifier onlySynthetixOrIssuer() {
        bool isSynthetix = msg.sender == address(synthetix());
        bool isIssuer = msg.sender == address(issuer());

        require(isSynthetix || isIssuer, "Liquidation: Only the synthetix or Issuer contract can perform this action");
        _;
    }

    /* ========== EVENTS ========== */

    event AccountFlaggedForLiquidation(address indexed account, uint deadline);
    event AccountRemovedFromLiqudation(address indexed account, uint time);
    event LiquidationDelayUpdated(uint newDelay);
    event LiquidationRatioUpdated(uint newRatio);
    event LiquidationPenaltyUpdated(uint newPenalty);
}
