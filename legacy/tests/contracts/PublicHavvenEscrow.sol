/* PublicNomin.sol: expose the internal functions in Nomin
 * for testing purposes.
 */
pragma solidity ^0.4.23;


import "contracts/HavvenEscrow.sol";
import "contracts/Havven.sol";

contract PublicHavvenEscrow is HavvenEscrow {
    using SafeMath for uint;

    constructor(address _owner, Havven _havven)
		HavvenEscrow(_owner, _havven)
		public 
	{
		// Because ganache does not change the timestamp when reverting.
        setupExpiryTime = now + 50000 weeks;
    }

    function addRegularVestingSchedule(address account, uint conclusionTime, uint totalQuantity, uint vestingPeriods)
        external
        onlyOwner
        onlyDuringSetup
    {
        // safeSub prevents a conclusionTime in the past.
        uint totalDuration = conclusionTime.sub(now);

        // safeDiv prevents zero vesting periods.
        uint periodQuantity = totalQuantity.div(vestingPeriods);
        uint periodDuration = totalDuration.div(vestingPeriods);

        // Generate all but the last period.
        for (uint i = 1; i < vestingPeriods; i++) {
            uint periodConclusionTime = now.add(i.mul(periodDuration));
            appendVestingEntry(account, periodConclusionTime, periodQuantity);
        }

        // Generate the final period. Quantities left out due to integer division truncation are incorporated here.
        uint finalPeriodQuantity = totalQuantity.sub(periodQuantity.mul(vestingPeriods - 1));
        appendVestingEntry(account, conclusionTime, finalPeriodQuantity);
    }
}
