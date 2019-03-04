/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       InflationarySupply.sol
version:    1.0
author:     Jackson Chan
            Clinton Ennis
date:       2019-03-01

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

Inflationary Supply contract. SNX is a transferable ERC20 token,
and also give its holders the following privileges.



-----------------------------------------------------------------
*/
pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./SafeDecimalMath.sol";
import "./Owned.sol";

/**
 * @title Any function decorated with the modifier this contract provides
 * deactivates after a specified setup period.
 */
contract InflationarySupply is Owned {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    /* Storage */
    struct ScheduleData {
        // Total supply issuable during period
        uint totalSupply;

        // UTC Time - Start of the schedule
        uint startPeriod;

        // UTC Time - End of the schedule
        uint endPeriod;
    }

    uint public minterReward;

    // Current schedule for retrieval
    uint public currentSchedule;
    // Number of Synthetix minted for current schedule
    uint public currentScheduleMintedSupply;

    mapping(uint => ScheduleData) public schedules;

    uint[] public mintedSchedules;

    constructor(uint _minterReward)
        public
    {
        minterReward = _minterReward;
    }

    // ========== SETTERS ========== */
    function setMinterReward(uint256 tokens)
        onlyOwner
        returns (bool)
    {
        minterReward = tokens;
    }

    // ========== VIEWS ==========
    function getInflationSchedule(uint index)
        view
        returns (uint, uint, uint)
    {
        return (schedules[index].totalSupply, schedules[index].startPeriod, schedules[index].endPeriod);
    }

    function getCurrentPeriod() view
    {

    }

    // ========== MUTATIVE FUNCTIONS ==========
    function mint()
        public
        returns (bool)
    {
        // similar to feePool / feePeriod, check time now > 7 days ago
        // check supply schedule / unminted schedules that date's have vested
        // check date and find relevant schedule
        // Increase supply
        // transfer supply to balances[RewardPool]
        // mint
    }

    // ========== MODIFIERS ==========

}
