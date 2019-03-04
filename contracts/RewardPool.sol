/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       RewardPool.sol
version:    1.3
author:     Jackson Chan
            Clinton Ennis

date:       2019-03-01

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

The rewardPool contract holds the inflationary supply minted from
synthetix until each user claims / withdraws their share of synthetix.

Calculation of the calcMaxWithdraw() will be based on:

90% allocation to for staking SNX and maintaining c-ratio
10% Reservation for future incentive mechanisms to be plugged in
i.e decentralized oracle.

-----------------------------------------------------------------
*/

pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./SafeDecimalMath.sol";
import "./SelfDestructible.sol";
import "./Synthetix.sol";
import "./RewardEscrow.sol";

contract RewardPool is SelfDestructible {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    Synthetix public synthetix;
    RewardEscrow public escrow;
    address public incentivesPool;
    // Set a incentive Allocator who can move balance in rewardPool for incentives around

    // Set a state for amount allocated to users for claiming
    // Set a state for amount allocated to incentives
    constructor(address _owner, Synthetix _synthetix, RewardEscrow _rewardEscrow)
        SelfDestructible(_owner)
        public
    {
        synthetix = _synthetix;
        escrow = _rewardEscrow;
    }

    function setIncentivesPoolAddress(address _incentivesPool)
        external
        onlyOwner
    {
        incentivesPool = _incentivesPool;
        // emit some update event
    }
}
