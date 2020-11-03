pragma solidity ^0.5.16;

pragma experimental ABIEncoderV2;


import "./MultiCollateral.sol";
import "./MultiCollateralState.sol";

import "./interfaces/IERC20.sol";


// This contract handles the specific ERC20 implementation details of managing a loan.
contract MultiCollateralErc20 is MultiCollateral {

    // The underlying asset for this ERC20 collateral
    // E.g the renBTC contract address
    address public underlyingContract;


    constructor(
        address payable _proxy,
        MultiCollateralState _multiCollateralState,
        address _owner,
        address _resolver,
        bytes32 _collateralKey,
        bytes32[] memory _synthKeys,
        uint _collateralisationRatio,
        uint _interestRate,
        uint _liquidationPenalty,
        uint _debtCeiling,
        address _underlyingContract
    ) 
    public 
    MultiCollateral(
        _proxy,
        _multiCollateralState, 
        _owner, 
        _resolver, 
        _collateralKey, 
        _synthKeys, 
        _collateralisationRatio, 
        _interestRate, 
        _liquidationPenalty, 
        _debtCeiling
        )
    {
        underlyingContract = _underlyingContract;
    }

    function openErc20Loan(uint collateral, uint256 requestedLoan, bytes32 currency, bool short) external {
        // check allowance before we proceed for the erc20 collateral.
        require(collateral <= IERC20(underlyingContract).allowance(msg.sender, address(this)), "Allowance not high enough");

        open(collateral, requestedLoan, currency, short);

        // if we sucessfully create a loan, transfer the collateral to us.
        IERC20(underlyingContract).transferFrom(msg.sender, address(this), collateral);
    }

    function closeErc20Loan(uint256 loanId) external {

        uint256 collateral = close(msg.sender, loanId);

        // if we sucessfully closed a cloan, transfer back the collateral.
        IERC20(underlyingContract).transfer(msg.sender, collateral);
    }

    function depositErc20Collateral(address borrower, uint  loanId, uint256 amount) external {
        // check allowance before we proceed for the erc20 collateral.
        require(amount <= IERC20(underlyingContract).allowance(msg.sender, address(this)), "Allowance not high enough");

        deposit(borrower, loanId, amount);

        IERC20(underlyingContract).transferFrom(msg.sender, address(this), amount);
    }

    function withdrawErc20Collateral(uint loanId, uint256 amount) external {
        withdraw(loanId, amount);
        
        IERC20(underlyingContract).transfer(msg.sender, amount);
    }

    function repayErc20Loan(address borrower, uint loanId, uint256 amount) external {
        repay(borrower, msg.sender, loanId, amount);
    }

    function liquidateErc20Loan(address borrower, uint loanId, uint amount) external {
        uint256 collateralLiquidated = liquidate(borrower, loanId, amount);

        // Send liquidated Erc20 collateral to the liquidator
        IERC20(underlyingContract).transfer(msg.sender, collateralLiquidated);

    }
}