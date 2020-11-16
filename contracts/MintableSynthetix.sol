pragma solidity ^0.5.16;

// Inheritance
import "./Synthetix.sol";


// https://docs.synthetix.io/contracts/source/contracts/mintablesynthetix
contract MintableSynthetix is Synthetix {
    bytes32 private constant CONTRACT_SYNTHETIX_BRIDGE = "SynthetixBridgeToBase";

    constructor(
        address payable _proxy,
        TokenState _tokenState,
        address _owner,
        uint _totalSupply,
        address _resolver
    ) public Synthetix(_proxy, _tokenState, _owner, _totalSupply, _resolver) {
        appendToAddressCache(CONTRACT_SYNTHETIX_BRIDGE);
    }

    /* ========== INTERNALS =================== */

    function _mintSecondary(address account, uint amount) internal {
        tokenState.setBalanceOf(account, tokenState.balanceOf(account).add(amount));
        emitTransfer(address(this), account, amount);
        totalSupply = totalSupply.add(amount);
    }

    function onlyAllowFromBridge() internal view {
        require(msg.sender == synthetixBridge(), "Can only be invoked by the SynthetixBridgeToBase contract");
    }

    /* ========== MODIFIERS =================== */

    modifier onlyBridge() {
        onlyAllowFromBridge();
        _;
    }

    /* ========== VIEWS ======================= */

    function synthetixBridge() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_SYNTHETIX_BRIDGE, "Resolver is missing SynthetixBridgeToBase address");
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function mintSecondary(address account, uint amount) external onlyBridge {
        _mintSecondary(account, amount);
    }

    function mintSecondaryRewards(uint amount) external onlyBridge {
        IRewardsDistribution _rewardsDistribution = rewardsDistribution();
        _mintSecondary(address(_rewardsDistribution), amount);
        _rewardsDistribution.distributeRewards(amount);
    }

    function burnSecondary(address account, uint amount) external onlyBridge {
        tokenState.setBalanceOf(account, tokenState.balanceOf(account).sub(amount));
        emitTransfer(account, address(0), amount);
        totalSupply = totalSupply.sub(amount);
    }
}
