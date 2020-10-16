pragma solidity ^0.5.16;

import "./CrossDomainMessengerMock.sol";
import "../SecondaryDeposit.sol";
import "../interfaces/IIssuer.sol";



contract FakeSecondaryDeposit is SecondaryDeposit {
    IERC20 public mockSynthetixToken;
    IIssuer public mockIssuer;
    ISynthetix public mintableSynthetix;
    address public crossDomainMessengerMock;
    address public xChainCompanion;

    constructor(
        address _owner,
        address _resolver,
        address _mockSynthetixToken,
        address _mockMintableSynthetix,
        address _mockIssuer,
        address _companion
    ) public SecondaryDeposit(_owner, _resolver) {
        mockSynthetixToken = IERC20(_mockSynthetixToken);
        mockIssuer = IIssuer(_mockIssuer);
        mintableSynthetix = ISynthetix(_mockMintableSynthetix);
        xChainCompanion = _companion;
        crossDomainMessengerMock = address(new CrossDomainMessengerMock(_companion));
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

    function companion() internal view returns (address) {
        return xChainCompanion;
    }

    function getMaximumDeposit() internal view returns (uint) {
        return 5000 ether;
    }
}
