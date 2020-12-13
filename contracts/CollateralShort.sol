pragma solidity ^0.5.16;

pragma experimental ABIEncoderV2;

// Inheritance
import "./Collateral.sol";
import "./interfaces/ICollateral.sol";

// Internal references
import "./CollateralState.sol";

contract CollateralShort is Collateral {
    // The underlying asset for this ERC20 collateral
    address public underlyingContract;

    constructor(
        CollateralState _state,
        address _owner,
        address _manager,
        address _resolver,
        bytes32 _collateralKey,
        bytes32[] memory _synths,
        uint _minCratio,
        uint _minCollateral,
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
        _minCollateral
    )
    {
        underlyingContract = _underlyingContract;
    }

    function openShort(uint collateral, uint amount, bytes32 currency) external returns (uint id)
    {
        require(collateral <= IERC20(underlyingContract).allowance(msg.sender, address(this)), "Allowance not high enough");

        (, uint issued) = openInternal(collateral, amount, currency, true);

        IERC20(underlyingContract).transferFrom(msg.sender, address(this), collateral.sub(issued));
    }

    function close(uint id) external {
        uint collateral = closeInternal(msg.sender, id);

        IERC20(underlyingContract).transfer(msg.sender, collateral);
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
    }

    function draw(uint id, uint amount) external {
        require(amount <= IERC20(underlyingContract).allowance(msg.sender, address(this)), "Allowance not high enough");

        drawInternal(id, amount);

        IERC20(underlyingContract).transferFrom(msg.sender, address(this), amount);
    }

    function liquidate(address borrower, uint id, uint amount) external {
        uint collateralLiquidated = liquidateInternal(borrower, id, amount);

        IERC20(underlyingContract).transfer(msg.sender, collateralLiquidated);
    }

    function accrueInterest(Loan memory loan) internal returns (Loan memory loanAfter) {
        loanAfter = loan;

        // 1. Get the rates we need.
        (uint entryRate, uint lastRate, uint lastUpdated, uint newIndex) = _manager().getShortRatesAndTime(loan.currency, loan.interestIndex);

        // 2. Get the instantaneous rate. i = skew + base rate
        uint instantaneousRate = _manager().getShortRate(address(_synths(currencies[loan.currency])));

        // 3. Get the time since we last updated the rate.
        uint timeDelta = block.timestamp.sub(lastUpdated).mul(SafeDecimalMath.unit());

        // 4. Get the time its been applied for. F
        uint cumulativeRate = instantaneousRate.multiplyDecimal(timeDelta);

        // 5. Get the latest cumulative rate. F_n+1 = F_n + F_last
        uint latestCumulative = lastRate.add(cumulativeRate);

        // 6. If the loan was just opened, don't record any interest. Otherwise multiple by the amount outstanding. Simple interest.
        uint interest = loan.interestIndex == 0 ? 0 : loan.amount.multiplyDecimal(latestCumulative.sub(entryRate));

        // 7. Update rates with the lastest cumulative rate. This also updates the time.
        _manager().updateShortRates(loan.currency, latestCumulative);

        // 8. Update loan
        loanAfter.accruedInterest = loan.accruedInterest.add(interest);
        loanAfter.interestIndex = newIndex;
        state.updateLoan(loanAfter);

        return loanAfter;
    }
}