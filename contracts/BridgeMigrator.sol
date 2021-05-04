pragma solidity ^0.5.16;

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

contract BridgeMigrator {
    IERC20 public snx;

    address public oldBridge;
    address public newBridge;
    address public newEscrow;

    address public pdao;
    address public deployer;

    uint256 public migratedBalance;

    constructor(
        address _newBridge,
        address _newEscrow,
        string memory _network
    ) public {
        newBridge = _newBridge;
        newEscrow = _newEscrow;

        if (keccak256(abi.encodePacked(_network)) == keccak256(abi.encodePacked("mainnet"))) {
            oldBridge = 0x045e507925d2e05D114534D0810a1abD94aca8d6;
            pdao = 0xEb3107117FEAd7de89Cd14D463D340A2E6917769;
            deployer = 0xDe910777C787903F78C89e7a0bf7F4C435cBB1Fe;
            snx = IERC20(0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F);
        } else if (keccak256(abi.encodePacked(_network)) == keccak256(abi.encodePacked("kovan"))) {
            oldBridge = 0xE8Bf8fe5ce9e15D30F478E1647A57CB6B0271228;
            pdao = 0x73570075092502472E4b61A7058Df1A4a1DB12f2;
            deployer = 0x73570075092502472E4b61A7058Df1A4a1DB12f2;
            snx = IERC20(0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F);
        } else {
            revert("Unsupported network");
        }
    }

    // ----------------------------------------
    // PUBLIC
    // ----------------------------------------

    function execute() public {
        require(msg.sender == deployer, "Only deployer may execute");

        _takeOwnership();
        _validateBalancesBefore();
        _provideAllowance();
        _validateStateBefore();

        _migrateSNX();

        _validateStateAfter();
        _validateBalancesAfter();
        _relinquishOwnership();
    }

    function restoreOwnership() public {
        _relinquishOwnership();
    }

    // ----------------------------------------
    // INTERNAL
    // ----------------------------------------

    function _takeOwnership() internal {
        require(IOwned(oldBridge).owner() == pdao, "Unexpected old bridge owner");
        require(IOwned(newEscrow).owner() == deployer, "Unexpected new escrow owner");

        IOwned(oldBridge).acceptOwnership();
        IOwned(newEscrow).acceptOwnership();

        require(IOwned(oldBridge).owner() == address(this), "Unable to take old bridge ownership");
        require(IOwned(newEscrow).owner() == address(this), "Unable to take new escrow ownership");
    }

    function _validateBalancesBefore() internal {
        require(snx.balanceOf(oldBridge) > 1000000 ether, "Unexpected initial old bridge balance");
        require(snx.balanceOf(newEscrow) == 0, "Unexpected initial new escrow balance");

        migratedBalance = snx.balanceOf(oldBridge);
    }

    function _provideAllowance() internal {
        require(snx.allowance(newEscrow, newBridge) == 0, "Unexpected initial new bridge allowance");

        ISynthetixBridgeEscrow(newEscrow).approveBridge(address(snx), newBridge, uint256(-1));
        require(snx.allowance(newEscrow, newBridge) == uint256(-1), "Unexpected final new bridge allowance");
    }

    function _validateStatesBefore() internal {
        require(IOldSynthetixBridgeToOptimism(oldBridge).active == true, "Unexpected initial old bridge state");
    }

    function _migrateSNX() internal {
        IOldSynthetixBridgeToOptimism(oldBridge).migrateBridge(newBridge);
    }

    function _validateStatesAfter() internal {
        require(IOldSynthetixBridgeToOptimism(oldBridge).active == false, "Unexpected final old bridge state");
    }

    function _validateBalancesAfter() internal {
        require(snx.balanceOf(oldBridge) == 0, "Unexpected final old bridge balance");
        require(snx.balanceOf(newEscrow) == migratedBalance, "Unexpected final new escrow balance");
    }

    function _relinquishOwnership() internal {
        IOwned(oldBridge).nominateNewOwner(pdao);
        IOwned(newEscrow).nominateNewOwner(pdao);

        require(IOwned(oldBridge).nominatedOwner() == pdao, "Failed to relinquish old bridge ownership");
        require(IOwned(newEscrow).nominatedOwner() == pdao, "Failed to relinquish new escrow ownership");
    }
}
