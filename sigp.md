# Sigma Prime Audit Response #

## Introduction ##
In this document, we respond to the issues raised in Sigma Prime's initial audit of Havven. 

### ERC20 Implementation ###

1. Initial creation of ERC20FeeToken and ERC20Token do not fire the transfer event with the 0x0 address as the sender

- STATUS: Clarify what to do here regarding ERC20State.

2. Decimals variable is of type uint256, not the specified uint8 (SafeDecimalMath.sol[38])

- STATUS: Fixed.

### Recommendations ###

#### High ####

1. Vote Manipulation via Improper Variable Resetting

- STATUS: Fixed. Motions are now indexed.

2. Inaccurate Vote Calculation due to Outdated Average Balance

- STATUS: Fixed. The `setupVote()` function now ensures that voter's weight is current [Havven.sol:392].

3. Token Wrapping Prevention Bypass

- STATUS: 

4. Arbitrary Dependednt Contract Address Modification

- STATUS:

#### Moderate ####

1. Inactive Owner Leading to User Fund Lockups

- STATUS:

#### Low ####

1. Insufficient Hardening of Contract Ownership Transfer

- STATUS: Fixed. Have implemented claimable ownership pattern.

2. Insufficient Receipient Address Validation

- STATUS: Fixed. Have implemented requirement that `_to_ NOT 0x0 in transfer()` and both `_to_ AND _from_ NOT 0x0 in transferFrom`.

3. Insufficient Transfer Fee Rate Validation

- STATUS: Not implemented.

4. Duplicate Event Call

- STATUS:

5. Lack of Vesting Periods Validation

- STATUS: IN PROGRESS

#### General Suggestions ####

##### SafeDecimalMath #####

1. Assert vs Require

- STATUS: Not implemented. Why consume all gas if we don't need to?

##### Court #####

1. Havven and Nomin addresses not public.

- STATUS: Fixed.

2. Court prefix not required [266, 512, 513]

- STATUS: Fixed.

##### EtherNomin #####

1. Does not need to import Havven.sol and cast can be removed from constructor [62, 123]

- STATUS: Fixed.

2. Variable naming in parameter could be changed from wei to eth [193]

- STATUS: In Fixed. 

3. Inconsistent variable naming in parameters initialEtherPrice should be `_initialEtherPrice_`

- STATUS: Not implemented. `_` only used when referencing variable name that is the same as the parameter.

4. Make variables public [87, 90, 94]

- STATUS: Not implemented. Constant variables cannot be modified and their values can be checked with source code.

5. Make it very clear that variables should be supplied as multiples of UNIT.

- STATUS: ???

6. It may be prudent to allow any address to call terminateLiquidation().

- STATUS: Not implemented.

##### Havven #####

1. Does not need to import Court.sol

- STATUS: Fixed.

2. LastAverageBalance and penultimateAverageBalance are public and would quite frequently be out-of-date, misleading.

- STATUS: Not implemented. Court relies on accessing these variables. Added warning to documentation that they may be out of date.

##### ERC20FeeToken #####

1. Use of uint256 in contrast to otherwise consistent unit usage [36].

- STATUS: ???

### Potential Attacks ###

1. Owner Forcing Users to Run Arbitrary Code
2. Accumulating Votes to Protect a Token Wrapper Contract.
3. Locking Users Votes.
4. Accumulating Votes from Stale Balances.
5. Token Wrapper Avoiding the Court Mechanism.

### Owner Account Privileges ###

#### Direct ####

##### EtherNomin #####

1. Owner can set oracle, court and beneficiary addresses.
2. Owner can set an arbitrary pool fee rate, from 0 - 100%
3. Owner can burn any amount of nomins if they exist.
4. Owner can force the liquidation of nomin contract at anytime.
5. Owner can set the stale period to an arbitrary value.

##### Court #####

1. Owner can set an arbitrary minStandingBalance (can prevent anyone from starting motions).
2. Owner can set votingPeriod, confirmationPeriod, requiredParticipation, requiredMajority (effectively controls all dynamics).

