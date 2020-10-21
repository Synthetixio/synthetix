pragma solidity ^0.5.16;

import "./MockCrossDomainMessenger.sol";
import "../SynthetixL2ToL1Bridge.sol";


contract FakeSynthetixL2ToL1Bridge is SynthetixL2ToL1Bridge {
    ISynthetix public mintableSynthetix;
    address public crossDomainMessengerMock;
    address public xChainBridge;

    constructor(
        address _owner,
        address _resolver,
        address _mockMintableSynthetix,
        address _bridge
    ) public SynthetixL2ToL1Bridge(_owner, _resolver) {
        mintableSynthetix = ISynthetix(_mockMintableSynthetix);
        xChainBridge = _bridge;
        crossDomainMessengerMock = address(new MockCrossDomainMessenger(_bridge));
    }

    function synthetix() internal view returns (ISynthetix) {
        return mintableSynthetix;
    }

    function messenger() internal view returns (ICrossDomainMessenger) {
        return ICrossDomainMessenger(crossDomainMessengerMock);
    }

    function synthetixBridge() internal view returns (address) {
        return xChainBridge;
    }
}
