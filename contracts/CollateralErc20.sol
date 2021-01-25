pragma solidity ^0.5.16;

pragma experimental ABIEncoderV2;

// Inheritance
import "./Collateral.sol";
import "./interfaces/ICollateralErc20.sol";

// Internal references
import "./CollateralState.sol";
import "./interfaces/IERC20.sol";


// This contract handles the specific ERC20 implementation details of managing a loan.
contract CollateralErc20 is ICollateralErc20, Collateral {
    // The underlying asset for this ERC20 collateral
    address public underlyingContract;

    uint public underlyingContractDecimals;

    constructor(
        address _state,
        address _owner,
        address _manager,
        address _resolver,
        bytes32 _collateralKey,
        uint _minCratio,
        uint _minCollateral,
        address _underlyingContract,
        uint _underlyingDecimals
    ) public Collateral(_state, _owner, _manager, _resolver, _collateralKey, _minCratio, _minCollateral) {
        underlyingContract = _underlyingContract;

        underlyingContractDecimals = _underlyingDecimals;
    }

    function open(
        uint collateral,
        uint amount,
        bytes32 currency
    ) external {
        require(collateral <= IERC20(underlyingContract).allowance(msg.sender, address(this)), "Allowance not high enough");

        // only transfer the actual collateral
        IERC20(underlyingContract).transferFrom(msg.sender, address(this), collateral);

        // scale up before entering the system.
        uint scaledCollateral = scaleUpCollateral(collateral);

        openInternal(scaledCollateral, amount, currency, false);
    }

    function close(uint id) external {
        uint collateral = closeInternal(msg.sender, id);

        // scale down before transferring back.
        uint scaledCollateral = scaleDownCollateral(collateral);

        IERC20(underlyingContract).transfer(msg.sender, scaledCollateral);
    }

    function deposit(
        address borrower,
        uint id,
        uint amount
    ) external {
        require(amount <= IERC20(underlyingContract).allowance(msg.sender, address(this)), "Allowance not high enough");

        IERC20(underlyingContract).transferFrom(msg.sender, address(this), amount);

        // scale up before entering the system.
        uint scaledAmount = scaleUpCollateral(amount);

        depositInternal(borrower, id, scaledAmount);
    }

    function withdraw(uint id, uint amount) external {
        // scale up before entering the system.
        uint scaledAmount = scaleUpCollateral(amount);

        uint withdrawnAmount = withdrawInternal(id, scaledAmount);

        // scale down before transferring back.
        uint scaledWithdraw = scaleDownCollateral(withdrawnAmount);

        IERC20(underlyingContract).transfer(msg.sender, scaledWithdraw);
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

        // scale down before transferring back.
        uint scaledCollateral = scaleDownCollateral(collateralLiquidated);

        IERC20(underlyingContract).transfer(msg.sender, scaledCollateral);
    }

    function scaleUpCollateral(uint collateral) public view returns (uint scaledUp) {
        uint conversionFactor = 10**uint(SafeMath.sub(18, underlyingContractDecimals));

        scaledUp = uint(uint(collateral).mul(conversionFactor));
    }

    function scaleDownCollateral(uint collateral) public view returns (uint scaledDown) {
        uint conversionFactor = 10**uint(SafeMath.sub(18, underlyingContractDecimals));

        scaledDown = collateral.div(conversionFactor);
    }
}
