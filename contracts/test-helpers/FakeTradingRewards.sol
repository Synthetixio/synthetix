pragma solidity ^0.8.8;

import "../TradingRewards.sol";

import "../interfaces/IExchanger.sol";

contract FakeTradingRewards is TradingRewards {
    IERC20 public _mockSynthetixToken;

    constructor(
        address owner,
        address periodController,
        address resolver,
        address mockSynthetixToken
    ) TradingRewards(owner, periodController, resolver) {
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
}
