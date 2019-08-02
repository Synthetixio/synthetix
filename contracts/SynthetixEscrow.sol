/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       SynthetixEscrow.sol
version:    1.1
author:     Anton Jurisevic
            Dominic Romanowski
            Mike Spain

date:       2018-05-29

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

This contract allows the foundation to apply unique vesting
schedules to synthetix funds sold at various discounts in the token
sale. SynthetixEscrow gives users the ability to inspect their
vested funds, their quantities and vesting dates, and to withdraw
the fees that accrue on those funds.

The fees are handled by withdrawing the entire fee allocation
for all SNX inside the escrow contract, and then allowing
the contract itself to subdivide that pool up proportionally within
itself. Every time the fee period rolls over in the main Synthetix
contract, the SynthetixEscrow fee pool is remitted back into the
main fee pool to be redistributed in the next fee period.

-----------------------------------------------------------------
*/

pragma solidity 0.4.25;


import "./SafeDecimalMath.sol";
import "./Owned.sol";
import "./interfaces/ISynthetix.sol";
import "./LimitedSetup.sol";

/**
 * @title A contract to hold escrowed SNX and free them at given schedules.
 */
contract SynthetixEscrow is Owned, LimitedSetup(8 weeks) {

    using SafeMath for uint;

    /* The corresponding Synthetix contract. */
    ISynthetix public synthetix;

    /* Lists of (timestamp, quantity) pairs per account, sorted in ascending time order.
     * These are the times at which each given quantity of SNX vests. */
    mapping(address => uint[2][]) public vestingSchedules;

    /* An account's total vested synthetix balance to save recomputing this for fee extraction purposes. */
    mapping(address => uint) public totalVestedAccountBalance;

    /* The total remaining vested balance, for verifying the actual synthetix balance of this contract against. */
    uint public totalVestedBalance;

    uint constant TIME_INDEX = 0;
    uint constant QUANTITY_INDEX = 1;

    /* Limit vesting entries to disallow unbounded iteration over vesting schedules. */
    uint constant MAX_VESTING_ENTRIES = 20;


    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, ISynthetix _synthetix)
        Owned(_owner)
        public
    {
        synthetix = _synthetix;
    }


    /* ========== SETTERS ========== */

    function setSynthetix(ISynthetix _synthetix)
        external
        onlyOwner
    {
        synthetix = _synthetix;
        emit SynthetixUpdated(_synthetix);
    }


    /* ========== VIEW FUNCTIONS ========== */

    /**
     * @notice A simple alias to totalVestedAccountBalance: provides ERC20 balance integration.
     */
    function balanceOf(address account)
        public
        view
        returns (uint)
    {
        return totalVestedAccountBalance[account];
    }

    /**
     * @notice The number of vesting dates in an account's schedule.
     */
    function numVestingEntries(address account)
        public
        view
        returns (uint)
    {
        return vestingSchedules[account].length;
    }

    /**
     * @notice Get a particular schedule entry for an account.
     * @return A pair of uints: (timestamp, synthetix quantity).
     */
    function getVestingScheduleEntry(address account, uint index)
        public
        view
        returns (uint[2])
    {
        return vestingSchedules[account][index];
    }

    /**
     * @notice Get the time at which a given schedule entry will vest.
     */
    function getVestingTime(address account, uint index)
        public
        view
        returns (uint)
    {
        return getVestingScheduleEntry(account,index)[TIME_INDEX];
    }

    /**
     * @notice Get the quantity of SNX associated with a given schedule entry.
     */
    function getVestingQuantity(address account, uint index)
        public
        view
        returns (uint)
    {
        return getVestingScheduleEntry(account,index)[QUANTITY_INDEX];
    }

    /**
     * @notice Obtain the index of the next schedule entry that will vest for a given user.
     */
    function getNextVestingIndex(address account)
        public
        view
        returns (uint)
    {
        uint len = numVestingEntries(account);
        for (uint i = 0; i < len; i++) {
            if (getVestingTime(account, i) != 0) {
                return i;
            }
        }
        return len;
    }

    /**
     * @notice Obtain the next schedule entry that will vest for a given user.
     * @return A pair of uints: (timestamp, synthetix quantity). */
    function getNextVestingEntry(address account)
        public
        view
        returns (uint[2])
    {
        uint index = getNextVestingIndex(account);
        if (index == numVestingEntries(account)) {
            return [uint(0), 0];
        }
        return getVestingScheduleEntry(account, index);
    }

    /**
     * @notice Obtain the time at which the next schedule entry will vest for a given user.
     */
    function getNextVestingTime(address account)
        external
        view
        returns (uint)
    {
        return getNextVestingEntry(account)[TIME_INDEX];
    }

    /**
     * @notice Obtain the quantity which the next schedule entry will vest for a given user.
     */
    function getNextVestingQuantity(address account)
        external
        view
        returns (uint)
    {
        return getNextVestingEntry(account)[QUANTITY_INDEX];
    }


    /* ========== MUTATIVE FUNCTIONS ========== */

    /**
     * @notice Withdraws a quantity of SNX back to the synthetix contract.
     * @dev This may only be called by the owner during the contract's setup period.
     */
    function withdrawSynthetix(uint quantity)
        external
        onlyOwner
        onlyDuringSetup
    {
        synthetix.transfer(synthetix, quantity);
    }

    /**
     * @notice Destroy the vesting information associated with an account.
     */
    function purgeAccount(address account)
        external
        onlyOwner
        onlyDuringSetup
    {
        delete vestingSchedules[account];
        totalVestedBalance = totalVestedBalance.sub(totalVestedAccountBalance[account]);
        delete totalVestedAccountBalance[account];
    }

    /**
     * @notice Add a new vesting entry at a given time and quantity to an account's schedule.
     * @dev A call to this should be accompanied by either enough balance already available
     * in this contract, or a corresponding call to synthetix.endow(), to ensure that when
     * the funds are withdrawn, there is enough balance, as well as correctly calculating
     * the fees.
     * This may only be called by the owner during the contract's setup period.
     * Note; although this function could technically be used to produce unbounded
     * arrays, it's only in the foundation's command to add to these lists.
     * @param account The account to append a new vesting entry to.
     * @param time The absolute unix timestamp after which the vested quantity may be withdrawn.
     * @param quantity The quantity of SNX that will vest.
     */
    function appendVestingEntry(address account, uint time, uint quantity)
        public
        onlyOwner
        onlyDuringSetup
    {
        /* No empty or already-passed vesting entries allowed. */
        require(now < time, "Time must be in the future");
        require(quantity != 0, "Quantity cannot be zero");

        /* There must be enough balance in the contract to provide for the vesting entry. */
        totalVestedBalance = totalVestedBalance.add(quantity);
        require(totalVestedBalance <= synthetix.balanceOf(this), "Must be enough balance in the contract to provide for the vesting entry");

        /* Disallow arbitrarily long vesting schedules in light of the gas limit. */
        uint scheduleLength = vestingSchedules[account].length;
        require(scheduleLength <= MAX_VESTING_ENTRIES, "Vesting schedule is too long");

        if (scheduleLength == 0) {
            totalVestedAccountBalance[account] = quantity;
        } else {
            /* Disallow adding new vested SNX earlier than the last one.
             * Since entries are only appended, this means that no vesting date can be repeated. */
            require(getVestingTime(account, numVestingEntries(account) - 1) < time, "Cannot add new vested entries earlier than the last one");
            totalVestedAccountBalance[account] = totalVestedAccountBalance[account].add(quantity);
        }

        vestingSchedules[account].push([time, quantity]);
    }

    /**
     * @notice Construct a vesting schedule to release a quantities of SNX
     * over a series of intervals.
     * @dev Assumes that the quantities are nonzero
     * and that the sequence of timestamps is strictly increasing.
     * This may only be called by the owner during the contract's setup period.
     */
    function addVestingSchedule(address account, uint[] times, uint[] quantities)
        external
        onlyOwner
        onlyDuringSetup
    {
        for (uint i = 0; i < times.length; i++) {
            appendVestingEntry(account, times[i], quantities[i]);
        }

    }

    /**
     * @notice Allow a user to withdraw any SNX in their schedule that have vested.
     */
    function vest()
        external
    {
        uint numEntries = numVestingEntries(msg.sender);
        uint total;
        for (uint i = 0; i < numEntries; i++) {
            uint time = getVestingTime(msg.sender, i);
            /* The list is sorted; when we reach the first future time, bail out. */
            if (time > now) {
                break;
            }
            uint qty = getVestingQuantity(msg.sender, i);
            if (qty == 0) {
                continue;
            }

            vestingSchedules[msg.sender][i] = [0, 0];
            total = total.add(qty);
        }

        if (total != 0) {
            totalVestedBalance = totalVestedBalance.sub(total);
            totalVestedAccountBalance[msg.sender] = totalVestedAccountBalance[msg.sender].sub(total);
            synthetix.transfer(msg.sender, total);
            emit Vested(msg.sender, now, total);
        }
    }


    /* ========== EVENTS ========== */

    event SynthetixUpdated(address newSynthetix);

    event Vested(address indexed beneficiary, uint time, uint value);
}
