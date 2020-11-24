pragma solidity ^0.5.16;

pragma experimental ABIEncoderV2;

// Inheritance
import "./Collateral.sol";
import "./interfaces/ICollateral.sol";

// Internal references
import "./CollateralState.sol";
import "./interfaces/IERC20.sol";

// This contract handles the specific ERC20 implementation details of managing a loan.
contract CollateralErc20 is ICollateralErc20, Collateral {

    // The underlying asset for this ERC20 collateral
    address public underlyingContract;

    constructor(
        CollateralState _state,
        address _owner,
        address _manager,
        address _resolver,
        bytes32 _collateralKey,
        bytes32[] memory _synths,
        uint _collateralisationRatio,
        uint _interestRate,
        uint _liquidationPenalty,
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
        _collateralisationRatio, 
        _interestRate, 
        _liquidationPenalty
        )
    {
        underlyingContract = _underlyingContract;
    }

    function open(uint collateral, uint requestedLoan, bytes32 currency) external {
        require(collateral <= IERC20(underlyingContract).allowance(msg.sender, address(this)), "Allowance not high enough");

        openInternal(collateral, requestedLoan, currency);

        IERC20(underlyingContract).transferFrom(msg.sender, address(this), collateral);
    }

    function close(uint id) external {
        uint collateral = closeInternal(msg.sender, id);

        IERC20(underlyingContract).transfer(msg.sender, collateral);
    }

    function deposit(address borrower, uint  id, uint amount) external {
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

    function liquidate(address borrower, uint id, uint amount) external {
        uint collateralLiquidated = liquidateInternal(borrower, id, amount);

        IERC20(underlyingContract).transfer(msg.sender, collateralLiquidated);
    }
}