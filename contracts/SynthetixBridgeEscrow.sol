pragma solidity ^0.5.16;

// Inheritance
import "./Owned.sol";

contract SynthetixBridgeEscrow is Owned, MixinResolver {
    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 internal constant CONTRACT_SYNTHETIX = "Synthetix";

    constructor(address _owner, address _resolver) public Owned(_owner) MixinResolver(_resolver) {}

    /* ========== VIEW FUNCTIONS ========== */

    function synthetixERC20() internal view returns (IERC20) {
        return IERC20(requireAndGetAddress(CONTRACT_SYNTHETIX));
    }

    function resolverAddressesRequired() public view returns (bytes32[] memory addresses) {
        addresses = new bytes32[](1);
        addresses[0] = CONTRACT_SYNTHETIX;
    }

    function approveBridge(address _bridge, uitn256 _amount) external onlyOwner {
        synthetixERC20().approve(_bridge, _amount);
        emit Approval(msg.sender, _bridge, _amount);
    }

    /* ========== EVENTS ========== */
    event Approval(address indexed owner, address indexed spender, uint value);
}
