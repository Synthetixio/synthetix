pragma solidity ^0.5.16;

import "../SecondaryDeposit.sol";
import "../interfaces/IIssuer.sol";


contract CrossDomainMessengerMock {
    address public xDomainMsgSender;

    constructor(address _xDomainMsgSender) public {
        xDomainMsgSender = _xDomainMsgSender;
    }

    // mock xDomainMessageSender()
    function xDomainMessageSender() external view returns (address) {
        return xDomainMsgSender;
    }

    // mock sendMessage()
    function sendMessage(
        address _target,
        bytes calldata _message,
        uint32 _gasLimit
    ) external {}
}


contract FakeSecondaryDeposit is SecondaryDeposit {
    IERC20 public mockSynthetixToken;
    IIssuer public mockIssuer;
    ISynthetix public mintableSynthetix;
    address public crossDomainMessengerMock;
    address public xChaincompanion;

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
        xChaincompanion = _companion;
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
        return xChaincompanion;
    }

    function getMaximumDeposit() internal view returns (uint) {
        return 5000 ether;
    }

    // Easy way to send ETH to the contract. Alternative is to use selfdestruct, but this is easier.
    function ethBackdoor() external payable {}
}
