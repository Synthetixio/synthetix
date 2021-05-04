pragma solidity >=0.4.24;


interface ISynthetixBridgeEscrow {
    function approveBridge(
        address _token,
        address _bridge,
        uint256 _amount
    ) external;
}
