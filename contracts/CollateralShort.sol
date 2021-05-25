pragma solidity ^0.5.16;

pragma experimental ABIEncoderV2;

// Inheritance
import "./Collateral.sol";

contract CollateralShort is Collateral {
    function open(
        uint collateral,
        uint amount,
        bytes32 currency
    ) external returns (uint id) {
        // Transfer from will throw if they didn't set the allowance
        IERC20(address(_synthsUSD())).transferFrom(msg.sender, address(this), collateral);

        id = openInternal(collateral, amount, currency, true);
    }

    function close(uint id) external returns (uint amount, uint collateral) {
        (amount, collateral) = closeInternal(msg.sender, id);

        IERC20(address(_synthsUSD())).transfer(msg.sender, collateral);
    }

    function deposit(
        address borrower,
        uint id,
        uint amount
    ) external returns (uint short, uint collateral) {
        require(amount <= IERC20(address(_synthsUSD())).allowance(msg.sender, address(this)), "Allowance not high enough");

        IERC20(address(_synthsUSD())).transferFrom(msg.sender, address(this), amount);

        (short, collateral) = depositInternal(borrower, id, amount);
    }

    function withdraw(uint id, uint amount) external returns (uint short, uint collateral) {
        (short, collateral) = withdrawInternal(id, amount);

        IERC20(address(_synthsUSD())).transfer(msg.sender, amount);
    }

    function repay(
        address borrower,
        uint id,
        uint amount
    ) external returns (uint short, uint collateral) {
        (short, collateral) = repayInternal(borrower, msg.sender, id, amount);
    }

    function draw(uint id, uint amount) external returns (uint short, uint collateral) {
        (short, collateral) = drawInternal(id, amount);
    }

    function liquidate(
        address borrower,
        uint id,
        uint amount
    ) external {
        uint collateralLiquidated = liquidateInternal(borrower, id, amount);

        IERC20(address(_synthsUSD())).transfer(msg.sender, collateralLiquidated);
    }

    function getReward(bytes32 currency, address account) external {
        if (shortingRewards[currency] != address(0)) {
            IShortingRewards(shortingRewards[currency]).getReward(account);
        }
    }
}
