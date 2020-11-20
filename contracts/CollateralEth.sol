pragma solidity ^0.5.16;

pragma experimental ABIEncoderV2;

// Inheritance
import "./Collateral.sol";
import "./interfaces/ICollateral.sol";

// Internal references
import "./CollateralState.sol";

// This contract handles the payable aspects of eth loans.
contract CollateralEth is Collateral, ICollateralEth {

    mapping (address => uint) pendingWithdrawals;

    constructor(
        address payable _proxy,
        CollateralState _state,
        address _owner,
        address _manager,
        address _resolver,
        bytes32 _collateralKey,
        bytes32[] memory _synthKeys,
        uint _minimumCollateralisation,
        uint _interestRate,
        uint _liquidationPenalty
    ) public 
        Collateral(
        _proxy,
        _state, 
        _owner, 
        _manager,
        _resolver, 
        _collateralKey, 
        _synthKeys, 
        _minimumCollateralisation, 
        _interestRate, 
        _liquidationPenalty
        )
    { }

    function open(uint amount, bytes32 currency) external payable {
        openInternal(msg.value, amount, currency);
    }
    
    function close(uint id) external {
        uint256 collateral = closeInternal(msg.sender, id);

        // if we sucessfully closed a cloan, transfer back the collateral
        msg.sender.transfer(collateral);
    }

    function deposit(address borrower, uint id) external payable {
        depositInternal(borrower, id, msg.value);
    }

    function withdraw(uint id, uint withdrawAmount) external {

        // anyone can call this and withdraw collateral. must fix this.

        withdrawInternal(id, withdrawAmount);

        // transfer ETH to msg.sender if it worked
        msg.sender.transfer(withdrawAmount);

        // should we emit the event here? since it could still fail on the transfer?
    }

    function repay(address account, uint id, uint amount) external {
        repayInternal(account, msg.sender, id, amount);
    }

    function liquidate(address borrower, uint id, uint amount) external {
        uint collateralLiquidated = liquidateInternal(borrower, id, amount);

        // Send liquidated ETH collateral to the liquidator
        msg.sender.transfer(collateralLiquidated);

        // emit LoanClosedByLiquidation(msg.sender, collateralLiquidated);

    }
}