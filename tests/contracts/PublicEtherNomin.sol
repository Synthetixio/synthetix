/* PublicEtherNomin.sol: expose the internal functions in EtherNomin
 * for testing purposes.
 */
pragma solidity ^0.4.19;

import "contracts/EtherNomin.sol";

contract PublicEtherNomin is EtherNomin {

	function PublicEtherNomin(Havven _havven, address _oracle,
                              address _beneficiary,
                              uint initialEtherPrice,
                              address _owner)
		EtherNomin(_havven, _oracle, _beneficiary, initialEtherPrice, _owner)
		public {}
     
	function publicLastPriceUpdate()
		view
		public
		returns (uint)
	{
		return lastPriceUpdate;
	}

	function publicStalePeriod()
		view
		public
		returns (uint)
	{
    	return stalePeriod;
	}

	function debugWithdrawAllEther(address recipient)
		public
	{
		recipient.send(this.balance);
	}

	function debugFreezeAccount(address target)
		public
	{
		isFrozen[target] = true;
	}
}
