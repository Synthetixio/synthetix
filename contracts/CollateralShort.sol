pragma solidity ^0.5.16;

pragma experimental ABIEncoderV2;

// Inheritance
import "./CollateralErc20.sol";
import "./interfaces/ICollateralErc20.sol";

// Internal references
import "./CollateralState.sol";

contract CollateralShort is CollateralErc20 {
    constructor(
        CollateralState _state,
        address _owner,
        address _manager,
        address _resolver,
        bytes32 _collateralKey,
        bytes32[] memory _synths,
        uint _minCratio,
        uint _minCollateral,
        address _underlyingContract
    )
    public
    CollateralErc20(
        _state,
        _owner,
        _manager,
        _resolver,
        _collateralKey,
        _synths,
        _minCratio,
        _minCollateral,
        _underlyingContract
    )
    {}

    function open(uint collateral, uint amount, bytes32 currency) external {
        require(collateral <= IERC20(underlyingContract).allowance(msg.sender, address(this)), "Allowance not high enough");

        (, uint issued) = openInternal(collateral, amount, currency, true);

        // Since they are coming back to the currency they deposited
        // we only need to transfer the difference.
        IERC20(underlyingContract).transferFrom(msg.sender, address(this), collateral.sub(issued));
    }

    function draw(uint id, uint amount) external {
        uint issued = drawInternal(id, amount);

        IERC20(underlyingContract).transfer(msg.sender, issued);
    }
}
