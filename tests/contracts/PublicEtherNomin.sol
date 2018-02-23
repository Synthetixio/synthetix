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

	function publicEtherValueAllowStale(uint n) 
		public
		view
		returns (uint)
	{
		return etherValueAllowStale(n);
	}

	function publicSaleProceedsEtherAllowStale(uint n)
		public
		view
		returns (uint)
	{
		return saleProceedsEtherAllowStale(n);
	}

	function debugWithdrawAllEther(address recipient)
		public
	{
		recipient.send(balanceOf(this));
	}
	
	function debugEmptyFeePool()
		public
	{
		state.setFeePool(0);
	}

	function debugFreezeAccount(address target)
		public
	{
		setFrozen(target, true);
	}
}
