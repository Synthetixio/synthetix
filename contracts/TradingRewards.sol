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

        if (!period.isClaimable) {
            return 0;
        }

        if (period.availableRewards == 0 || period.recordedFees == 0) {
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
        Period storage period = _periods[_currentPeriodID];
        require(period.isClaimable, "Period is not claimable");

        uint amountToClaim = _calculateRewards(account, periodID);
        require(amountToClaim > 0, "No rewards available");

        period.claimedRewardsForAccount[account] = period.claimedRewardsForAccount[account].add(amountToClaim);
        period.availableRewards = period.availableRewards.sub(amountToClaim);

        _balanceLockedForRewards = _balanceLockedForRewards.sub(amountToClaim);

        _rewardsToken.safeTransfer(account, amountToClaim);

        emit RewardsClaimed(account, amountToClaim, periodID);
    }

    // Rejects ETH sent directly
    function () external {}

    /* ========== RESTRICTED FUNCTIONS ========== */

    // TODO: Implement onlyX modifier (onlyExchanger?)
    // TODO: Should use notPaused here?
    function recordExchangeFeeForAccount(uint amount, address account) external {
        Period storage period = _periods[_currentPeriodID];

        period.recordedFeesForAccount[account] = period.recordedFeesForAccount[account].add(amount);
        period.recordedFees = period.recordedFees.add(amount);

        emit ExchangeFeeRecorded(account, amount, _currentPeriodID);
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

        _currentPeriodID = _currentPeriodID.add(1);

        emit NewPeriodStarted(_currentPeriodID);
    }

    // Note: Contract does not accept ETH, but still could receive via selfdestruct.
    function recoverEther(address recoverAddress) external onlyOwner {
        require(recoverAddress != address(0), "Invalid recover address");

        uint amount = address(this).balance;
        msg.sender.transfer(amount);

        emit EtherRecovered(recoverAddress, amount);
    }

    function recoverTokens(address recoverAddress, address tokenAddress, uint amount) external onlyOwner {
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

    event ExchangeFeeRecorded(address indexed account, uint amount, uint periodID);
    event RewardsClaimed(address indexed account, uint amount, uint periodID);
    event NewPeriodStarted(uint periodID);
    event PeriodClosedWithRewards(uint periodID, uint rewards);
    event TokensRecovered(address recoverAddress, address tokenAddress, uint amount);
    event EtherRecovered(address recoverAddress, uint amount);
    event FreeRewardTokensRecovered(address recoverAddress, uint amount);
    event LockedRewardTokensRecovered(address recoverAddress, uint periodID, uint amount);
}
