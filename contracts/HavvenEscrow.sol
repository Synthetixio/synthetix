import "contracts/SafeDecimalMath.sol";
import "contracts/Owned.sol";
import "contracts/Havven.sol";
import "contracts/EtherNomin.sol";

pragma solidity ^0.4.19;

contract HavvenEscrow is Owned, SafeDecimalMath {    
    // The corresponding Havven contract.
    Havven public havven;
    EtherNomin public nomin;

    // Lists of (timestamp, quantity) pairs per account, sorted in ascending time order.
    // These are the times at which each given quantity of havvens vests.
    mapping(address => uint[2][]) public vestingSchedules;

    // An account's total vested havven balance to save recomputing this for fee extraction purposes.
    mapping(address => uint) public totalVestedAccountBalance;

    // The total remaining vested balance, for verifying the actual havven balance of this contract against.
    uint public totalVestedBalance;


    function HavvenEscrow(address _owner, Havven _havven, EtherNomin _nomin)
        Owned(_owner)
        public
    {
        havven = _havven;
        nomin = _nomin;
    }

    function numVestingEntries(address account)
        public
        view
        returns (uint)
    {
        return vestingSchedules[account].length;
    }

    function getVestingScheduleEntry(address account, uint index)
        public
        view
        returns (uint[2])
    {
        return vestingSchedules[account][index];
    }

    function getVestingTime(address account, uint index)
        public
        view
        returns (uint)
    {
        return vestingSchedules[account][index][0];
    }

    function getVestingQuantity(address account, uint index)
        public
        view
        returns (uint)
    {
        return vestingSchedules[account][index][1];
    }

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

    function feePool()
        public
        view
        returns (uint)
    {
        return nomin.balanceOf(this);
    }

    function setHavven(Havven newHavven)
        public
        onlyOwner
    {
        havven = newHavven;
    }

    function setNomin(EtherNomin newNomin)
        public
        onlyOwner
    {
        nomin = newNomin;
    } 

    function remitFees()
        public
    {
        // Only the havven contract should be able to force
        // the escrow contract to remit its fees back to the common pool.
        require(Havven(msg.sender) == havven);
        uint feeBalance = feePool();
        // Ensure balance is nonzero so that the fee pool function does not revert.
        if (feeBalance != 0) {
            nomin.donateToFeePool(feePool());
        }
    }

    function withdrawContractFees()
        public
    {
        havven.withdrawFeeEntitlement();
    }

    function withdrawFees()
        public
    {
        // If fees need to be withdrawn into this contract, then withdraw them.
        if (!havven.hasWithdrawnLastPeriodFees(this)) {
            withdrawContractFees();
        }
        // exception will be thrown if totalVestedBalance will be 0
        uint entitlement = safeDecDiv(safeDecMul(feePool(), totalVestedAccountBalance[msg.sender]), totalVestedBalance);
        nomin.transfer(msg.sender, entitlement);
    }

    function purgeAccount(address account)
        onlyOwner
        public
    {
        delete vestingSchedules[account];
        totalVestedBalance = safeSub(totalVestedBalance, totalVestedAccountBalance[account]);
        totalVestedAccountBalance[account] = 0;
    }

    /* Withdraws a quantity of havvens back to the havven contract. */
    function withdrawHavvens(uint quantity)
        onlyOwner
        external
    {
        havven.transfer(havven, quantity);
    }

    /* A call to this should be accompanied by either enough balance already available
     * in this contract, or a corresponding call to havven.endow(), to ensure that when
     * the funds are withdrawn, there is enough balance, as well as correctly calculating
     * the fees.
     * Note; although this function could technically be used to produce unbounded
     * arrays, it's only in the foundation's command to add to these lists. */
    function appendVestingEntry(address account, uint time, uint quantity)
        onlyOwner
        public
    {
        require(now < time);
        require(quantity != 0);

        if (vestingSchedules[account].length == 0) {
            totalVestedAccountBalance[account] = quantity;
        } else {
            // Disallow adding new vested havvens earlier than the last one.
            // Since entries are only appended, this means that no vesting date can be repeated.
            require(getVestingTime(account, numVestingEntries(account) - 1) < time);
            totalVestedAccountBalance[account] = safeAdd(totalVestedAccountBalance[account], quantity);
        }

        vestingSchedules[account].push([time, quantity]);
        totalVestedBalance = safeAdd(totalVestedBalance, quantity);
    }

    function addVestingSchedule(address account, uint conclusion_time, uint quantity, uint vesting_periods)
        onlyOwner
        public
    {
        // safe sub to avoid now > conclusion_time
        uint time_period = safeSub(conclusion_time, now);
        // only quantity is UNIT
        uint item_quantity = safeDiv(quantity, vesting_periods);
        uint quant_sum = safeMul(item_quantity, (vesting_periods-1));

        for (uint i = 1; i < vesting_periods; i++) {
            uint item_time_period = safeMul(i, safeDiv(time_period, vesting_periods));
            appendVestingEntry(account, safeAdd(now, item_time_period), item_quantity);
        }
        appendVestingEntry(account, conclusion_time, safeSub(quantity, quant_sum));
    }

    /* Withdraw any tokens that have vested. */
    function vest() 
        public
    {
        uint total = 0;
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
        }
    }
}