pragma solidity ^0.5.16;

pragma experimental ABIEncoderV2;

// Inheritance
import "./Collateral.sol";
import "./interfaces/ICollateral.sol";

// Internal references
import "./CollateralState.sol";
import "./interfaces/IShortingRewards.sol";


contract CollateralShort is Collateral {

    // The underlying asset for this ERC20 collateral
    address public underlyingContract;

    mapping(bytes32 => address) rewardsContracts;

    constructor(
        CollateralState _state,
        address _owner,
        address _manager,
        address _resolver,
        bytes32 _collateralKey,
        bytes32[] memory _synths,
        uint _minCratio,
        uint _minCollateral,
        uint _baseInterestRate,
        address _underlyingContract
    ) 
    public 
    Collateral(
        _state, 
        _owner, 
        _manager,
        _resolver, 
        _collateralKey, 
        _synths, 
        _minCratio,
        _minCollateral,
        _baseInterestRate
    )
    { 
        underlyingContract = _underlyingContract;
    }

    function openShort(uint collateral, uint amount, bytes32 currency) 
        external 
        notPaused 
        CollateralRateNotInvalid 
        returns (uint id) 
    {
        require(collateral <= IERC20(underlyingContract).allowance(msg.sender, address(this)), "Allowance not high enough");

        _systemStatus().requireIssuanceActive();

        // 1. We can only issue certain synths.
        require(currencies[currency] > 0, "Not allowed to issue this synth");

        // Make sure the rate is not invalid.
        require(!_exchangeRates().rateIsInvalid(currency), "Currency rate is invalid");

        // 2. Collateral >= minimum collateral size.
        require(collateral >= minCollateral, "Not enough collateral to create a loan");

        // Max num loans.
        require(state.getNumLoans(msg.sender) < maxLoansPerAccount, "You have reached the maximum number of loans");

        // MAX DEBT.
        bool canIssue = _manager().exceedsDebtLimit(amount, currency);

        require(canIssue, "The debt limit has been reached");

        // 3. Calculate max possible loan from collateral provided
        uint max = maxLoan(collateral, currency);

        // 4. Require requested loan < max loan
        require(amount <= max, "Loan amount exceeds max borrowing power");

        // 5. This fee is denominated in the currency of the loan
        uint issueFee = amount.multiplyDecimalRound(issueFeeRate);

        // 6. Calculate the minting fee and subtract it from the loan amount
        uint loanAmountMinusFee = amount.sub(issueFee);

        // 7. Get a Loan ID
        id = state.incrementTotalLoans();

        // 8. Create the loan struct.
        Loan memory loan = Loan({
            id: id,
            account: msg.sender,
            collateral: collateral, 
            currency: currency,
            amount: amount,
            accruedInterest: 0,
            interestIndex: 0
        });

        // 9. Accrue interest on the loan.
        loan = accrueInterest(loan);

        // 10. Save the loan to storage
        state.createLoan(loan);

        // 11. Pay the minting fees to the fee pool
        _payFees(issueFee, currency); 

        uint sUSDAmount = _exchangeRates().effectiveValue(currency, loanAmountMinusFee, sUSD);

        // 12. Issue synths to the borrower.
        _synthsUSD().issue(msg.sender, sUSDAmount);

        // 13. If there's an incentive program, open a stake.
        if (rewardsContracts[currency] != address(0)) {
            IShortingRewards(rewardsContracts[currency]).stake(msg.sender, amount);
        }

        // 14. Tell the manager about it.
        _manager().incrementShorts(currency, amount);

        IERC20(underlyingContract).transferFrom(msg.sender, address(this), collateral);

        emit ShortCreated(msg.sender, id, amount, collateral, currency);
    }

    function close(uint id) external {
        uint collateral = closeInternal(msg.sender, id);

        IERC20(underlyingContract).transfer(msg.sender, collateral);

        rewardsContracts[currency].exit(borrower, amount);
    }

    function deposit(address borrower, uint id, uint amount) external payable {
        require(amount <= IERC20(underlyingContract).allowance(msg.sender, address(this)), "Allowance not high enough");

        depositInternal(borrower, id, amount);

        IERC20(underlyingContract).transferFrom(msg.sender, address(this), amount);
    }

    function withdraw(uint id, uint amount) external {
        withdrawInternal(id, amount);
        
        IERC20(underlyingContract).transfer(msg.sender, amount);
    }

    function repay(address borrower, uint id, uint amount) external {
        repayInternal(borrower, msg.sender, id, amount);

        rewardsContracts[currency].withdraw(borrower, amount);
    }

    function draw(uint id, uint amount) external {
        drawInternal(id, amount);
    }

    function liquidate(address borrower, uint id, uint amount) external {
        uint collateralLiquidated = liquidateInternal(borrower, id, amount);

        IERC20(underlyingContract).transfer(msg.sender, collateralLiquidated);

        rewardsContracts[currency].withdraw(borrower, amount);
    }

    // Update the cumulative interest rate for the currency that was interacted with.
    function accrueInterest(Loan memory loan) internal returns (Loan memory loanAfter) {
        loanAfter = loan;

        // 1. Get the rates we need.
        (uint entryRate, uint lastRate, uint lastUpdated, uint newIndex) = _manager().getRatesAndTime(loan.interestIndex);

        // 2. Get the instantaneous rate. i = mU + b
        uint instantaneousRate = baseInterestRate.add(_manager().getSkew(loan.currency));

        // 3. Get the time since we last updated the rate.
        uint timeDelta = block.timestamp.sub(lastUpdated).mul(SafeDecimalMath.unit());

        // 4. Get the time its been applied for. F
        uint cumulativeRate = instantaneousRate.multiplyDecimal(timeDelta);

        // 5. Get the latest cumulative rate. F_n+1 = F_n + F_last
        uint latestCumulative = lastRate.add(cumulativeRate);

        // 6. If the loan was just opened, don't record any interest. Otherwise multiple by the amount outstanding. Simple interest.
        uint interest = loan.interestIndex == 0 ? 0 : loan.amount.multiplyDecimal(latestCumulative.sub(entryRate));

        // 7. Update rates with the lastest cumulative rate. This also updates the time.
        _manager().updateShortRates(latestCumulative, loan.currency);

        // 8. Update loan
        loanAfter.accruedInterest = loan.accruedInterest.add(interest);
        loanAfter.interestIndex = newIndex;
        state.updateLoan(loanAfter);

        return loanAfter;
    }

    function addRewardsContract(bytes32 currency, address rewardContract) external onlyOwner {
        rewardsContracts[currency] = rewardContract;
    }

    event ShortCreated(address indexed account, uint id, uint amount, uint collateral, bytes32 currency);
}