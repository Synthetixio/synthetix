import "contracts/SafeDecimalMath.sol";
import "contracts/Owned.sol";
import "contracts/Havven.sol";
import "contracts/EtherNomin.sol";

pragma solidity ^0.4.19;

contract HavvenEscrow is Owned, SafeDecimalMath {	
	// The corresponding Havven contract.
	Havven public havven;
	EtherNomin public nomin;

	// Lists of vesting dates per account, in sorted order.
	mapping(address => uint[]) public vestingTimes;

	// Number of vesting dates.
	mapping(address => uint) public numTimes;

	// A mapping from time stamps to the quantity of tokens that vests at those times for a given account.
	mapping(address => mapping(uint => uint)) public vestingQuantities;

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

	function feePool()
		public
		view
		returns (uint)
	{
		return nomin.balanceOf(this);
	}

	function sweepFees()
		public
		onlyOwner
	{
		nomin.transfer(owner, feePool());
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

		uint entitlement = safeDecMul(feePool(), safeDecDiv(totalVestedAccountBalance[msg.sender], totalVestedBalance));
		nomin.transfer(msg.sender, entitlement);
	}

	function purgeAccount(address account)
		onlyOwner
		public
	{
		for (uint i = 0; i < numTimes[account]; i++) {
			vestingQuantities[account][vestingTimes[account][i]] = 0;
			vestingTimes[account][i] = 0;
		}
		numTimes[account] = 0;
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

	/* A call to this should be accompanied by a corresponding call to havven.endow(),
	 * to provide the balance that can be withdrawn make sure there's enough balance. 
	 * Note that although this function could technically be used to produce unbounded
	 * arrays, it's only in the foundation's command to add to these lists. */
	function addNewVestedQuantity(address account, uint time, uint quantity)
		onlyOwner
		public
	{
		if (numTimes[account] == 0) {
			vestingTimes[account][0] = time;
			numTimes[account] = 1;
			vestingQuantities[account][time] = quantity;
			totalVestedAccountBalance[account] = quantity;
			totalVestedBalance = safeAdd(totalVestedBalance, quantity);
			return; 
		}

		// Disallow adding new vested havvens in the past
		// Since entries are only appended, no vesting date can be repeated.
		require(vestingTimes[account][numTimes[account]-1] < time);

		vestingTimes[account][numTimes[account]] = time;
		numTimes[account]++;
		vestingQuantities[account][time] = quantity;
		totalVestedAccountBalance[account] = safeAdd(totalVestedAccountBalance[account], quantity);
		totalVestedBalance = safeAdd(totalVestedBalance, quantity);
	}

	/* Withdraw any tokens that have vested. */
	function vest() 
		public
		returns (uint)
	{
		uint total = 0;
		for (uint i = 0; i < numTimes[msg.sender]; i++) {
			uint time = vestingTimes[msg.sender][i];
			// The list is sorted; when we reach the first future time, bail out.
			if (time > now) {
				break;
			}
			uint qty = vestingQuantities[msg.sender][time];
			if (qty == 0) {
				continue;
			}

			vestingTimes[msg.sender][i] = 0;
			vestingQuantities[msg.sender][time] = 0;
			total = safeAdd(total, qty);
			totalVestedAccountBalance[msg.sender] = safeSub(totalVestedAccountBalance[msg.sender], qty);
		}
		totalVestedBalance = safeSub(totalVestedBalance, total);
		return total;
	}


}