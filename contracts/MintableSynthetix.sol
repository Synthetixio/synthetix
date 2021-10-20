pragma solidity ^0.8.9;

// Inheritance
import "./BaseSynthetix.sol";

// https://docs.synthetix.io/contracts/source/contracts/mintablesynthetix
contract MintableSynthetix is BaseSynthetix {
    using SafeMath for uint;

    bytes32 private constant CONTRACT_SYNTHETIX_BRIDGE = "SynthetixBridgeToBase";

    constructor(
        address payable _proxy,
        TokenState _tokenState,
        address _owner,
        uint _totalSupply,
        address _resolver
    ) BaseSynthetix(_proxy, _tokenState, _owner, _totalSupply, _resolver) {}

    /* ========== INTERNALS =================== */
    function _mintSecondary(address account, uint amount) internal {
        tokenState.setBalanceOf(account, tokenState.balanceOf(account).add(amount));
        emitTransfer(address(this), account, amount);
        totalSupply = totalSupply.add(amount);
    }

    function onlyAllowFromBridge() internal view {
        require(msg.sender == synthetixBridge(), "Can only be invoked by bridge");
    }

    /* ========== MODIFIERS =================== */

    modifier onlyBridge() {
        onlyAllowFromBridge();
        _;
    }

    /* ========== VIEWS ======================= */
    function resolverAddressesRequired() public view override returns (bytes32[] memory addresses) {
        bytes32[] memory existingAddresses = BaseSynthetix.resolverAddressesRequired();
        bytes32[] memory newAddresses = new bytes32[](1);
        newAddresses[0] = CONTRACT_SYNTHETIX_BRIDGE;
        addresses = combineArrays(existingAddresses, newAddresses);
    }

    function synthetixBridge() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_SYNTHETIX_BRIDGE);
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function mintSecondary(address account, uint amount) external override onlyBridge {
        _mintSecondary(account, amount);
    }

    function mintSecondaryRewards(uint amount) external override onlyBridge {
        IRewardsDistribution _rewardsDistribution = rewardsDistribution();
        _mintSecondary(address(_rewardsDistribution), amount);
        _rewardsDistribution.distributeRewards(amount);
    }

    function burnSecondary(address account, uint amount) external override onlyBridge systemActive {
        tokenState.setBalanceOf(account, tokenState.balanceOf(account).sub(amount));
        emitTransfer(account, address(0), amount);
        totalSupply = totalSupply.sub(amount);
    }
}
