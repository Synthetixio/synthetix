/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       HavvenEscrow.sol
version:    1.0
author:     Anton Jurisevic
            Dominic Romanowski
            Mike Spain

date:       2018-02-07

checked:    Mike Spain
approved:   Samuel Brooks

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------

This contract allows the foundation to apply unique vesting
schedules to havven funds sold at various discounts in the token
sale. HavvenEscrow gives users the ability to inspect their
vested funds, their quantities and vesting dates, and to withdraw
the fees that accrue on those funds.

The fees are handled by withdrawing the entire fee allocation
for all havvens inside the escrow contract, and then allowing
the contract itself to subdivide that pool up proportionally within
itself. Every time the fee period rolls over in the main Havven
contract, the HavvenEscrow fee pool is remitted back into the
main fee pool to be redistributed in the next fee period.

-----------------------------------------------------------------

*/

pragma solidity 0.4.23;


import "contracts/SafeDecimalMath.sol";
import "contracts/Emitter.sol";
import "contracts/Havven.sol";
import "contracts/Nomin.sol";
import "contracts/LimitedSetup.sol";

/**
 * @title A contract to hold escrowed havvens and free them at given schedules.
 */
contract HavvenEscrow is SafeDecimalMath, Emitter, LimitedSetup(8 weeks) {
    /* The corresponding Havven contract. */
    Havven public havven;

    /* Lists of (timestamp, quantity) pairs per account, sorted in ascending time order.
     * These are the times at which each given quantity of havvens vests. */
    mapping(address => uint[2][]) public vestingSchedules;

    /* An account's total vested havven balance to save recomputing this for fee extraction purposes. */
    mapping(address => uint) public totalVestedAccountBalance;

    /* The total remaining vested balance, for verifying the actual havven balance of this contract against. */
    uint public totalVestedBalance;


    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, Havven _havven)
        Emitter(_owner)
        public
    {
        havven = _havven;
    }


    /* ========== SETTERS ========== */

    function setHavven(Havven _havven)
        external
        onlyOwner
    {
        havven = _havven;
        emitHavvenUpdated(_havven);
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
     * @return A pair of uints: (timestamp, havven quantity).
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
        return vestingSchedules[account][index][0];
    }

    /**
     * @notice Get the quantity of havvens associated with a given schedule entry.
     */
    function getVestingQuantity(address account, uint index)
        public
        view
        returns (uint)
    {
        return vestingSchedules[account][index][1];
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
     * @return A pair of uints: (timestamp, havven quantity). */
    function getNextVestingEntry(address account)
        external
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
        uint index = getNextVestingIndex(account);
        if (index == numVestingEntries(account)) {
            return 0;
        }
        return getVestingTime(account, index);
    }

    /**
     * @notice Obtain the quantity which the next schedule entry will vest for a given user.
     */
    function getNextVestingQuantity(address account)
        external
        view
        returns (uint)
    {
        uint index = getNextVestingIndex(account);
        if (index == numVestingEntries(account)) {
            return 0;
        }
        return getVestingQuantity(account, index);
    }


    /* ========== MUTATIVE FUNCTIONS ========== */

    /**
     * @notice Withdraws a quantity of havvens back to the havven contract.
     * @dev This may only be called by the owner during the contract's setup period.
     */
    function withdrawHavvens(uint quantity)
        external
        onlyOwner
        setupFunction
    {
        havven.transfer(havven, quantity);
    }

    /**
     * @notice Destroy the vesting information associated with an account.
     */
    function purgeAccount(address account)
        external
        onlyOwner
        setupFunction
    {
        delete vestingSchedules[account];
        totalVestedBalance = safeSub(totalVestedBalance, totalVestedAccountBalance[account]);
        delete totalVestedAccountBalance[account];
    }

    /**
     * @notice Add a new vesting entry at a given time and quantity to an account's schedule.
     * @dev A call to this should be accompanied by either enough balance already available
     * in this contract, or a corresponding call to havven.endow(), to ensure that when
     * the funds are withdrawn, there is enough balance, as well as correctly calculating
     * the fees.
     * This may only be called by the owner during the contract's setup period.
     * Note; although this function could technically be used to produce unbounded
     * arrays, it's only in the foundation's command to add to these lists.
     * @param account The account to append a new vesting entry to.
     * @param time The absolute unix timestamp after which the vested quantity may be withdrawn.
     * @param quantity The quantity of havvens that will vest.
     */
    function appendVestingEntry(address account, uint time, uint quantity)
        public
        onlyOwner
        setupFunction
    {
        /* No empty or already-passed vesting entries allowed. */
        require(now < time);
        require(quantity != 0);
        totalVestedBalance = safeAdd(totalVestedBalance, quantity);
        require(totalVestedBalance <= havven.balanceOf(this));

        if (vestingSchedules[account].length == 0) {
            totalVestedAccountBalance[account] = quantity;
        } else {
            /* Disallow adding new vested havvens earlier than the last one.
             * Since entries are only appended, this means that no vesting date can be repeated. */
            require(getVestingTime(account, numVestingEntries(account) - 1) < time);
            totalVestedAccountBalance[account] = safeAdd(totalVestedAccountBalance[account], quantity);
        }

        vestingSchedules[account].push([time, quantity]);
    }

    /**
     * @notice Construct a vesting schedule to release a quantities of havvens
     * over a series of intervals.
     * @dev Assumes that the quantities are nonzero
     * and that the sequence of timestamps is strictly increasing.
     * This may only be called by the owner during the contract's setup period.
     */
    function addVestingSchedule(address account, uint[] times, uint[] quantities)
        external
        onlyOwner
        setupFunction
    {
        for (uint i = 0; i < times.length; i++) {
            appendVestingEntry(account, times[i], quantities[i]);
        }

    }

    /**
     * @notice Allow a user to withdraw any havvens in their schedule that have vested.
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
            total = safeAdd(total, qty);
            totalVestedAccountBalance[msg.sender] = safeSub(totalVestedAccountBalance[msg.sender], qty);
        }

        if (total != 0) {
            totalVestedBalance = safeSub(totalVestedBalance, total);
            havven.transfer(msg.sender, total);
            emitVested(msg.sender, msg.sender, now, total);
        }
    }

}
