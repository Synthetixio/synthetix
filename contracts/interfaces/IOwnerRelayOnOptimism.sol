pragma solidity >=0.4.24;
pragma experimental ABIEncoderV2;

interface IOwnerRelayOnOptimism {
    function finalizeRelay(address target, bytes calldata payload) external;

    function finalizeRelayBatch(address[] calldata target, bytes[] calldata payloads) external;
}
