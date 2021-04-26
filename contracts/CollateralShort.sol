pragma solidity ^0.5.16;

pragma experimental ABIEncoderV2;

// Inheritance
import "./Collateral.sol";

contract CollateralShort is Collateral {
    constructor(
        CollateralState _state,
        address _owner,
        address _manager,
        address _resolver,
        bytes32 _collateralKey,
        uint _minCratio,
        uint _minCollateral
    ) public Collateral(_state, _owner, _manager, _resolver, _collateralKey, _minCratio, _minCollateral) {}

    function open(
        uint collateral,
        uint amount,
        bytes32 currency
    ) external returns (uint id) {
        // Transfer from will throw if they didn't set the allowance
        IERC20(address(_synthsUSD())).transferFrom(msg.sender, address(this), collateral);

        id = openInternal(collateral, amount, currency, true);
    }

    function close(uint id) external {
        uint collateral = closeInternal(msg.sender, id);

        IERC20(address(_synthsUSD())).transfer(msg.sender, collateral);
    }

    function depositAndDraw(
        uint id,
        uint drawAmount,
        uint depositAmount
    ) external {
        // Transfer from will throw if they didn't set the allowance
        IERC20(address(_synthsUSD())).transferFrom(msg.sender, address(this), depositAmount);

        depositAndDrawInternal(id, drawAmount, depositAmount);
    }

    function repayAndWithdraw(
        uint id,
        uint repayAmount,
        uint withdrawAmount
    ) external {
        repayAndWithdrawInternal(id, repayAmount, withdrawAmount);

        IERC20(address(_synthsUSD())).transfer(msg.sender, withdrawAmount);
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
