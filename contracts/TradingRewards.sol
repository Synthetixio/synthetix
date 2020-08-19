pragma solidity ^0.5.16;

// Internal dependencies.
import "./Pausable.sol";
import "./MixinResolver.sol";
import "./Owned.sol";

// External dependencies.
import "openzeppelin-solidity-2.3.0/contracts/token/ERC20/ERC20Detailed.sol";
import "openzeppelin-solidity-2.3.0/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity-2.3.0/contracts/utils/ReentrancyGuard.sol";

// Libraries.
import "./SafeDecimalMath.sol";

// Internal references.
import "./interfaces/ITradingRewards.sol";
import "./interfaces/IExchanger.sol";


contract TradingRewards is ITradingRewards, ReentrancyGuard, Owned, Pausable, MixinResolver {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using SafeERC20 for IERC20;

    /* ========== STATE VARIABLES ========== */

    uint private _currentPeriodID;
    uint private _balanceLockedForRewards;
    mapping(uint => Period) private _periods;

    struct Period {
        bool isFinalized;
        uint recordedFees;
        uint totalRewards;
        uint availableRewards;
        mapping(address => uint) unaccountedFeesForAccount;
    }

    address private _periodController;

    IERC20 private _rewardsToken;

    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */

    bytes32 private constant CONTRACT_EXCHANGER = "Exchanger";

    bytes32[24] private _addressesToCache = [CONTRACT_EXCHANGER];

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address owner,
        address rewardsToken,
        address periodController,
        address resolver
    ) public Owned(owner) MixinResolver(resolver, _addressesToCache) {
        require(rewardsToken != address(0), "Invalid rewards token");
        require(periodController != address(0), "Invalid period controller");

        _rewardsToken = IERC20(rewardsToken);
        _periodController = periodController;
    }

    /* ========== VIEWS ========== */

    function exchanger() internal view returns (IExchanger) {
        return IExchanger(requireAndGetAddress(CONTRACT_EXCHANGER, "Missing Exchanger address"));
    }

    function getAvailableRewards() external view returns (uint) {
        return _balanceLockedForRewards;
    }

    function getRewardsToken() external view returns (address) {
        return address(_rewardsToken);
    }

    function getPeriodController() external view returns (address) {
        return _periodController;
    }

    function getCurrentPeriod() external view returns (uint) {
        return _currentPeriodID;
    }

    function getPeriodIsClaimable(uint periodID) external view returns (bool) {
        return _periods[periodID].isFinalized;
    }

    function getPeriodIsFinalized(uint periodID) external view returns (bool) {
        return _periods[periodID].isFinalized;
    }

    function getPeriodRecordedFees(uint periodID) external view returns (uint) {
        return _periods[periodID].recordedFees;
    }

    function getPeriodTotalRewards(uint periodID) external view returns (uint) {
        return _periods[periodID].totalRewards;
    }

    function getPeriodAvailableRewards(uint periodID) external view returns (uint) {
        return _periods[periodID].availableRewards;
    }

    function getUnaccountedFeesForAccountForPeriod(address account, uint periodID) external view returns (uint) {
        return _periods[periodID].unaccountedFeesForAccount[account];
    }

    function getAvailableRewardsForAccountForPeriod(address account, uint periodID) external view returns (uint) {
        return _calculateRewards(account, periodID);
    }

    function getAvailableRewardsForAccountForPeriods(address account, uint[] calldata periodIDs)
        external
        view
        returns (uint totalRewards)
    {
        for (uint i = 0; i < periodIDs.length; i++) {
            uint periodID = periodIDs[i];

            totalRewards = totalRewards.add(_calculateRewards(account, periodID));
        }
    }

    function _calculateRewards(address account, uint periodID) internal view returns (uint) {
        Period storage period = _periods[periodID];

        if (!period.isFinalized) {
            return 0;
        }

        if (period.availableRewards == 0 || period.recordedFees == 0) {
            return 0;
        }

        uint accountFees = period.unaccountedFeesForAccount[account];

        if (accountFees == 0) {
            return 0;
        }

        uint participationRatio = accountFees.divideDecimal(period.recordedFees);
        return participationRatio.multiplyDecimal(period.totalRewards);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function claimRewardsForPeriod(uint periodID) external nonReentrant notPaused {
        _claimRewards(msg.sender, periodID);
    }

    function claimRewardsForPeriods(uint[] calldata periodIDs) external nonReentrant notPaused {
        for (uint i = 0; i < periodIDs.length; i++) {
            uint periodID = periodIDs[i];

            // Will revert if any independent claim reverts.
            _claimRewards(msg.sender, periodID);
        }
    }

    function _claimRewards(address account, uint periodID) internal {
        Period storage period = _periods[periodID];
        require(period.isFinalized, "Period is not finalized");

        uint amountToClaim = _calculateRewards(account, periodID);
        require(amountToClaim > 0, "No rewards available");

        period.unaccountedFeesForAccount[account] = 0;
        period.availableRewards = period.availableRewards.sub(amountToClaim);

        _balanceLockedForRewards = _balanceLockedForRewards.sub(amountToClaim);

        _rewardsToken.safeTransfer(account, amountToClaim);

        emit RewardsClaimed(account, amountToClaim, periodID);
    }

    // Rejects ETH sent directly
    // solhint-disable-next-line
    function() external {}

    /* ========== RESTRICTED FUNCTIONS ========== */

    function recordExchangeFeeForAccount(uint usdFeeAmount, address account) external onlyExchanger {
        Period storage period = _periods[_currentPeriodID];
        // Note: In theory, the current period will never be finalized.
        // Such a require could be added here, but it would just spend gas, since it should always satisfied.

        period.unaccountedFeesForAccount[account] = period.unaccountedFeesForAccount[account].add(usdFeeAmount);
        period.recordedFees = period.recordedFees.add(usdFeeAmount);

        emit ExchangeFeeRecorded(account, usdFeeAmount, _currentPeriodID);
    }

    function closeCurrentPeriodWithRewards(uint rewards) external onlyPeriodController {
        uint currentBalance = _rewardsToken.balanceOf(address(this));
        uint availableForNewRewards = currentBalance.sub(_balanceLockedForRewards);
        require(rewards <= availableForNewRewards, "Insufficient free rewards");

        Period storage period = _periods[_currentPeriodID];

        period.totalRewards = rewards;
        period.availableRewards = rewards;
        period.isFinalized = true;

        _balanceLockedForRewards = _balanceLockedForRewards.add(rewards);

        emit PeriodFinalizedWithRewards(_currentPeriodID, rewards);

        _currentPeriodID = _currentPeriodID.add(1);

        emit NewPeriodStarted(_currentPeriodID);
    }

    // Note: Contract does not accept ETH, but still could receive via selfdestruct.
    function recoverEther(address payable recoverAddress) external onlyOwner {
        require(recoverAddress != address(0), "Invalid recover address");

        uint amount = address(this).balance;
        recoverAddress.transfer(amount);

        emit EtherRecovered(recoverAddress, amount);
    }

    function recoverTokens(
        address recoverAddress,
        address tokenAddress,
        uint amount
    ) external onlyOwner {
        require(recoverAddress != address(0), "Invalid recover address");
        require(tokenAddress != address(_rewardsToken), "Must use other function");

        IERC20 token = IERC20(tokenAddress);

        uint tokenBalance = token.balanceOf(address(this));
        require(tokenBalance > 0, "No tokens to recover");

        token.safeTransfer(recoverAddress, amount);

        emit TokensRecovered(recoverAddress, tokenAddress, amount);
    }

    function recoverFreeRewardTokens(address recoverAddress, uint amount) external onlyOwner {
        require(recoverAddress != address(0), "Invalid recover address");

        uint currentBalance = _rewardsToken.balanceOf(address(this));
        require(currentBalance > 0, "No tokens to recover");

        uint freeFromRewards = currentBalance.sub(_balanceLockedForRewards);
        require(amount <= freeFromRewards, "Insufficient free rewards");

        _rewardsToken.safeTransfer(recoverAddress, amount);

        emit FreeRewardTokensRecovered(recoverAddress, amount);
    }

    // Warning: calling this on a period will effectively disable it.
    function recoverAllLockedRewardTokensFromPeriod(address recoverAddress, uint periodID) external onlyOwner {
        require(recoverAddress != address(0), "Invalid recover address");
        require(periodID < _currentPeriodID, "Cannot recover from active");

        Period storage period = _periods[periodID];
        require(period.availableRewards > 0, "No rewards available to recover");

        uint amount = period.availableRewards;
        _rewardsToken.safeTransfer(recoverAddress, amount);

        _balanceLockedForRewards = _balanceLockedForRewards.sub(amount);

        // Could only set isClaimable to false, but
        // clearing up everything saves some gas.
        delete _periods[periodID];

        emit LockedRewardTokensRecovered(recoverAddress, periodID, amount);
    }

    function setPeriodController(address newPeriodController) external onlyOwner {
        require(newPeriodController != address(0), "Invalid period controller");

        _periodController = newPeriodController;
    }

    /* ========== MODIFIERS ========== */

    modifier onlyPeriodController() {
        require(msg.sender == _periodController, "Caller not period controller");
        _;
    }

    modifier onlyExchanger() {
        require(msg.sender == address(exchanger()), "Only Exchanger can invoke this");
        _;
    }

    /* ========== EVENTS ========== */

    event ExchangeFeeRecorded(address indexed account, uint amount, uint periodID);
    event RewardsClaimed(address indexed account, uint amount, uint periodID);
    event NewPeriodStarted(uint periodID);
    event PeriodFinalizedWithRewards(uint periodID, uint rewards);
    event TokensRecovered(address recoverAddress, address tokenAddress, uint amount);
    event EtherRecovered(address recoverAddress, uint amount);
    event FreeRewardTokensRecovered(address recoverAddress, uint amount);
    event LockedRewardTokensRecovered(address recoverAddress, uint periodID, uint amount);
}
