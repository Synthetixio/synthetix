/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------
file:       HavvenEscrow.sol
version:    0.3
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

pragma solidity ^0.4.20;


import "contracts/SafeDecimalMath.sol";
import "contracts/Owned.sol";
import "contracts/Havven.sol";
import "contracts/EtherNomin.sol";


contract HavvenEscrow is Owned, SafeDecimalMath {    
    // The corresponding Havven contract.
    Havven public havven;

    // Lists of (timestamp, quantity) pairs per account, sorted in ascending time order.
    // These are the times at which each given quantity of havvens vests.
    mapping(address => uint[2][]) public vestingSchedules;

    // An account's total vested havven balance to save recomputing this for fee extraction purposes.
    mapping(address => uint) public totalVestedAccountBalance;

    // The total remaining vested balance, for verifying the actual havven balance of this contract against.
    uint public totalVestedBalance;


    /* ========== CONSTRUCTOR ========== */

    function HavvenEscrow(address _owner, Havven _havven)
        Owned(_owner)
        public
    {
        havven = _havven;
    }


    /* ========== SETTERS ========== */

    function setHavven(Havven newHavven)
        public
        onlyOwner
    {
        havven = newHavven;
        HavvenUpdated(newHavven);
    }


    /* ========== VIEW FUNCTIONS ========== */

    /* The number of vesting dates in an account's schedule. */
    function numVestingEntries(address account)
        public
        view
        returns (uint)
    {
        return vestingSchedules[account].length;
    }

    /* Get a particular schedule entry for an account.
     * The return value is a pair (timestamp, havven quantity) */
    function getVestingScheduleEntry(address account, uint index)
        public
        view
        returns (uint[2])
    {
        return vestingSchedules[account][index];
    }

    /* Get the time at which a given schedule entry will vest. */
    function getVestingTime(address account, uint index)
        public
        view
        returns (uint)
    {
        return vestingSchedules[account][index][0];
    }

    /* Get the quantity of havvens associated with a given schedule entry. */
    function getVestingQuantity(address account, uint index)
        public
        view
        returns (uint)
    {
        return vestingSchedules[account][index][1];
    }

    /* Obtain the index of the next schedule entry that will vest for a given user. */
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

    /* Obtain the next schedule entry that will vest for a given user.
     * The return value is a pair (timestamp, havven quantity) */
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

    /* Obtain the time at which the next schedule entry will vest for a given user. */
    function getNextVestingTime(address account)
        public
        view
        returns (uint)
    {
        uint index = getNextVestingIndex(account);
        if (index == numVestingEntries(account)) {
            return 0;
        }
        return getVestingTime(account, index);
    }

    /* Obtain the quantity which the next schedule entry will vest for a given user. */
    function getNextVestingQuantity(address account)
        public
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

    /* Withdraws a quantity of havvens back to the havven contract. */
    function withdrawHavvens(uint quantity)
        onlyOwner
        external
    {
        havven.transfer(havven, quantity);
    }

    /* Destroy the vesting information associated with an account. */
    function purgeAccount(address account)
        onlyOwner
        public
    {
        delete vestingSchedules[account];
        totalVestedBalance = safeSub(totalVestedBalance, totalVestedAccountBalance[account]);
        delete totalVestedAccountBalance[account];
    }

    /* Add a new vesting entry at a given time and quantity to an account's schedule.
     * A call to this should be accompanied by either enough balance already available
     * in this contract, or a corresponding call to havven.endow(), to ensure that when
     * the funds are withdrawn, there is enough balance, as well as correctly calculating
     * the fees.
     * Note; although this function could technically be used to produce unbounded
     * arrays, it's only in the foundation's command to add to these lists. */
    function appendVestingEntry(address account, uint time, uint quantity)
        onlyOwner
        public
    {
        // No empty or already-passed vesting entries allowed.
        require(now < time);
        require(quantity != 0);
        totalVestedBalance = safeAdd(totalVestedBalance, quantity);
        require(totalVestedBalance <= havven.balanceOf(this));

        if (vestingSchedules[account].length == 0) {
            totalVestedAccountBalance[account] = quantity;
        } else {
            // Disallow adding new vested havvens earlier than the last one.
            // Since entries are only appended, this means that no vesting date can be repeated.
            require(getVestingTime(account, numVestingEntries(account) - 1) < time);
            totalVestedAccountBalance[account] = safeAdd(totalVestedAccountBalance[account], quantity);
        }

        vestingSchedules[account].push([time, quantity]);
    }

    /* Construct a vesting schedule to release a quantity of havvens at regular intervals ending
     * at a given time. */
    function addRegularVestingSchedule(address account, uint conclusionTime,
                                       uint totalQuantity, uint vestingPeriods)
        onlyOwner
        public
    {
        // safeSub prevents a conclusionTime in the past.
        uint totalDuration = safeSub(conclusionTime, now);

        // safeDiv prevents zero vesting periods.
        uint periodQuantity = safeDiv(totalQuantity, vestingPeriods);
        uint periodDuration = safeDiv(totalDuration, vestingPeriods);

        // Generate all but the last period.
        for (uint i = 1; i < vestingPeriods; i++) {
            uint periodConclusionTime = safeAdd(now, safeMul(i, periodDuration));
            appendVestingEntry(account, periodConclusionTime, periodQuantity);
        }

        // Generate the final period. Quantities left out due to integer division truncation are incorporated here.
        uint finalPeriodQuantity = safeSub(totalQuantity, safeMul(periodQuantity, (vestingPeriods - 1)));
        appendVestingEntry(account, conclusionTime, finalPeriodQuantity);
    }

    /* Allow a user to withdraw any tokens that have vested. */
    function vest() 
        public
    {
        uint total;
        for (uint i = 0; i < numVestingEntries(msg.sender); i++) {
            uint time = getVestingTime(msg.sender, i);
            // The list is sorted; when we reach the first future time, bail out.
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
            Vested(msg.sender, msg.sender,
                   now, total);
        }
    }


    /* ========== EVENTS ========== */

    event HavvenUpdated(address newHavven);

    event NominUpdated(address newNomin);

    event ContractFeesWithdrawn(uint time, uint value);

    event FeesWithdrawn(address recipient, address indexed recipientIndex, uint time, uint value);

    event Vested(address beneficiary, address indexed beneficiaryIndex, uint time, uint value);
}
