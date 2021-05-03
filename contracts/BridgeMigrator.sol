pragma solidity ^0.5.16;

import "./Owned.sol";
import "./interfaces/ISynthetixBridgeToOptimism.sol";
import "./interfaces/ISynthetixBridgeEscrow.sol";
import "./interfaces/IERC20.sol";

interface IOwned {
    function owner() external view returns (address);

    function nominatedOwner() external view returns (address);

    function nominateNewOwner(address _owner) external;

    function acceptOwnership() external;
}

interface IOldSynthetixBridgeToOptimism {
    function migrateBridge(address newBridge) external;
}

contract BridgeMigrator is Owned {
    address public constant oldBridge = 0x045e507925d2e05D114534D0810a1abD94aca8d6;
    address public constant SynthetixProtocolDAO = 0xEb3107117FEAd7de89Cd14D463D340A2E6917769;
    address public constant SynthetixDeployer = 0xDe910777C787903F78C89e7a0bf7F4C435cBB1Fe;
    IERC20 public constant SNX = IERC20(0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F);

    address public newBridge;
    address public newEscrow;

    uint256 public migratedBalance;

    constructor(
        address _owner,
        address _newBridge,
        address _newEscrow
    ) public Owned(_owner) {
        newBridge = _newBridge;
        newEscrow = _newEscrow;
    }

    // ----------------------------------------
    // PUBLIC
    // ----------------------------------------

    function execute() public onlyOwner {
        _takeOwnership();
        _validateBalancesBefore();
        _provideAllowance();
        _migrateSNX();
        _validateBalancesAfter();
        _relinquishOwnership();
    }

    function restoreBridgeOwnership() public {
        _relinquishOwnership();
    }

    // ----------------------------------------
    // INTERNAL
    // ----------------------------------------

    function _migrateSNX() internal {
        IOldSynthetixBridgeToOptimism(oldBridge).migrateBridge(newBridge);
    }

    function _provideAllowance() internal {
        require(SNX.allowance(newEscrow, newBridge) == 0, "Unexpected initial new bridge allowance");

        ISynthetixBridgeEscrow(newEscrow).approveBridge(address(SNX), newBridge, uint256(-1));
        require(SNX.allowance(newEscrow, newBridge) == uint256(-1), "Unexpected initial new bridge allowance");
    }

    function _validateBalancesBefore() internal {
        require(SNX.balanceOf(oldBridge) > 1000000 ether, "Unexpected initial old bridge balance");
        require(SNX.balanceOf(newEscrow) == 0, "Unexpected initial new bridge balance");

        migratedBalance = SNX.balanceOf(oldBridge);
    }

    function _validateBalancesAfter() internal {
        require(SNX.balanceOf(oldBridge) == 0, "Unexpected final old bridge balance");
        require(SNX.balanceOf(newEscrow) == migratedBalance, "Unexpected final new escrow balance");
    }

    function _takeOwnership() internal {
        require(IOwned(oldBridge).owner() == SynthetixProtocolDAO, "Unexpected old bridge owner");
        require(IOwned(newEscrow).owner() == SynthetixDeployer, "Unexpected new escrow owner");

        IOwned(oldBridge).acceptOwnership();
        IOwned(newEscrow).acceptOwnership();

        require(IOwned(oldBridge).owner() == address(this), "Unable to take old bridge ownership");
        require(IOwned(newEscrow).owner() == address(this), "Unable to take new escrow ownership");
    }

    function _relinquishOwnership() internal {
        IOwned(oldBridge).nominateNewOwner(SynthetixDeployer);
        IOwned(newEscrow).nominateNewOwner(SynthetixDeployer);

        require(IOwned(oldBridge).nominatedOwner() == SynthetixDeployer, "Failed to relinquish old bridge ownership");
        require(IOwned(newEscrow).nominatedOwner() == SynthetixDeployer, "Failed to relinquish new escrow ownership");
    }
}
