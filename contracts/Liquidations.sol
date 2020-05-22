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

// https://docs.synthetix.io/contracts/Liquidations
contract Liquidations is Owned, MixinResolver, ILiquidations {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    struct LiquidationEntry {
        bool isFlagged;
        uint timestamp;
    }

    bytes32 private constant sUSD = "sUSD";

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_LIQUIDATIONETNERALSTORAGE = "LiquidationEternalStorage";

    bytes32[24] private addressesToCache = [
        CONTRACT_SYNTHETIX
    ];

    /* ========== STATE VARIABLES ========== */
    EternalStorage public eternalStorage;

    // Storage keys
    bytes32 public constant LIQUIDATION_FLAG = "LiquidationFlag";
    bytes32 public constant LIQUIDATION_TIMESTAMP = "LiquidationTimestamp";

    uint public liquidationDelay = 2 weeks; // liquidation time delay after address flagged
    uint public liquidationRatio = (10 * SafeDecimalMath.unit()) / 15; // collateral ratio when account can be flagged for liquidation
    uint public liquidationTargetRatio = (1 * SafeDecimalMath.unit()) / 3; // collateral ratio liquidations capped at

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver, addressesToCache) {}

    /* ========== VIEWS ========== */
    function synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX, "Missing Synthetix address"));
    }

    // refactor to synthetix storage eternal storage contract once that's ready
    function liquidationEternalStorage() internal view returns (IssuanceEternalStorage) {
        return
            EternalStorage(
                requireAndGetAddress(CONTRACT_LIQUIDATIONETNERALSTORAGE, "Missing LiquidationEternalStorage address")
            );
    }

    /* ========== VIEWS ========== */
    function isOpenForLiquidation(address _account) external view returns (bool) {
        LiquidationEntry memory liquidation = _getLiquidationForAccount(_account);

        uint ratio = synthetix().collateralisationRatio(account);

        // Liquidation closed if collateral ratio less than equal liquidation target cap
        if (ratio <= liquidationTargetRatio) {
            return false;
        }

        // only need to check c-ratio is >= liquidationRatio, liquidation cap is checked above
        if (ratio >= liquidationRatio && liquidation.isFlagged && liquidation.timestamp.add(liquidationDelay) > now) {
            return true;
        }

        return false;
    }

    function _getLiquidationForAccount(address account) internal view returns (LiquidationEntry memory _liquidation) {
        _liquidation.isFlagged = liquidationEternalStorage().getBooleanValue(_getKey(LIQUIDATION_FLAG, account));
        _liquidation.timestamp = liquidationEternalStorage().getUIntValue(_getKey(LIQUIDATION_TIMESTAMP, account));
    }

    function lastIssueEvent(address account) public view returns (uint) {
        //  Get the timestamp of the last issue this account made
        return issuanceEternalStorage().getUIntValue(keccak256(abi.encodePacked(LAST_ISSUE_EVENT, account)));
    }

    function _getKey(
        bytes32 _scope,
        address _account
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_scope, _account));
    }

    /* ========== SETTERS ========== */

    function setMinimumStakeTime(uint _seconds) external onlyOwner {
        // Set the min stake time on locking synthetix
        require(_seconds <= MAX_MINIMUM_STAKING_TIME, "stake time exceed maximum 1 week");
        minimumStakeTime = _seconds;
        emit MinimumStakeTimeUpdated(minimumStakeTime);
    }

    function setLiquidationDelay(uint _time) external onlyOwner {
        liquidationDelay = _time;
        // emit event
    };

    function setLiquidationRatio(uint _liquidationRatio) external onlyOwner {
        liquidationRatio = _liquidationRatio;
        // emit event
    };

    function setLiquidationTargetRatio(uint target) external;

    /* ========== MUTATIVE FUNCTIONS ========== */
    function _setLastIssueEvent(address account) internal {
        // Set the timestamp of the last issueSynths
        issuanceEternalStorage().setUIntValue(keccak256(abi.encodePacked(LAST_ISSUE_EVENT, account)), block.timestamp);
    }

    function flagAccountForLiquidation(address account) external {};

    function removeAccountInLiquidation(address account) external {};

    function checkAndRemoveAccountInLiquidation(address account) external {};

    /* ========== MODIFIERS ========== */

    modifier onlySynthetix() {
        require(msg.sender == address(synthetix()), "Issuer: Only the synthetix contract can perform this action");
        _;
    }

    /* ========== EVENTS ========== */

    event MinimumStakeTimeUpdated(uint minimumStakeTime);
}
