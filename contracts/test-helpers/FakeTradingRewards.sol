pragma solidity ^0.5.16;

import "../TradingRewards.sol";

import "openzeppelin-solidity-2.3.0/contracts/token/ERC20/ERC20Detailed.sol";

import "../interfaces/IExchanger.sol";


contract FakeTradingRewards is TradingRewards {
    IERC20 public _mockSynthetixToken;

    constructor(
        address owner,
        address periodController,
        address resolver,
        address mockSynthetixToken
    )
        public
        TradingRewards(owner, periodController, resolver)
    {
        _mockSynthetixToken = IERC20(mockSynthetixToken);
    }

    // Synthetix is mocked with an ERC20 token passed via the constructor.
    function synthetix() internal view returns (IERC20) {
        return IERC20(_mockSynthetixToken);
    }

    // Return msg.sender so that onlyExchanger modifier can be bypassed.
    function exchanger() internal view returns (IExchanger) {
        return IExchanger(msg.sender);
    }

    // Easy way to send ETH to the contract. Alternative is to use selfdestruct, but this is easier.
    function ethBackdoor() external payable {}
}
