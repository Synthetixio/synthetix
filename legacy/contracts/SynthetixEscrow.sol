// solhint-disable compiler-version
pragma solidity 0.4.25;

import "../common/Owned.sol";
import "../common/IERC20.sol";


// Havven is effectively just used as an IERC20 here
contract Havven is IERC20 {

}


// Uses very old version of LimitedSetup
contract LimitedSetup {
    uint constructionTime;
    uint setupDuration;

    function LimitedSetup(uint _setupDuration) public {
        constructionTime = now;
        setupDuration = _setupDuration;
    }

    modifier setupFunction {
        require(now < constructionTime + setupDuration);
        _;
    }
}


// Note: this is a very early legacy version before the library came out
// Use a separate name to prevent the compiler from overriding legacy SafeDecimalMath with it
contract EarlySafeDecimalMath {
    // Number of decimal places in the representation.
    uint8 public constant decimals = 18;

    // The number representing 1.0.
    uint public constant UNIT = 10**uint(decimals);

    /* True iff adding x and y will not overflow. */
    function addIsSafe(uint x, uint y) internal pure returns (bool) {
        return x + y >= y;
    }

    /* Return the result of adding x and y, throwing an exception in case of overflow. */
    function safeAdd(uint x, uint y) internal pure returns (uint) {
        require(x + y >= y);
        return x + y;
    }

    /* True iff subtracting y from x will not overflow in the negative direction. */
    function subIsSafe(uint x, uint y) internal pure returns (bool) {
        return y <= x;
    }

    /* Return the result of subtracting y from x, throwing an exception in case of overflow. */
    function safeSub(uint x, uint y) internal pure returns (uint) {
        require(y <= x);
        return x - y;
    }

    /* True iff multiplying x and y would not overflow. */
    function mulIsSafe(uint x, uint y) internal pure returns (bool) {
        if (x == 0) {
            return true;
        }
        return (x * y) / x == y;
    }

    /* Return the result of multiplying x and y, throwing an exception in case of overflow.*/
    function safeMul(uint x, uint y) internal pure returns (uint) {
        if (x == 0) {
            return 0;
        }
        uint p = x * y;
        require(p / x == y);
        return p;
    }

    /* Return the result of multiplying x and y, interpreting the operands as fixed-point
     * demicimals. Throws an exception in case of overflow. A unit factor is divided out
     * after the product of x and y is evaluated, so that product must be less than 2**256.
     *
     * Incidentally, the internal division always rounds down: we could have rounded to the nearest integer,
     * but then we would be spending a significant fraction of a cent (of order a microether
     * at present gas prices) in order to save less than one part in 0.5 * 10^18 per operation, if the operands
     * contain small enough fractional components. It would also marginally diminish the
     * domain this function is defined upon.
     */
    function safeMul_dec(uint x, uint y) internal pure returns (uint) {
        // Divide by UNIT to remove the extra factor introduced by the product.
        // UNIT be 0.
        return safeMul(x, y) / UNIT;
    }

    /* True iff the denominator of x/y is nonzero. */
    function divIsSafe(uint x, uint y) internal pure returns (bool) {
        return y != 0;
    }

    /* Return the result of dividing x by y, throwing an exception if the divisor is zero. */
    function safeDiv(uint x, uint y) internal pure returns (uint) {
        // Although a 0 denominator already throws an exception,
        // it is equivalent to a THROW operation, which consumes all gas.
        // A require statement emits REVERT instead, which remits remaining gas.
        require(y != 0);
        return x / y;
    }

    /* Return the result of dividing x by y, interpreting the operands as fixed point decimal numbers.
     * Throws an exception in case of overflow or zero divisor; x must be less than 2^256 / UNIT.
     * Internal rounding is downward: a similar caveat holds as with safeDecMul().*/
    function safeDiv_dec(uint x, uint y) internal pure returns (uint) {
        // Reintroduce the UNIT factor that will be divided out by y.
        return safeDiv(safeMul(x, UNIT), y);
    }

    /* Convert an unsigned integer to a unsigned fixed-point decimal.
     * Throw an exception if the result would be out of range. */
    function intToDec(uint i) internal pure returns (uint) {
        return safeMul(i, UNIT);
    }
}


