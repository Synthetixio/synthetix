pragma solidity ^0.5.16;

pragma experimental ABIEncoderV2;

import "./MultiCollateral.sol";
import "./MultiCollateralState.sol";

// This contract handles the payable aspects of eth loans.
contract MultiCollateralEth is MultiCollateral {
    constructor(
        address payable _proxy,
        MultiCollateralState _multiCollateralState,
        address _owner,
        address _resolver,
        bytes32 _collateralKey,
        bytes32[] memory _synthKeys,
        uint _minimumCollateralisation,
        uint _interestRate,
        uint _liquidationPenalty,
        uint _debtCeiling
    ) public 
        MultiCollateral(
        _proxy,
        _multiCollateralState, 
        _owner, 
        _resolver, 
        _collateralKey, 
        _synthKeys, 
        _minimumCollateralisation, 
        _interestRate, 
        _liquidationPenalty, 
        _debtCeiling
        )
    { }

    function openEthLoan(uint256 requestedLoan, bytes32 currency) external payable {

        open(msg.value, requestedLoan, currency, false);

        // we've already got the eth if it works
        // should we still just emit the event in this contract after everything?
    }
    
    function closeEthLoan(uint256 loanId) external {
        uint256 collateral = close(msg.sender, loanId);

        // if we sucessfully closed a cloan, transfer back the collateral
        msg.sender.transfer(collateral);
    }

    function depositEthCollateral(address account, uint loanId) external payable {
        deposit(account, loanId, msg.value);
    }

    function withdrawEthCollateral(uint256 loanId, uint256 withdrawAmount) external {

        // anyone can call this and withdraw collateral. must fix this.

        withdraw(loanId, withdrawAmount);

        // transfer ETH to msg.sender if it worked
        msg.sender.transfer(withdrawAmount);

        // should we emit the event here? since it could still fail on the transfer?
    }

    function repayEthLoan(address account, uint loanId, uint256 amount) external {
        repay(account, msg.sender, loanId, amount);
    }

    function liquidateEthLoan(address borrower, uint loanId, uint amount) external {
        uint256 collateralLiquidated = liquidate(borrower, loanId, amount);

        // Send liquidated ETH collateral to the liquidator
        msg.sender.transfer(collateralLiquidated);

    }
}