/*
-----------------------------------------------------------------
FILE INFORMATION
-----------------------------------------------------------------

file:       RewardEscrow.sol
version:    1.0
author:     Jackson Chan
            Clinton Ennis

date:       2019-03-01

-----------------------------------------------------------------
MODULE DESCRIPTION
-----------------------------------------------------------------
Escrows the SNX rewards from the inflationary supply awarded to
users for staking their SNX and maintaining the c-rationn target.

SNW rewards are escrowed for 1 year from the claim date and users
can call vest in 12 months time.
-----------------------------------------------------------------
*/

pragma solidity 0.4.25;


import "./SafeDecimalMath.sol";
import "./Owned.sol";
import "./interfaces/IFeePool.sol";
import "./interfaces/ISynthetix.sol";

/**
 * @title A contract to hold escrowed SNX and free them at given schedules.
 */
contract RewardEscrow is Owned {

    using SafeMath for uint;

    /* The corresponding Synthetix contract. */
    ISynthetix public synthetix;

    IFeePool public feePool;

    /* Lists of (timestamp, quantity) pairs per account, sorted in ascending time order.
     * These are the times at which each given quantity of SNX vests. */
    mapping(address => uint[2][]) public vestingSchedules;

    /* An account's total escrowed synthetix balance to save recomputing this for fee extraction purposes. */
    mapping(address => uint) public totalEscrowedAccountBalance;

    /* An account's total vested reward synthetix. */
    mapping(address => uint) public totalVestedAccountBalance;

    /* The total remaining escrowed balance, for verifying the actual synthetix balance of this contract against. */
    uint public totalEscrowedBalance;

    uint constant TIME_INDEX = 0;
    uint constant QUANTITY_INDEX = 1;

    /* Limit vesting entries to disallow unbounded iteration over vesting schedules.
    * There are 5 years of the supply scedule */
    uint constant public MAX_VESTING_ENTRIES = 52*5;


    /* ========== CONSTRUCTOR ========== */

    constructor(address _owner, ISynthetix _synthetix, IFeePool _feePool)
    Owned(_owner)
    public
    {
        synthetix = _synthetix;
        feePool = _feePool;
    }


    /* ========== SETTERS ========== */

    /**
     * @notice set the synthetix contract address as we need to transfer SNX when the user vests
     */
    function setSynthetix(ISynthetix _synthetix)
    external
    onlyOwner
    {
        synthetix = _synthetix;
        emit SynthetixUpdated(_synthetix);
    }

    /**
     * @notice set the FeePool contract as it is the only authority to be able to call
     * appendVestingEntry with the onlyFeePool modifer
     */
    function setFeePool(IFeePool _feePool)
        external
        onlyOwner
    {
        feePool = _feePool;
        emit FeePoolUpdated(_feePool);
    }


    /* ========== VIEW FUNCTIONS ========== */

    /**
     * @notice A simple alias to totalEscrowedAccountBalance: provides ERC20 balance integration.
     */
    function balanceOf(address account)
    public
    view
    returns (uint)
    {
        return totalEscrowedAccountBalance[account];
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

    /**
     * @notice return the full vesting schedule entries vest for a given user.
     */
    function checkAccountSchedule(address account)
        public
        view
        returns (uint[520])
    {
        uint[520] memory _result;
        uint schedules = numVestingEntries(account);
        for (uint i = 0; i < schedules; i++) {
            uint[2] memory pair = getVestingScheduleEntry(account, i);
            _result[i*2] = pair[0];
            _result[i*2 + 1] = pair[1];
        }
        return _result;
    }


    /* ========== MUTATIVE FUNCTIONS ========== */

    /**
     * @notice Add a new vesting entry at a given time and quantity to an account's schedule.
     * @dev A call to this should accompany a previous successfull call to synthetix.transfer(tewardEscrow, amount),
     * to ensure that when the funds are withdrawn, there is enough balance.
     * Note; although this function could technically be used to produce unbounded
     * arrays, it's only withinn the 4 year period of the weekly inflation schedule.
     * @param account The account to append a new vesting entry to.
     * @param quantity The quantity of SNX that will be escrowed.
     */
    function appendVestingEntry(address account, uint quantity)
    public
    onlyFeePool
    {
        /* No empty or already-passed vesting entries allowed. */
        require(quantity != 0, "Quantity cannot be zero");

        /* There must be enough balance in the contract to provide for the vesting entry. */
        totalEscrowedBalance = totalEscrowedBalance.add(quantity);
        require(totalEscrowedBalance <= synthetix.balanceOf(this), "Must be enough balance in the contract to provide for the vesting entry");

        /* Disallow arbitrarily long vesting schedules in light of the gas limit. */
        uint scheduleLength = vestingSchedules[account].length;
        require(scheduleLength <= MAX_VESTING_ENTRIES, "Vesting schedule is too long");

        /* Escrow the tokens for 1 year. */
        uint time = now + 52 weeks;

        if (scheduleLength == 0) {
            totalEscrowedAccountBalance[account] = quantity;
        } else {
            /* Disallow adding new vested SNX earlier than the last one.
             * Since entries are only appended, this means that no vesting date can be repeated. */
            require(getVestingTime(account, numVestingEntries(account) - 1) < time, "Cannot add new vested entries earlier than the last one");
            totalEscrowedAccountBalance[account] = totalEscrowedAccountBalance[account].add(quantity);
        }

        vestingSchedules[account].push([time, quantity]);

        emit VestingEntryCreated(account, now, quantity);
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
            totalEscrowedBalance = totalEscrowedBalance.sub(total);
            totalEscrowedAccountBalance[msg.sender] = totalEscrowedAccountBalance[msg.sender].sub(total);
            totalVestedAccountBalance[msg.sender] = totalVestedAccountBalance[msg.sender].add(total);
            synthetix.transfer(msg.sender, total);
            emit Vested(msg.sender, now, total);
        }
    }

    /* ========== MODIFIERS ========== */

    modifier onlyFeePool() {
        bool isFeePool = msg.sender == address(feePool);

        require(isFeePool, "Only the FeePool contracts can perform this action");
        _;
    }


    /* ========== EVENTS ========== */

    event SynthetixUpdated(address newSynthetix);

    event FeePoolUpdated(address newFeePool);

    event Vested(address indexed beneficiary, uint time, uint value);

    event VestingEntryCreated(address indexed beneficiary, uint time, uint value);

}
