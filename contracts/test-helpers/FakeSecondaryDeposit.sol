pragma solidity ^0.5.16;

import "../SecondaryDeposit.sol";
import "../interfaces/IIssuer.sol";


contract CrossDomainMessengerMock {
    // mock send message
    function sendMessage(
        address _target,
        bytes calldata _message,
        uint32 _gasLimit
    ) external {}
}


contract FakeSecondaryDeposit is SecondaryDeposit {
    IERC20 public mockSynthetixToken;
    IIssuer public mockIssuer;
    address public crossDomainMessengerMock;

    constructor(
        address _owner,
        address _resolver,
        address _mockSynthetixToken,
        address _mockIssuer
    ) public SecondaryDeposit(_owner, _resolver) {
        mockSynthetixToken = IERC20(_mockSynthetixToken);
        mockIssuer = IIssuer(_mockIssuer);
        crossDomainMessengerMock = address(new CrossDomainMessengerMock());
    }

    // Synthetix is mocked with an ERC20 token passed via the constructor.
    function synthetixERC20() internal view returns (IERC20) {
        return mockSynthetixToken;
    }

    // Issuer mock
    function issuer() internal view returns (IIssuer) {
        return mockIssuer;
    }

    function messenger() internal view returns (ICrossDomainMessenger) {
        return ICrossDomainMessenger(crossDomainMessengerMock);
    }

    function companion() internal view returns (address) {
        return address(0);
    }

    function getMaximumDeposit() internal view returns (uint) {
        return 5000 ether;
    }

    // Easy way to send ETH to the contract. Alternative is to use selfdestruct, but this is easier.
    function ethBackdoor() external payable {}
}
