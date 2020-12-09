pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

// Inheritance
import "./BaseRewardEscrowV2.sol";


// https://docs.synthetix.io/contracts/RewardEscrow
contract ImportableRewardEscrowV2 is BaseRewardEscrowV2 {
    /* ========== ADDRESS RESOLVER CONFIGURATION ========== */
    bytes32 private constant CONTRACT_SYNTHETIX_BRIDGE_BASE = "SynthetixBridgeToBase";

    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, address _resolver) public BaseRewardEscrowV2(_owner, _resolver) {
        appendToAddressCache(CONTRACT_SYNTHETIX_BRIDGE_BASE);
    }

    /* ========== VIEWS ======================= */

    function synthetixBridgeToBase() internal view returns (address) {
        return requireAndGetAddress(CONTRACT_SYNTHETIX_BRIDGE_BASE, "Resolver is missing SynthetixBridgeToBase address");
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function importVestingEntries(
        address account,
        uint256 escrowedAmount,
        VestingEntries.VestingEntry[] calldata vestingEntries
    ) external onlySynthetixBridge {
        // There must be enough balance in the contract to provide for the escrowed balance.
        totalEscrowedBalance = totalEscrowedBalance.add(escrowedAmount);
        require(
            totalEscrowedBalance <= IERC20(address(synthetix())).balanceOf(address(this)),
            "Insufficient balance in the contract to provide for escrowed balance"
        );

        /* Add escrowedAmount to account's escrowed balance */
        totalEscrowedAccountBalance[account] = totalEscrowedAccountBalance[account].add(escrowedAmount);

        for (uint i = 0; i < vestingEntries.length; i++) {
            _importVestingEntry(account, vestingEntries[i]);
        }
    }

    modifier onlySynthetixBridge() {
        require(msg.sender == synthetixBridgeToBase(), "Can only be invoked by SynthetixBridgeToBase contract");
        _;
    }
}
