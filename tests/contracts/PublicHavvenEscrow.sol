/* PublicEtherNomin.sol: expose the internal functions in EtherNomin
 * for testing purposes.
 */
pragma solidity ^0.4.19;


import "contracts/HavvenEscrow.sol";
import "contracts/Havven.sol";
import "contracts/EtherNomin.sol";


contract PublicHavvenEscrow is HavvenEscrow {

	function PublicHavvenEscrow(address _owner,
                                Havven _havven,
                                EtherNomin _nomin)
		HavvenEscrow(_owner, _havven, _nomin)
		public 
	{
		// Because ganache does not change the timestamp when reverting.
		setupDuration = 50000 weeks;
	}
}
