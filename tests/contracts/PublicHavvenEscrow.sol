/* PublicNomin.sol: expose the internal functions in Nomin
 * for testing purposes.
 */
pragma solidity ^0.4.23;


import "contracts/HavvenEscrow.sol";
import "contracts/Havven.sol";


contract PublicHavvenEscrow is HavvenEscrow {

	constructor(address _owner, Havven _havven)
		HavvenEscrow(_owner, _havven)
		public 
	{
		// Because ganache does not change the timestamp when reverting.
		setupExpiryTime = now + 50000 weeks;
	}

    function addRegularVestingSchedule(address account, uint conclusionTime,
                                       uint totalQuantity, uint vestingPeriods)
        external
        onlyOwner
        onlyDuringSetup
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

}
