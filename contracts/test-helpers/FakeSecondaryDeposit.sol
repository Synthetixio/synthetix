pragma solidity ^0.5.16;

import "../SecondaryDeposit.sol";
import "../interfaces/IIssuer.sol";


contract FakeSecondaryDeposit is SecondaryDeposit {
    IERC20 public _mockSynthetixToken;
    IIssuer public _mockIssuer;

    constructor(
        address owner,
        address resolver,
        address mockSynthetixToken,
        address mockIssuer
    ) public SecondaryDeposit(owner, resolver) {
        _mockSynthetixToken = IERC20(mockSynthetixToken);
        _mockIssuer = IIssuer(mockIssuer);
    }

    // Synthetix is mocked with an ERC20 token passed via the constructor.
    function synthetixERC20() internal view returns (IERC20) {
        return IERC20(_mockSynthetixToken);
    }

    // Issuer mock
    function issuer() internal view returns (IIssuer) {
        return IIssuer(_mockIssuer);
    }

    // Easy way to send ETH to the contract. Alternative is to use selfdestruct, but this is easier.
    function ethBackdoor() external payable {}
}
