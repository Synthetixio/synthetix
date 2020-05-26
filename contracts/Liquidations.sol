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
contract Liquidations is Owned, MixinResolver, ILiquidations {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    struct LiquidationEntry {
        bool isFlagged;
        uint deadline;
    }

    bytes32 private constant sUSD = "sUSD";

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_LIQUIDATIONETNERALSTORAGE = "LiquidationEternalStorage";
    bytes32 private constant CONTRACT_SYNTHETIXSTATE = "SynthetixState";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";

    bytes32[24] private addressesToCache = [
        CONTRACT_SYNTHETIX,
        CONTRACT_SYNTHETIXSTATE
    ];

    /* ========== STATE VARIABLES ========== */

    // Storage keys
    bytes32 public constant LIQUIDATION_FLAG = "LiquidationFlag";
    bytes32 public constant LIQUIDATION_DEADLINE = "LiquidationDeadline";

    uint public liquidationDelay = 2 weeks; // liquidation time delay after address flagged
    uint public liquidationRatio = (10 * SafeDecimalMath.unit()) / 15; // collateral ratio when account can be flagged for liquidation
    uint public liquidationPenalty =  SafeDecimalMath.unit() / 10;

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
    function liquidationEternalStorage() internal view returns (EternalStorage) {
        return
            EternalStorage(
                requireAndGetAddress(CONTRACT_LIQUIDATIONETNERALSTORAGE, "Missing LiquidationEternalStorage address")
            );
    }

    /* ========== VIEWS ========== */
    function isOpenForLiquidation(address _account) external view returns (bool) {
        LiquidationEntry memory liquidation = _getLiquidationEntryForAccount(_account);

        uint ratio = synthetix().collateralisationRatio(_account);

        // Liquidation closed if collateral ratio less than or equal target issuance Ratio
        if (ratio <= synthetixState().issuanceRatio()) {
            return false;
        }

        // only need to check c-ratio is >= liquidationRatio, liquidation cap is checked above
        if (ratio >= liquidationRatio && liquidation.isFlagged && now.add(liquidationDelay) > liquidation.deadline) {
            return true;
        }

        return false;
    }

    // get liquidationEntry for account
    // returns is flagged false if not set
    function _getLiquidationEntryForAccount(address account) internal view returns (LiquidationEntry memory _liquidation) {
        _liquidation.isFlagged = liquidationEternalStorage().getBooleanValue(_getKey(LIQUIDATION_FLAG, account));
        _liquidation.deadline = liquidationEternalStorage().getUIntValue(_getKey(LIQUIDATION_DEADLINE, account));
    }

    function _getKey(
        bytes32 _scope,
        address _account
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_scope, _account));
    }

    /* ========== SETTERS ========== */
    function setLiquidationDelay(uint _time) external onlyOwner {
        liquidationDelay = _time;
        // emit event
    }

    function setLiquidationRatio(uint _liquidationRatio) external onlyOwner {
        liquidationRatio = _liquidationRatio;
        // emit event
    }

    function setLiquidationPenalty(uint _penalty) external onlyOwner {
        liquidationPenalty = _penalty;
        // emit event
    }

    /* ========== MUTATIVE FUNCTIONS ========== */
    function flagAccountForLiquidation(address account) external {
        // emit event
    }

    function removeAccountInLiquidation(address account) external onlySynthetixOrIssuer {}

    function checkAndRemoveAccountInLiquidation(address account) external {}

    function _storeLiquidationEntry(address _account, bool _flag) internal {
        // set liquidation flag state
        liquidationEternalStorage().setBooleanValue(_getKey(LIQUIDATION_FLAG, _account), _flag);

        // record liquidation deadline
        liquidationEternalStorage().setUIntValue(_getKey(LIQUIDATION_DEADLINE, _account), now.add(liquidationDelay));
    }

    /* ========== MODIFIERS ========== */

    modifier onlySynthetix() {
        require(msg.sender == address(synthetix()), "Liquidations: Only the synthetix contract can perform this action");
        _;
    }

    modifier onlySynthetixOrIssuer() {
        bool isSynthetix = msg.sender == address(synthetix());
        bool isIssuer = msg.sender == address(issuer());

        require(
            isSynthetix || isIssuer,
            "Liquidation: Only the synthetix or Issuer contract can perform this action"
        );
        _;
    }

    /* ========== EVENTS ========== */

}
