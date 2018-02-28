/* PublicEtherNomin.sol: expose the internal functions in EtherNomin
 * for testing purposes.
 */
pragma solidity ^0.4.20;


import "contracts/HavvenEscrow.sol";
import "contracts/Havven.sol";


contract PublicHavvenEscrow is HavvenEscrow {

	function PublicHavvenEscrow(address _owner,
                                Havven _havven)
		HavvenEscrow(_owner, _havven)
		public 
	{
		// Because ganache does not change the timestamp when reverting.
		setupDuration = 50000 weeks;
	}
}
