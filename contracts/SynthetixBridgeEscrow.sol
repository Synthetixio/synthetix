pragma solidity ^0.8.4;

// Inheritance
import "./Owned.sol";
import "./MixinResolver.sol";
import "./interfaces/ISynthetixBridgeEscrow.sol";

// External references.
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract SynthetixBridgeEscrow is Owned, ISynthetixBridgeEscrow {
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
