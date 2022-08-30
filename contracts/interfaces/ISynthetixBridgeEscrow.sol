pragma solidity >=0.4.24;
pragma experimental ABIEncoderV2;
interface ISynthetixBridgeEscrow {
    function approveBridge(
        address _token,
        address _bridge,
        uint256 _amount
    ) external;
}
