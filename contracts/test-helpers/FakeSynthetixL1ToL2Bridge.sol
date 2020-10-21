pragma solidity ^0.5.16;

import "./MockCrossDomainMessenger.sol";
import "../SynthetixL1ToL2Bridge.sol";
import "../interfaces/IIssuer.sol";


contract FakeSynthetixL1ToL2Bridge is SynthetixL1ToL2Bridge {
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
    ) public SynthetixL1ToL2Bridge(_owner, _resolver) {
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

    function synthetixBridge() internal view returns (address) {
        return xChainBridge;
    }

    function getMaximumDeposit() internal view returns (uint) {
        return 5000 ether;
    }
}
