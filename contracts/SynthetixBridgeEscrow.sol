pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";

// External references.
import "openzeppelin-solidity-2.3.0/contracts/token/ERC20/SafeERC20.sol";

contract SynthetixBridgeEscrow is Owned {
    using SafeERC20 for IERC20;

    constructor(address _owner) public Owned(_owner) {}

    function approveBridge(
        address _token,
        address _bridge,
        uint256 _amount
    ) external onlyOwner {
        IERC20(_token).safeApprove(_bridge, _amount);
        emit BridgeApproval(_token, _bridge, _amount);
    }

    /* ========== EVENTS ========== */
    event BridgeApproval(address _token, address indexed spender, uint value);
}
