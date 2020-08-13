pragma solidity ^0.5.16;

// Internal dependencies.
import "./Pausable.sol";

// External dependencies.
import "openzeppelin-solidity-2.3.0/contracts/token/ERC20/ERC20Detailed.sol";
import "openzeppelin-solidity-2.3.0/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity-2.3.0/contracts/utils/ReentrancyGuard.sol";

// Libraries.
import "./SafeDecimalMath.sol";

// Internal references.
import "./interfaces/ITradingRewards.sol";


contract TradingRewards is ITradingRewards, ReentrancyGuard, Pausable {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using SafeERC20 for IERC20;

    /* ========== STATE VARIABLES ========== */

    uint private _currentPeriodID;
    uint private _balanceLockedForRewards;
    mapping(uint => Period) private _periods;

    struct Period {
        bool isClaimable;
        uint recordedFees;
        uint totalRewards;
        uint availableRewards;
        mapping(address => uint) recordedFeesForAccount;
        mapping(address => uint) claimedRewardsForAccount; // TODO: Needed? a bool could be enough
    }

    address private _rewardsDistribution;

    IERC20 private _rewardsToken;

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address owner,
        address rewardsToken,
        address rewardsDistribution
    ) public Owned(owner) {
        require(rewardsToken != address(0), "Invalid rewards token");
        require(rewardsDistribution != address(0), "Invalid rewards distribution");

        _rewardsToken = IERC20(rewardsToken);
        _rewardsDistribution = rewardsDistribution;
    }

    /* ========== VIEWS ========== */

    function getAvailableRewards() external view returns (uint) {
        return _balanceLockedForRewards;
    }

    function getRewardsToken() external view returns (address) {
        return address(_rewardsToken);
    }

    function getRewardsDistribution() external view returns (address) {
        return _rewardsDistribution;
    }

    function getCurrentPeriod() external view returns (uint) {
        return _currentPeriodID;
    }

    function getPeriodIsClaimable(uint periodID) external view returns (bool) {
        return _periods[periodID].isClaimable;
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

    function getRecordedFeesForAccountForPeriod(address account, uint periodID) external view returns (uint) {
        return _periods[periodID].recordedFeesForAccount[account];
    }

    function getClaimedRewardsForAccountForPeriod(address account, uint periodID) external view returns (uint) {
        return _periods[periodID].claimedRewardsForAccount[account];
    }

    function getAvailableRewardsForAccountForPeriod(address account, uint periodID) external view returns (uint) {
        return _calculateAvailableRewardsForAccountForPeriod(account, periodID);
    }

    function getAvailableRewardsForAccountForPeriods(address account, uint[] calldata periodIDs)
        external
        view
        returns (uint totalRewards)
    {
        for (uint i = 0; i < periodIDs.length; i++) {
            uint periodID = periodIDs[i];

            totalRewards = totalRewards.add(_calculateAvailableRewardsForAccountForPeriod(account, periodID));
        }
    }

    function _calculateAvailableRewardsForAccountForPeriod(address account, uint periodID) internal view returns (uint) {
        Period storage period = _periods[periodID];

        if (!period.isClaimable || period.availableRewards == 0) {
            return 0;
        }

        uint accountFees = period.recordedFeesForAccount[account];

        if (accountFees == 0) {
            return 0;
        }

        uint participationRatio = accountFees.divideDecimal(period.recordedFees);
        uint maxRewards = participationRatio.multiplyDecimal(period.totalRewards);

        uint alreadyClaimed = period.claimedRewardsForAccount[account];
        return maxRewards.sub(alreadyClaimed);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function claimRewardsForPeriod(uint periodID) external nonReentrant {
        _claimRewardsForAccountForPeriod(msg.sender, periodID);
    }

    function claimRewardsForPeriods(uint[] calldata periodIDs) external nonReentrant {
        for (uint i = 0; i < periodIDs.length; i++) {
            uint periodID = periodIDs[i];

            // TODO: don't fail the whole thing if one fails
            _claimRewardsForAccountForPeriod(msg.sender, periodID);
        }
    }

    function _claimRewardsForAccountForPeriod(address account, uint periodID) internal {
        Period storage period = _periods[_currentPeriodID];
        require(period.isClaimable, "Period is not claimable");

        uint amountToClaim = _calculateAvailableRewardsForAccountForPeriod(account, periodID);
        require(amountToClaim > 0, "No rewards available");

        period.claimedRewardsForAccount[account] = period.claimedRewardsForAccount[account].add(amountToClaim);
        period.availableRewards = period.availableRewards.sub(amountToClaim);

        _balanceLockedForRewards = _balanceLockedForRewards.sub(amountToClaim);

        _rewardsToken.safeTransfer(account, amountToClaim);

        emit RewardsClaimed(amountToClaim, account, periodID);
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    // TODO: Implement onlyX modifier (onlyExchanger?)
    function recordExchangeFeeForAccount(uint amount, address account) external {
        Period storage period = _periods[_currentPeriodID];

        period.recordedFeesForAccount[account] = period.recordedFeesForAccount[account].add(amount);
        period.recordedFees = period.recordedFees.add(amount);

        emit ExchangeFeeRecorded(amount, account, _currentPeriodID);
    }

    function closeCurrentPeriodWithRewards(uint rewards) external onlyRewardsDistribution {
        uint currentBalance = _rewardsToken.balanceOf(address(this));
        uint availableForNewRewards = currentBalance.sub(_balanceLockedForRewards);
        require(rewards <= availableForNewRewards, "Insufficient free rewards");

        Period storage period = _periods[_currentPeriodID];

        period.totalRewards = rewards;
        period.availableRewards = rewards;
        period.isClaimable = true;

        _balanceLockedForRewards = _balanceLockedForRewards.add(rewards);

        emit PeriodClosedWithRewards(_currentPeriodID, rewards);

        _startNewPeriod();
    }

    function _startNewPeriod() internal {
        _currentPeriodID = _currentPeriodID.add(1);

        emit NewPeriodStarted(_currentPeriodID);
    }

    function recoverTokens(address tokenAddress, uint amount) external onlyOwner {
        require(tokenAddress != address(_rewardsToken), "Must use recoverRewardsTokens");

        IERC20(tokenAddress).safeTransfer(msg.sender, amount);

        emit TokensRecovered(tokenAddress, amount);
    }

    function recoverRewardsTokens(uint amount) external onlyOwner {
        uint currentBalance = _rewardsToken.balanceOf(address(this));
        uint freeFromRewards = currentBalance.sub(_balanceLockedForRewards);
        require(amount <= freeFromRewards, "Insufficient free rewards");

        _rewardsToken.safeTransfer(msg.sender, amount);

        emit RewardTokensRecovered(amount);
    }

    function setRewardsDistribution(address newRewardsDistribution) external onlyOwner {
        require(newRewardsDistribution != address(0), "Invalid rewards distribution");

        _rewardsDistribution = newRewardsDistribution;
    }

    /* ========== MODIFIERS ========== */

    modifier onlyRewardsDistribution() {
        require(msg.sender == _rewardsDistribution, "Caller not RewardsDistribution");
        _;
    }

    /* ========== EVENTS ========== */

    event ExchangeFeeRecorded(uint amount, address account, uint periodID);
    event RewardsClaimed(uint amount, address account, uint periodID);
    event NewPeriodStarted(uint periodID);
    event PeriodClosedWithRewards(uint periodID, uint rewards);
    event TokensRecovered(address tokenAddress, uint amount);
    event RewardTokensRecovered(uint amount);
}
