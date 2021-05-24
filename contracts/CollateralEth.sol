pragma solidity ^0.5.16;

pragma experimental ABIEncoderV2;

// Inheritance
import "./Collateral.sol";
import "openzeppelin-solidity-2.3.0/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/ICollateralEth.sol";

// This contract handles the payable aspects of eth loans.
contract CollateralEth is Collateral, ICollateralEth, ReentrancyGuard {
    mapping(address => uint) public pendingWithdrawals;

    constructor(
        address _owner,
        address _manager,
        address _resolver,
        bytes32 _collateralKey,
        uint _minCratio,
        uint _minCollateral
    ) public Collateral(_owner, _resolver) {
        initialize(_manager, _collateralKey, _minCratio, _minCollateral);
    }

    // function open(uint amount, bytes32 currency) external payable {
    //     openInternal(msg.value, amount, currency, false);
    // }

    // function close(uint id) external {
    //     uint collateral = closeInternal(msg.sender, id);

    //     pendingWithdrawals[msg.sender] = pendingWithdrawals[msg.sender].add(collateral);
    // }

    // function deposit(address borrower, uint id) external payable {
    //     depositInternal(borrower, id, msg.value);
    // }

    // function withdraw(uint id, uint withdrawAmount) external {
    //     uint amount = withdrawInternal(id, withdrawAmount);

    //     pendingWithdrawals[msg.sender] = pendingWithdrawals[msg.sender].add(amount);
    // }

    // function repay(
    //     address account,
    //     uint id,
    //     uint amount
    // ) external {
    //     repayInternal(account, msg.sender, id, amount);
    // }

    // function draw(uint id, uint amount) external {
    //     drawInternal(id, amount);
    // }

    // function liquidate(
    //     address borrower,
    //     uint id,
    //     uint amount
    // ) external {
    //     uint collateralLiquidated = liquidateInternal(borrower, id, amount);

    //     pendingWithdrawals[msg.sender] = pendingWithdrawals[msg.sender].add(collateralLiquidated);
    // }

    // function claim(uint amount) external nonReentrant {
    //     // If they try to withdraw more than their total balance, it will fail on the safe sub.
    //     pendingWithdrawals[msg.sender] = pendingWithdrawals[msg.sender].sub(amount);

    //     (bool success, ) = msg.sender.call.value(amount)("");
    //     require(success, "Transfer failed");
    // }
}
