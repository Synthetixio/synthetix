/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       SupplySchedule.sol
version:    1.0
author:     Jackson Chan
            Clinton Ennis
date:       2019-03-01

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

Inflationary Supply contract. SNX is a transferable ERC20 token.

+------+-------------+--------------+----------+
| Year |  Increase   | Total Supply | Increase |
+------+-------------+--------------+----------+
|    1 |           0 |  100,000,000 |          |
|    2 | 100,000,000 |  175,000,000 | 75%      |
|    3 |  50,000,000 |  212,500,000 | 25%      |
|    4 |  50,000,000 |  231,250,000 | 25%      |
|    5 |  30,000,000 |  240,625,000 | 12%      |
|    6 |  20,000,000 |  245,312,500 | 7%       |
+------+-------------+--------------+----------+


-----------------------------------------------------------------
*/
pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./SafeDecimalMath.sol";
import "./Owned.sol";
import "./Synthetix.sol";

/**
 * @title SupplySchedule contract
 */
contract SupplySchedule is Owned {
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

        // UTC Time - Total of supply minted
        uint totalSupplyMinted;
    }

    // How long each mint period is
    uint public mintPeriodDuration = 1 weeks;

    // time supply last minted
    uint public lastMintEvent;

    // Reward for minter calling mint
    uint public minterReward;

    Synthetix public synthetix;

    uint constant SECONDS_IN_YEAR = 60 * 60 * 24 * 365;

    uint public constant START_DATE = 1520899200; // 2018-03-13T00:00:00+00:00
    uint public constant YEAR_ONE = START_DATE + SECONDS_IN_YEAR.mul(1);
    uint public constant YEAR_TWO = START_DATE + SECONDS_IN_YEAR.mul(2);
    uint public constant YEAR_THREE = START_DATE + SECONDS_IN_YEAR.mul(3);
    uint public constant YEAR_FOUR = START_DATE + SECONDS_IN_YEAR.mul(4);
    uint public constant YEAR_FIVE = START_DATE + SECONDS_IN_YEAR.mul(5);
    uint public constant YEAR_SIX = START_DATE + SECONDS_IN_YEAR.mul(6);

    uint8 constant public INFLATION_SCHEDULES_LENGTH = 6;
    ScheduleData[INFLATION_SCHEDULES_LENGTH] public schedules;

    constructor(address _owner)
        Owned(_owner)
        public
    {
        // ScheduleData(totalSupply, startPeriod, endPeriod, totalSupplyMinted)
        // Year 1 - Total supply 100,000,000
        schedules[0] = ScheduleData(1e8 * SafeDecimalMath.unit(), START_DATE, YEAR_ONE, 1e8 * SafeDecimalMath.unit());
        schedules[1] = ScheduleData(75e6 * SafeDecimalMath.unit(), YEAR_ONE, YEAR_TWO, 0); // Year 2 - Total supply 175,000,000
        schedules[2] = ScheduleData(37.5e6 * SafeDecimalMath.unit(), YEAR_TWO, YEAR_THREE, 0); // Year 3 - Total supply 212,500,000
        schedules[3] = ScheduleData(18.75e6 * SafeDecimalMath.unit(), YEAR_THREE, YEAR_FOUR, 0); // Year 4 - Total supply 231,250,000
        schedules[4] = ScheduleData(9.375e6 * SafeDecimalMath.unit(), YEAR_FOUR, YEAR_FIVE, 0); // Year 5 - Total supply 240,625,000
        schedules[5] = ScheduleData(4.6875e6 * SafeDecimalMath.unit(), YEAR_FIVE, YEAR_SIX, 0); // Year 6 - Total supply 245,312,500
    }

    // ========== SETTERS ========== */
    function setSynthetix(Synthetix _synthetix)
        external
        onlyOwner
    {
        synthetix = _synthetix;
        // emit event
    }

    // ========== VIEWS ==========
    function getInflationSchedule(uint index)
        external
        view
        returns (uint, uint, uint, uint)
    {
        return (schedules[index].totalSupply, schedules[index].startPeriod, schedules[index].endPeriod, schedules[index].totalSupplyMinted);
    }

    function mintableSupply()
        public
        view
        returns (uint)
    {
        if (!isMintable()) {
            return 0;
        }
        
        uint index = getCurrentSchedule();

        // Calculate previous period's mintable supply
    //    uint amountPreviousPeriod = _remainingSupplyFromPreviousPeriod(index);

        /* solium-disable */

        // Last mint event within current period will use difference in (now - lastMintEvent)
        // Last mint event not set (0) / outside of current Period will use current Period 
        // start time resolved in (now - schedule.startPeriod)
        ScheduleData memory schedule = schedules[index];
        
        uint weeksInPeriod = (schedule.endPeriod - schedule.startPeriod).div(mintPeriodDuration);

        uint supplyPerWeek = schedule.totalSupply.divideDecimal(weeksInPeriod);

        uint weeksToMint = lastMintEvent > schedule.startPeriod ? _numWeeksRoundedUp(now.sub(lastMintEvent)) : _numWeeksRoundedUp(now.sub(schedule.startPeriod));
        /* solium-enable */

        uint amountInPeriod = supplyPerWeek.multiplyDecimal(weeksToMint);
        return amountInPeriod;
//        return amountInPeriod.add(amountPreviousPeriod);
    }

    function _numWeeksRoundedUp(uint _timeDiff)
        public
        constant
        returns (uint)
    {
        // Take timeDiff in seconds (Dividend) and mintPeriodDuration as (Divisor)
        // Calculate the numberOfWeeks since last mint rounded up to 1 week
        // Fraction of a week will return a min of 1 week
        if (_timeDiff.divideDecimal(mintPeriodDuration) <= 1) {
            return 1;
        } else {
            return (_timeDiff.add(mintPeriodDuration).sub(_timeDiff % mintPeriodDuration)).div(mintPeriodDuration);
        }
    }

    function isMintable()
        public
        view
        returns (bool)
    {
        bool mintable = false;
        if (now - lastMintEvent > mintPeriodDuration)
        {
            mintable = true;
        }
        return mintable;
    }

    // Return the current schedule based on the timestamp
    // applicable based on startPeriod and endPeriod
    function getCurrentSchedule()
        public
        view
        returns (uint)
    {
        for (uint i = 0; i < INFLATION_SCHEDULES_LENGTH; i++) {
            if (schedules[i].startPeriod < now && schedules[i].endPeriod > now) {
                return i;
            }
        }
    }

    function _remainingSupplyFromPreviousPeriod(uint currentSchedule)
        internal
        view
        returns (uint)
    {
        // All supply has been minted for previous period if last minting event is after
        // the endPeriod for last year
        if (currentSchedule == 0 || lastMintEvent > schedules[currentSchedule - 1].endPeriod) {
            return 0;
        }

        // return the remaining supply to be minted for previous period missed
        uint amountInPeriod = schedules[currentSchedule - 1].totalSupply.sub(schedules[currentSchedule - 1].totalSupplyMinted);

        // Ensure previous period remaining amount is not less than 0
        if (amountInPeriod < 0) {
            return 0;
        }

        return amountInPeriod;
    }

    // ========== MUTATIVE FUNCTIONS ==========
    function updateMintValues()
        external
        onlySynthetix
        returns (bool)
    {
        uint currentIndex = getCurrentSchedule();

        // Update schedule.totalSupplyMinted for currentSchedule
        schedules[currentIndex].totalSupplyMinted = schedules[currentIndex].totalSupplyMinted.add(mintableSupply());
        // Update mint event to now
        lastMintEvent = now;

        return true;
    }

    // ========== MODIFIERS ==========

    modifier onlySynthetix() {
        require(msg.sender == address(synthetix), "Only the synthetix contract can perform this action");
        _;
    }
}
