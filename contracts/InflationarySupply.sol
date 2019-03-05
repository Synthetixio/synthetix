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

+------+-------------+--------------+----------+
| Year |  Increase   | Total Supply | Increase |
+------+-------------+--------------+----------+
|    1 |           0 |  100,000,000 |          |
|    2 | 100,000,000 |  200,000,000 | 100%     |
|    3 |  50,000,000 |  250,000,000 | 25%      |
|    4 |  30,000,000 |  280,000,000 | 12%      |
|    5 |  20,000,000 |  300,000,000 | 7%       |
+------+-------------+--------------+----------+


-----------------------------------------------------------------
*/
pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./SafeDecimalMath.sol";
import "./Owned.sol";
import "./Synthetix.sol";

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

        // UTC Time - Total of supply minted
        uint totalSupplyMinted;
    }

    // Current schedule index for quick retrieval
    uint public currentScheduleIndex;

    // How long each mint period is
    uint public mintPeriodDuration = 1 weeks;

    // time supply last minted
    uint public lastMintEvent;

    // Reward for minter calling mint
    uint public minterReward;

    Synthetix public synthetix;

    uint8 constant public INFLATION_SCHEDULES_LENGTH = 5;
    ScheduleData[INFLATION_SCHEDULES_LENGTH] public schedules;

//    uint[] public mintedSchedules;

    constructor(address _owner)
        Owned(_owner)
        public
    {
        currentScheduleIndex = 1;

        // Year 0 - Total supply 100,000,000
        schedules[0] = ScheduleData(1e8 * SafeDecimalMath.unit(), 1520899200, 1552435200, 1e8 * SafeDecimalMath.unit());

        // Year 1 - Total supply 200,000,000
        schedules[1] = ScheduleData(1e8 * SafeDecimalMath.unit(), 1552435200, 1584057600, 0);

        // Year 2 - Total supply 250,000,000
        schedules[2] = ScheduleData(5e7 * SafeDecimalMath.unit(), 1584057600, 1615593600, 0);

        // Year 3 - Total supply 280,000,000
        schedules[3] = ScheduleData(3e7 * SafeDecimalMath.unit(), 1615593600, 1647129600, 0);

        // Year 4 - Total supply 300,000,000
        schedules[4] = ScheduleData(2e7 * SafeDecimalMath.unit(), 1647129600, 1678665600, 0);
    }

    // ========== SETTERS ========== */
    function setSynthetix(Synthetix _synthetix)
        onlyOwner
        external
    {
        synthetix = _synthetix;
        // emit event
    }

    // ========== VIEWS ==========
    function getInflationSchedule(uint index)
        view
        returns (uint, uint, uint, uint)
    {
        return (schedules[index].totalSupply, schedules[index].startPeriod, schedules[index].endPeriod, schedules[index].totalSupplyMinted);
    }

    function getMintableSupply()
        external
        view
        returns (uint)
    {
        return schedules[currentScheduleIndex].totalSupply.sub(schedules[currentScheduleIndex].totalSupplyMinted);
    }

    function isMintable()
        external
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
        if (schedules[currentScheduleIndex].startPeriod < now && schedules[currentScheduleIndex].endPeriod > now) {
            return currentScheduleIndex;
        }

        for (uint i = 0; i < INFLATION_SCHEDULES_LENGTH; i++) {
            if (schedules[i].startPeriod < now && schedules[i].endPeriod > now) {
                return i;
            }
        }
    }

    function getRemainingSupplyFromPreviousYear(uint currentSchedule)
        internal
        view
        returns (uint)
    {
        // All supply has been minted for previous period if last minting event is after
        // the endPeriod for last year
        if (currentSchedule == 0 || lastMintEvent > schedules[currentSchedule - 1].endPeriod) {
            return 0;
        }
        uint totalSupplyMinted = schedules[currentSchedule - 1].totalSupplyMinted;
        return schedules[currentSchedule - 1].totalSupply.sub(totalSupplyMinted);
    }
    // ========== MUTATIVE FUNCTIONS ==========
    function updateMintValues()
        onlySynthetix
        updateSchedule
        external
        returns (bool)
    {
        uint supplyMinted = this.getMintableSupply();

        // Update schedule.totalSupplyMinted for currentSchedule
        schedules[currentScheduleIndex].totalSupplyMinted = schedules[currentScheduleIndex].totalSupplyMinted.add(supplyMinted);
        // Lastly update minted event to track minted values
        lastMintEvent = now;
    }

    // ========== MODIFIERS ==========
    modifier updateSchedule() {
        uint newSchedule = getCurrentSchedule();
        if (currentScheduleIndex != newSchedule) {
            currentScheduleIndex = newSchedule;
        }
        _;
    }

    modifier onlySynthetix() {
        require(msg.sender == address(synthetix), "Only the synthetix contract can perform this action");
        _;
    }
}