##### Havven #####

1. Owner can set nomin and escrow contract to any arbitrary address.
2. Owner distributes all havvens that initially come into existence.
3. Owner can set the targetFeePeriodDurationSeconds variable.

##### HavvenEscrow #####

1. Owner can set the havven and nomin contract addresses to any arbitrary address at anytime.
2. Owner can delete any vesting account balance and remove them from the contract at anytime without restriction.
3. Owner can add any account to the escrow contract with any balance (irrespective of havvens in existence or currently in the contract).

#### Indirect ####

##### EtherNomin #####

1. confiscateBalance(): Owner can confiscate anyone's nomins at will and freeze their accounts. The function checks
msg.sender == court. Since the owner can arbitrarily change court, they can easily create a wrapper.
2. updatePrice(): Owner can set any arbitrary price for nomins. They may change oracle to any address and therefore set the price to any value.
to any arbitrary value.
3. issue(): Owner can create nomins at manipulated prices. This function allows nomins to be created provided a collateralisation ratio is maintained. As the owner can adjust the etherPrice at will, they can adjust the collateralisation ratio to manipulate the cost of issuing nomins.
4. buy(): Owner can prevent any users from purchasing nomins at anytime. This can be achieved by setting the stalePeriod to a very large value or by forcing liquidation.
5. withdrawFee(): The owner can withdraw any fees from the nomin contract at anytime. The owner can change the feeAuthority variable which is the only requirement of this function. 

##### Havven #####

1. The owner can prevent any individual user or all users from withdrawing any fees, and force users to run arbitrary code. This is done by changing the nomin contract address to a malicious address.

##### Court #####

1. Owner can pass or fail any confiscation motion. the owner can adjust the havven contract which specifies the weight for votes. Thw owner can give themselves arbitrary high votes and everyone else nothing, by replacing havven with a malicious contrat.
2. Owner can prevent any specific or all confiscation motions. By maniupulating the havven address the owner can fail this requirement for specific or all users.
3. Thw owner can get users to run arbitrary code when they call beginConfiscationMotion by replacting either nomin or havven with a malicious contract address.

##### HavvenEscrow #####

1. feePool(): Owner can set feePool variable to any arbitrary number. As feePool returns nomin.balanceOf(this), and the owner can change nomin to any address, the owner can create a contract with a function balanceOf that returns any value. Owner then sets nomin to this contract to specifiy any feePool() they wish.
2. remitFees(): Owner can remit fees of the HavvenEscrow contract. The owner can set the havven address to any address and as such can create a wrapper contract to pass the single requirement.
3. remitFees(): Owner can get users to run arbitrary code and create attacks external to the Havven system for users. Owner can set nomin to an arbitrary (malicious) contract such that when a user runs remitFees, nomin.donateToFeePool() runs arbitrary malicious code.
4. withdrawFees(): Owner can prevent all users from withdrawing their fees. If the owner hasn't withdrawn in the last period, this function will throw as only the owner can call withdrawFeePool().
5. Owner can arbitrarily specify any individual users or all user's shares and entitlements in the HavvenEscrow contract. The entitlement a participant has is calculated by referencing an external contract which can be arbitrarily changed by the owner and hence the owner can set this value arbitrarily.

### Gas Information ###

#### Gas Reduction Changes ####

##### Variable Initilisation #####

1. ERC20FeeToken[53]
2. EtherNomin[81]
3. HavvenEscrow[299]

##### Delete keyword #####

1. Court[356-357,441,449,459-461, 475-477,488-490]
2. HavvenEscrow[236]
3. Havven[380, 381]
4. EtherNomin[559, 571]

##### Other #####

1. Court[363]: This function can be set to a view function which will save gas.
2. Court[441]: This line serves no purpose and can be removed to save gas.
3. ERC20FeeToken[151-153] & ERC20Token[84-86]: These lines add gas for every non-zero transaction. Can be removed.
4. SafeDecimalMath: Safe functions call other checking functions, such as addIsSafe. Gas overhead in calling other functions, writing as single function reduces gas costs.
