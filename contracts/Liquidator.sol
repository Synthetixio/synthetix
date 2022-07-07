pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./MixinSystemSettings.sol";
import "./interfaces/ILiquidator.sol";

// Libraries
import "./SafeDecimalMath.sol";

// Internal references
import "./interfaces/IERC20.sol";
import "./interfaces/ISynthetix.sol";
import "./interfaces/IExchangeRates.sol";
import "./interfaces/IIssuer.sol";
import "./interfaces/ISystemStatus.sol";

/// @title Upgrade Liquidation Mechanism V2 (SIP-148)
/// @notice This contract is a modification to the existing liquidation mechanism defined in SIP-15
contract Liquidator is Owned, MixinSystemSettings, ILiquidator {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    struct LiquidationEntry {
        uint deadline;
        address caller;
    }

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_SYSTEMSTATUS = "SystemStatus";
    bytes32 private constant CONTRACT_SYNTHETIX = "Synthetix";
    bytes32 private constant CONTRACT_ISSUER = "Issuer";
    bytes32 private constant CONTRACT_EXRATES = "ExchangeRates";

    /* ========== CONSTANTS ========== */

    bytes32 public constant CONTRACT_NAME = "Liquidator";

    // Storage keys
    bytes32 public constant LIQUIDATION_DEADLINE = "LiquidationDeadline";
    bytes32 public constant LIQUIDATION_CALLER = "LiquidationCaller";

    constructor(address _owner, address _resolver) public Owned(_owner) MixinSystemSettings(_resolver) {}

    /* ========== VIEWS ========== */
    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = MixinSystemSettings.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](4);
        newAddresses[0] = CONTRACT_SYSTEMSTATUS;
        newAddresses[1] = CONTRACT_SYNTHETIX;
        newAddresses[2] = CONTRACT_ISSUER;
        newAddresses[3] = CONTRACT_EXRATES;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    function synthetix() internal view returns (ISynthetix) {
        return ISynthetix(requireAndGetAddress(CONTRACT_SYNTHETIX));
    }

    function systemStatus() internal view returns (ISystemStatus) {
        return ISystemStatus(requireAndGetAddress(CONTRACT_SYSTEMSTATUS));
    }

    function issuer() internal view returns (IIssuer) {
        return IIssuer(requireAndGetAddress(CONTRACT_ISSUER));
    }

    function exchangeRates() internal view returns (IExchangeRates) {
        return IExchangeRates(requireAndGetAddress(CONTRACT_EXRATES));
    }

    function issuanceRatio() external view returns (uint) {
        return getIssuanceRatio();
    }

    function liquidationDelay() external view returns (uint) {
        return getLiquidationDelay();
    }

    function liquidationRatio() external view returns (uint) {
        return getLiquidationRatio();
    }

    function liquidationEscrowDuration() external view returns (uint) {
        return getLiquidationEscrowDuration();
    }

    function liquidationPenalty() external view returns (uint) {
        return getLiquidationPenalty();
    }

    function selfLiquidationPenalty() external view returns (uint) {
        return getSelfLiquidationPenalty();
    }

    function liquidateReward() external view returns (uint) {
        return getLiquidateReward();
    }

    function flagReward() external view returns (uint) {
        return getFlagReward();
    }

    function liquidationCollateralRatio() external view returns (uint) {
        return SafeDecimalMath.unit().divideDecimalRound(getLiquidationRatio());
    }

    function getLiquidationDeadlineForAccount(address account) external view returns (uint) {
        LiquidationEntry memory liquidation = _getLiquidationEntryForAccount(account);
        return liquidation.deadline;
    }

    function getLiquidationCallerForAccount(address account) external view returns (address) {
        LiquidationEntry memory liquidation = _getLiquidationEntryForAccount(account);
        return liquidation.caller;
    }

    /// @notice Determines if an account is eligible for forced or self liquidation
    /// @dev An account is eligible to self liquidate if its c-ratio is below the target c-ratio
    /// @dev An account with no SNX collateral will not be open for liquidation since the ratio is 0
    function isLiquidationOpen(address account, bool isSelfLiquidation) external view returns (bool) {
        uint accountCollateralisationRatio = synthetix().collateralisationRatio(account);

        // Not open for liquidation if collateral ratio is less than or equal to target issuance ratio
        if (accountCollateralisationRatio <= getIssuanceRatio()) {
            return false;
        }

        if (!isSelfLiquidation) {
            LiquidationEntry memory liquidation = _getLiquidationEntryForAccount(account);

            // Open for liquidation if the deadline has passed and the user has enough SNX collateral.
            if (_deadlinePassed(liquidation.deadline) && _hasEnoughSNX(account)) {
                return true;
            }
            return false;
        }
        return true;
    }

    function isLiquidationDeadlinePassed(address account) external view returns (bool) {
        LiquidationEntry memory liquidation = _getLiquidationEntryForAccount(account);
        return _deadlinePassed(liquidation.deadline);
    }

    function _deadlinePassed(uint deadline) internal view returns (bool) {
        // check deadline is set > 0
        // check now > deadline
        return deadline > 0 && now > deadline;
    }

    /// @notice Checks if an account has enough SNX balance to be considered open for forced liquidation.
    function _hasEnoughSNX(address account) internal view returns (bool) {
        uint balance = IERC20(address(synthetix())).balanceOf(account);
        return balance > (getLiquidateReward().add(getFlagReward()));
    }

    /**
     * r = target issuance ratio
     * D = debt balance
     * V = Collateral
     * P = liquidation penalty
     * Calculates amount of synths = (D - V * r) / (1 - (1 + P) * r)
     */
    function calculateAmountToFixCollateral(
        uint debtBalance,
        uint collateral,
        uint penalty
    ) external view returns (uint) {
        uint ratio = getIssuanceRatio();
        uint unit = SafeDecimalMath.unit();

        uint dividend = debtBalance.sub(collateral.multiplyDecimal(ratio));
        uint divisor = unit.sub(unit.add(penalty).multiplyDecimal(ratio));

        return dividend.divideDecimal(divisor);
    }

    // get liquidationEntry for account
    // returns deadline = 0 when not set
    function _getLiquidationEntryForAccount(address account) internal view returns (LiquidationEntry memory _liquidation) {
        _liquidation.deadline = flexibleStorage().getUIntValue(CONTRACT_NAME, _getKey(LIQUIDATION_DEADLINE, account));

        // This is used to reward the caller for flagging an account for liquidation.
        _liquidation.caller = flexibleStorage().getAddressValue(CONTRACT_NAME, _getKey(LIQUIDATION_CALLER, account));
    }

    function _getKey(bytes32 _scope, address _account) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_scope, _account));
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    // totalIssuedSynths checks synths for staleness
    // check snx rate is not stale
    function flagAccountForLiquidation(address account) external rateNotInvalid("SNX") {
        systemStatus().requireSystemActive();

        require(getLiquidationRatio() > 0, "Liquidation ratio not set");
        require(getLiquidationDelay() > 0, "Liquidation delay not set");

        LiquidationEntry memory liquidation = _getLiquidationEntryForAccount(account);
        require(liquidation.deadline == 0, "Account already flagged for liquidation");

        uint accountsCollateralisationRatio = synthetix().collateralisationRatio(account);

        // if accounts issuance ratio is greater than or equal to liquidation ratio set liquidation entry
        require(
            accountsCollateralisationRatio >= getLiquidationRatio(),
            "Account issuance ratio is less than liquidation ratio"
        );

        uint deadline = now.add(getLiquidationDelay());

        _storeLiquidationEntry(account, deadline, msg.sender);

        emit AccountFlaggedForLiquidation(account, deadline);
    }

    /// @notice This function is called by the Issuer to remove an account's liquidation entry
    /// @dev The Issuer must check if the account's c-ratio is fixed before removing
    function removeAccountInLiquidation(address account) external onlyIssuer {
        LiquidationEntry memory liquidation = _getLiquidationEntryForAccount(account);
        if (liquidation.deadline > 0) {
            _removeLiquidationEntry(account);
        }
    }

    /// @notice External function to allow anyone to remove an account's liquidation entry
    /// @dev This function checks if the account's c-ratio is OK and that the rate of SNX is not stale
    function checkAndRemoveAccountInLiquidation(address account) external rateNotInvalid("SNX") {
        systemStatus().requireSystemActive();

        LiquidationEntry memory liquidation = _getLiquidationEntryForAccount(account);

        require(liquidation.deadline > 0, "Account has no liquidation set");

        uint accountsCollateralisationRatio = synthetix().collateralisationRatio(account);

        // Remove from liquidator if accountsCollateralisationRatio is fixed (less than equal target issuance ratio)
        if (accountsCollateralisationRatio <= getIssuanceRatio()) {
            _removeLiquidationEntry(account);
        }
    }

    function _storeLiquidationEntry(
        address _account,
        uint _deadline,
        address _caller
    ) internal {
        // record liquidation deadline and caller
        flexibleStorage().setUIntValue(CONTRACT_NAME, _getKey(LIQUIDATION_DEADLINE, _account), _deadline);

        flexibleStorage().setAddressValue(CONTRACT_NAME, _getKey(LIQUIDATION_CALLER, _account), _caller);
    }

    /// @notice Only delete the deadline value, keep caller for flag reward payout
    function _removeLiquidationEntry(address _account) internal {
        flexibleStorage().deleteUIntValue(CONTRACT_NAME, _getKey(LIQUIDATION_DEADLINE, _account));

        emit AccountRemovedFromLiquidation(_account, now);
    }

    /* ========== MODIFIERS ========== */
    modifier onlyIssuer() {
        require(msg.sender == address(issuer()), "Liquidator: Only the Issuer contract can perform this action");
        _;
    }

    modifier rateNotInvalid(bytes32 currencyKey) {
        require(!exchangeRates().rateIsInvalid(currencyKey), "Rate invalid or not a synth");
        _;
    }

    /* ========== EVENTS ========== */

    event AccountFlaggedForLiquidation(address indexed account, uint deadline);
    event AccountRemovedFromLiquidation(address indexed account, uint time);
}
