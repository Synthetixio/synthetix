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

    uint8 constant public INFLATION_SCHEDULES_LENGTH = 5;
    ScheduleData[INFLATION_SCHEDULES_LENGTH] public schedules;

    constructor(address _owner)
        Owned(_owner)
        public
    {
        // Year 1 - Total supply 100,000,000
        schedules[0] = ScheduleData(1e8 * SafeDecimalMath.unit(), 1520899200, 1552435200, 1e8 * SafeDecimalMath.unit());

        // Year 2 - Total supply 175,000,000
        schedules[1] = ScheduleData(75e6 * SafeDecimalMath.unit(), 1552435200, 1584057600, 0);

        // Year 3 - Total supply 212,500,000
        schedules[2] = ScheduleData(37.5e6 * SafeDecimalMath.unit(), 1584057600, 1615593600, 0);

        // Year 4 - Total supply 231,250,000
        schedules[3] = ScheduleData(18.75e6 * SafeDecimalMath.unit(), 1615593600, 1647129600, 0);

        // Year 5 - Total supply 240,625,000
        schedules[4] = ScheduleData(9.375e6 * SafeDecimalMath.unit(), 1647129600, 1678665600, 0);

        // Year 6 - Total supply 245,312,500
        schedules[4] = ScheduleData(4.6875e6 * SafeDecimalMath.unit(), 1647129600, 1678665600, 0);
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
        uint index = getCurrentSchedule();

        // Calculate previous period's mintable supply
        uint amountPreviousPeriod = _remainingSupplyFromPreviousPeriod(index);

        // Get mintable supply ratio from the difference in (now - lastMintEvent) seconds
        // Last mint event within current period will use difference in (now - lastMintEvent)
        // Last mint event not set (0) / outside of current Period will use (now - schedules[index].startPeriod)
        uint amountInPeriod = lastMintEvent > schedules[index].startPeriod ? (schedules[index].totalSupply).mul(now - lastMintEvent) : schedules[index].totalSupply.mul(now - schedules[index].startPeriod);

        return amountInPeriod.add(previousPeriod);
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
        return schedules[currentSchedule - 1].totalSupply.sub(schedules[currentSchedule - 1].totalSupplyMinted);
    }
    // ========== MUTATIVE FUNCTIONS ==========
    function updateMintValues()
        onlySynthetix
        external
        returns (bool)
    {
        uint currentIndex = getCurrentSchedule();

        // Update schedule.totalSupplyMinted for currentSchedule
        schedules[currentIndex].totalSupplyMinted = schedules[currentIndex].totalSupplyMinted.add(mintableSupply());
        // Lastly update minted event to track minted values
        lastMintEvent = now;

        return true;
    }

    // ========== MODIFIERS ==========

    modifier onlySynthetix() {
        require(msg.sender == address(synthetix), "Only the synthetix contract can perform this action");
        _;
    }
}
