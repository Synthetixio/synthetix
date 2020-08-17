pragma solidity ^0.5.16;

import "../TradingRewards.sol";
import "../interfaces/IExchanger.sol";


contract MockTradingRewards is TradingRewards {
    constructor(
        address owner,
        address rewardsToken,
        address periodController,
        address resolver
    )
        public
        TradingRewards(owner, rewardsToken, periodController, resolver)
    {}

    // Disable requirement of msg.sender == Exchanger for unit testing
    modifier onlyExchanger() {
        _;
    }
}
