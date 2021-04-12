pragma solidity ^0.5.16;

pragma experimental ABIEncoderV2;

// Inheritance
import "./Collateral.sol";

// Internal references
import "./CollateralState.sol";

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
    ) external {
        require(
            collateral <= IERC20(address(_synthsUSD())).allowance(msg.sender, address(this)),
            "Allowance not high enough"
        );

        openInternal(collateral, amount, currency, true);

        IERC20(address(_synthsUSD())).transferFrom(msg.sender, address(this), collateral);
    }

    function close(uint id) external {
        uint collateral = closeInternal(msg.sender, id);

        IERC20(address(_synthsUSD())).transfer(msg.sender, collateral);
    }

    function deposit(
        address borrower,
        uint id,
        uint amount
    ) external {
        require(amount <= IERC20(address(_synthsUSD())).allowance(msg.sender, address(this)), "Allowance not high enough");

        IERC20(address(_synthsUSD())).transferFrom(msg.sender, address(this), amount);

        depositInternal(borrower, id, amount);
    }

    function withdraw(uint id, uint amount) external {
        uint withdrawnAmount = withdrawInternal(id, amount);

        IERC20(address(_synthsUSD())).transfer(msg.sender, withdrawnAmount);
    }

    function repay(
        address borrower,
        uint id,
        uint amount
    ) external {
        repayInternal(borrower, msg.sender, id, amount);
    }

    function draw(uint id, uint amount) external {
        drawInternal(id, amount);
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
