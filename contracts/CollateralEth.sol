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
        ICollateralManager _manager,
        address _resolver,
        bytes32 _collateralKey,
        uint _minCratio,
        uint _minCollateral
    ) public Collateral(_owner, _manager, _resolver, _collateralKey, _minCratio, _minCollateral) {}

    function open(
        uint collateral,
        uint amount,
        bytes32 currency
    ) external payable returns (uint id) {
        // Transfer from will throw if they didn't set the allowance
        IERC20(address(_synthsUSD())).transferFrom(msg.sender, address(this), collateral);

        id = openInternal(msg.value, amount, currency, false);
    }

    function close(uint id) external returns (uint amount, uint collateral) {
        (amount, collateral) = closeInternal(msg.sender, id);

        pendingWithdrawals[msg.sender] = pendingWithdrawals[msg.sender].add(collateral);
    }

    function deposit(
        address borrower,
        uint id,
        uint amount
    ) external payable returns (uint principal, uint collateral) {
        // Transfer from will throw if they didn't set the allowance
        require(amount <= IERC20(address(_synthsUSD())).allowance(msg.sender, address(this)), "Allowance not high enough");

        (principal, collateral) = depositInternal(borrower, id, msg.value);
    }

    function withdraw(uint id, uint amount) external returns (uint principal, uint collateral) {
        (principal, collateral) = withdrawInternal(id, amount);

        pendingWithdrawals[msg.sender] = pendingWithdrawals[msg.sender].add(amount);
    }

    function repay(
        address borrower,
        uint id,
        uint amount
    ) external returns (uint principal, uint collateral) {
        (principal, collateral) = repayInternal(borrower, msg.sender, id, amount);
    }

    function draw(uint id, uint amount) external returns (uint principal, uint collateral) {
        (principal, collateral) = drawInternal(id, amount);
    }

    function liquidate(
        address borrower,
        uint id,
        uint amount
    ) external {
        uint collateralLiquidated = liquidateInternal(borrower, id, amount);

        pendingWithdrawals[msg.sender] = pendingWithdrawals[msg.sender].add(collateralLiquidated);
    }

    function claim(uint amount) external nonReentrant {
        // If they try to withdraw more than their total balance, it will fail on the safe sub.
        pendingWithdrawals[msg.sender] = pendingWithdrawals[msg.sender].sub(amount);

        // solhint-disable avoid-low-level-calls
        (bool success, ) = msg.sender.call.value(amount)("");
        require(success, "Transfer failed");
    }
}
