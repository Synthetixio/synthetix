pragma solidity ^0.5.16;

import "./MockCrossDomainMessenger.sol";
import "../SynthetixBridgeToOptimism.sol";
import "../interfaces/IIssuer.sol";


contract FakeSynthetixBridgeToOptimism is SynthetixBridgeToOptimism {
    IERC20 public mockSynthetixToken;
    IIssuer public mockIssuer;
    ISynthetix public mintableSynthetix;
    address public crossDomainMessengerMock;
    address public xChainBridge;

    constructor(
        address _owner,
        address _resolver,
        address _mockSynthetixToken,
        address _mockMintableSynthetix,
        address _mockIssuer,
        address _bridge
    ) public SynthetixBridgeToOptimism(_owner, _resolver) {
        mockSynthetixToken = IERC20(_mockSynthetixToken);
        mockIssuer = IIssuer(_mockIssuer);
        mintableSynthetix = ISynthetix(_mockMintableSynthetix);
        xChainBridge = _bridge;
        crossDomainMessengerMock = address(new MockCrossDomainMessenger(_bridge));
    }

    // Synthetix is mocked with an ERC20 token passed via the constructor.
    function synthetixERC20() internal view returns (IERC20) {
        return mockSynthetixToken;
    }

    function synthetix() internal view returns (ISynthetix) {
        return mintableSynthetix;
    }

    // Issuer mock
    function issuer() internal view returns (IIssuer) {
        return mockIssuer;
    }

    function messenger() internal view returns (ICrossDomainMessenger) {
        return ICrossDomainMessenger(crossDomainMessengerMock);
    }

    function synthetixBridgeToBase() internal view returns (address) {
        return xChainBridge;
    }
}
