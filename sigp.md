# Sigma Prime Mid Audit Update #
The purpose of this document is twofold:
1. Describe the upgradeability work since the audit began.
2. Respond to the issues raised in Sigma Prime's initial audit of Havven.

## 1. Upgradeability ##

Since the audit began, the primary focus has been on rearchitecting the contracts so that the system is upgradeable. We have decided to use a proxy contract which handles all interactions with the `Havven` and `EtherNomin` contract. We have also decided to factor out balances from the ERC20 implementations.

### 1.1 New Files ###

1. Proxy.sol
2. ERC20State.sol
3. ERC20FeeState.sol

### 1.2 Proxy ###

<< Description >>

### 1.3 ERC20State and ERC20FeeState ###

<< Description >>

## 2. Initial Audit Response ##

In this section, we respond to the recommendations made in the Havven audit. They appear in the same order as the audit. Where we have not implemented a suggested change, there is a note outlining the rationale.

### 2.1 ERC20 Implementation ###

###### 1. Initial creation of ERC20FeeToken and ERC20Token do not fire the transfer event with the 0x0 address as the sender ######
Fixed: Firing the transfer event on creation of state in ERC20Token, not in ERC20FeeToken - since no tokens are created initially.
###### 2. Decimals variable is of type uint256, not the specified uint8 (SafeDecimalMath.sol[38]) ######
Fixed: This suggestion has been implemented.

### 2.2 Recommendations ###

#### 2.2.1 High ####

###### 1. Vote Manipulation via Improper Variable Resetting ######
Fixed: Motions are now indexed so this type of attack is now infeasable.
###### 2. Inaccurate Vote Calculation due to Outdated Average Balance ######
Fixed: Crrent vote weight is ensured by recomputing before vote is made.
###### 3. Token Wrapping Prevention Bypass ######
Not implemented: The suggested fix (immediate freezing of havvens) has not been implemented at this stage.
###### 4. Arbitrary Dependednt Contract Address Modification ######
Not implemented: We are comfortable with the levle of control granted to Owner.

#### 2.2.2 Moderate ####

###### 1. Inactive Owner Leading to User Fund Lockups ######
Fixed: The `withdrawFees()` function is now callable by anyone HavvenEscrow[227].

#### 2.2.3 Low ####

###### 1. Insufficient Hardening of Contract Ownership Transfer ######
Fixed: Implemented Claimable.
###### 2. Fixed: Insufficient Receipient Address Validation ######
Fixed: No 0x0 allowed in `_to` or `_from` in both transfer and transferFrom.
###### 3. Insufficient Transfer Fee Rate Validation ######
Not Implemented: There are other occurences such as in Court - we have decided to remain consistent.
###### 4. Duplicate Event Call ######
Fixed: The change made to HavvenEscrow[227] removes the duplication of events.
###### 5. Lack of Vesting Periods Validation ######
Fixed: TotalVestedBalance must be <= havvens in escrow contract.

### 3. General Suggestions ###

#### 3.1 SafeDecimalMath ####

###### 1. Assert vs Require ######
Not Implemented: We have decided against implementing assert due to the extra gas costs associated.

#### 3.2 Court ####

###### 1. Havven and Nomin addresses not public ######
Fixed: These variables are now public.
###### 2. Court prefix not required [266, 512, 513] ######
Fixed: Have been removed.

#### 3.3 EtherNomin ####

###### 1. Does not need to import Havven.sol and cast can be removed from constructor [62, 123] ######
Fixed: Removed.
###### 2. Variable naming in parameter could be changed from wei to eth [193] ######
Fixed: Have implemented suffix `_dec` to variables which are fixed point values.
###### 3. Inconsistent variable naming in parameters initialEtherPrice should be `_initialEtherPrice_` ######
Not Implemented: `_` only used when parameter name is the same as variable name.
###### 4. Make variables public [87, 90, 94] ######
Not Implemented: tba.
###### 5. Make it very clear that variables should be supplied as multiples of UNIT ######
Fixed: All fixed point variables now carry the suffix `_dec`.
###### 6. It may be prudent to allow any address to call terminateLiquidation() ######
Not Implemented: We do not want any user other than Owner to be able to call `terminateLiquidation()`

#### 3.4 Havven ####

###### 1. Does not need to import Court.sol ######
Fixed:
###### 2. LastAverageBalance and penultimateAverageBalance are public and would quite frequently be out-of-date, misleading ######
Not implemented: added warning in comments.

#### 3.5 ERC20FeeToken ####

###### 1. Use of uint256 in contrast to otherwise consistent unit usage [36] ######
Not implemented: Can't find this.

### 4. Owner Account Privileges ###

We understand that there are a significant number of direct and indirect priveleges for the Owner account. We are comfortable with the level of control in this version of Havven. In future, upgraded versions of the contracts will gradually relinquish control.