contract HavvenEscrow is Owned, LimitedSetup(8 weeks), EarlySafeDecimalMath {
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

    function HavvenEscrow(address _owner, Havven _havven) public Owned(_owner) {
        havven = _havven;
    }

    /* ========== SETTERS ========== */

    function setHavven(Havven _havven) external onlyOwner {
        havven = _havven;
        emit HavvenUpdated(_havven);
    }

    /* ========== VIEW FUNCTIONS ========== */

    /* A simple alias to totalVestedAccountBalance: provides ERC20 balance integration. */
    function balanceOf(address account) public view returns (uint) {
        return totalVestedAccountBalance[account];
    }

    /* The number of vesting dates in an account's schedule. */
    function numVestingEntries(address account) public view returns (uint) {
        return vestingSchedules[account].length;
    }

    /* Get a particular schedule entry for an account.
     * The return value is a pair (timestamp, havven quantity) */
    function getVestingScheduleEntry(address account, uint index) public view returns (uint[2]) {
        return vestingSchedules[account][index];
    }

    /* Get the time at which a given schedule entry will vest. */
    function getVestingTime(address account, uint index) public view returns (uint) {
        return vestingSchedules[account][index][0];
    }

    /* Get the quantity of havvens associated with a given schedule entry. */
    function getVestingQuantity(address account, uint index) public view returns (uint) {
        return vestingSchedules[account][index][1];
    }

    /* Obtain the index of the next schedule entry that will vest for a given user. */
    function getNextVestingIndex(address account) public view returns (uint) {
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
    function getNextVestingEntry(address account) external view returns (uint[2]) {
        uint index = getNextVestingIndex(account);
        if (index == numVestingEntries(account)) {
            return [uint(0), 0];
        }
        return getVestingScheduleEntry(account, index);
    }

    /* Obtain the time at which the next schedule entry will vest for a given user. */
    function getNextVestingTime(address account) external view returns (uint) {
        uint index = getNextVestingIndex(account);
        if (index == numVestingEntries(account)) {
            return 0;
        }
        return getVestingTime(account, index);
    }

    /* Obtain the quantity which the next schedule entry will vest for a given user. */
    function getNextVestingQuantity(address account) external view returns (uint) {
        uint index = getNextVestingIndex(account);
        if (index == numVestingEntries(account)) {
            return 0;
        }
        return getVestingQuantity(account, index);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /* Withdraws a quantity of havvens back to the havven contract. */
    function withdrawHavvens(uint quantity) external onlyOwner setupFunction {
        havven.transfer(havven, quantity);
    }

    /* Destroy the vesting information associated with an account. */
    function purgeAccount(address account) external onlyOwner setupFunction {
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
    function appendVestingEntry(
        address account,
        uint time,
        uint quantity
    ) public onlyOwner setupFunction {
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

    /* Construct a vesting schedule to release a quantities of havvens
     * over a series of intervals. Assumes that the quantities are nonzero
     * and that the sequence of timestamps is strictly increasing. */
    function addVestingSchedule(
        address account,
        uint[] times,
        uint[] quantities
    ) external onlyOwner setupFunction {
        for (uint i = 0; i < times.length; i++) {
            appendVestingEntry(account, times[i], quantities[i]);
        }
    }

    /* Allow a user to withdraw any tokens that have vested. */
    function vest() external {
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
            emit Vested(msg.sender, msg.sender, now, total);
        }
    }

    /* ========== EVENTS ========== */

    event HavvenUpdated(address newHavven);

    event Vested(address beneficiary, address indexed beneficiaryIndex, uint time, uint value);
}
