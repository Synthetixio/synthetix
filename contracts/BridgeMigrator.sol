pragma solidity ^0.5.16;

import "./Owned.sol";
import "./interfaces/ISynthetixBridgeToOptimism.sol";
import "./interfaces/ISynthetixBridgeEscrow.sol";


interface IOldSynthetixBridgeToOptimism {
    function migrateBridge(address newBridge) external;
    function nominateNewOwner(address _owner) external;


contract BridgeMigrator is Owned {
    IOldSynthetixBridgeToOptimism public constant oldBridge = 0x045e507925d2e05D114534D0810a1abD94aca8d6;
    ISynthetixBridgeToOptimism public newBridge;
    ISynthetixBridgeEscrow public newEscrow;

    constructor(address _owner, ISynthetixBridgeToOptimism _newBridge, ISynthetixBridgeEscrow _newEscrow) public Owned(_owner) {
        newBridge = _newBridge;
        newEscrow = _newEscrow;

        // TODO: Staticcalls to validate interfaces without changing state?
    }

    function execute() public onlyOwner {
        // Ensure is owner of old bridge
        // Ensure is owner of new escrow
        // Provide allowance to new bridge
        // Validate allowance of new bridge
        // Call old bridge migrate function to new escrow
        // Verify balance of escrow

        // Relinquish ownership
        oldBridge.nominateNewOwner();
    }

    function restoreBridgeOwnership() public onlyOwner {
        // Restore old bridge ownership
    }


}
