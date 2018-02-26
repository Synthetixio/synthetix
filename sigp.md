# Sigma Prime Mid Audit Update #

## Introduction ##
The purpose of this document is twofold:
1. Outline the work done on upgradeability.
2. Respond to the issues raised in Sigma Prime's initial audit of Havven.

## 1. Upgradeability ##

Since the audit began, the primary focus has been on rearchitecting the contracts so that the system is fully upgradeable. We have decided to use proxy contracts.

### New Files ###

1. ERC20State.sol
2. ERC20FeeState.sol
3. Proxy.sol

### ERC20State and ERC20FeeState ###

<< Anton >>

### Proxy ###

<< Anton >>

## 2. Initial Audit Response ##

In this section, we provide responses to the Havven-Audit. They are structured in the order they appear in the audit. Where we have not implemented a suggested change, there is a note describing the rationale.

### ERC20 Implementation ###

###### 1. Initial creation of ERC20FeeToken and ERC20Token do not fire the transfer event with the 0x0 address as the sender ######
Fixed - Firing the transfer event on creation of token state in ERC20, not ERC20Fee (since 0 tokens initially).
###### 2. Decimals variable is of type uint256, not the specified uint8 (SafeDecimalMath.sol[38]) ######
Fixed

### Recommendations ###

#### High ####

###### 1. Vote Manipulation via Improper Variable Resetting ######
Fixed - motions indexed.
###### 2. Inaccurate Vote Calculation due to Outdated Average Balance ######
Fixed - current weight ensured.
###### 3. Token Wrapping Prevention Bypass ######
Not implemented - tba
###### 4. Arbitrary Dependednt Contract Address Modification ######
Not implemented - tba.

#### Moderate ####

###### 1. Inactive Owner Leading to User Fund Lockups ######
Fixed - HavvenEscrow[227]

#### Low ####

###### 1. Insufficient Hardening of Contract Ownership Transfer ######
Fixed - Implemented Claimable.
###### 2. Fixed: Insufficient Receipient Address Validation ######
Fixed - No 0x0 allowed in `_to` or `_from` in both transfer and transferFrom.
###### 3. Insufficient Transfer Fee Rate Validation ######
Not Implemented.
###### 4. Duplicate Event Call ######
Fixed - No longer duplicating event.
###### 5. Lack of Vesting Periods Validation ######
Fixed - TotalVestedBalance must be <= havvens in escrow contract.

#### General Suggestions ####

##### SafeDecimalMath #####

###### 1. Assert vs Require ######
Not Implemented - extra gas costs.

##### Court #####

###### 1. Havven and Nomin addresses not public ######
Fixed.
###### 2. Court prefix not required [266, 512, 513] ######
Fixed.

##### EtherNomin #####

###### 1. Does not need to import Havven.sol and cast can be removed from constructor [62, 123] ######
Fixed.
###### 2. Variable naming in parameter could be changed from wei to eth [193] ######
Fixed - Have implemented suffix `_dec` to variables which are fixed point values.
###### 3. Inconsistent variable naming in parameters initialEtherPrice should be `_initialEtherPrice_` ######
Not Implemented - `_` only used when parameter name is the same as variable name.
###### 4. Make variables public [87, 90, 94] ######
Not Implemented - tba.
###### 5. Make it very clear that variables should be supplied as multiples of UNIT ######
Progress.
###### 6. It may be prudent to allow any address to call terminateLiquidation() ######
Not Implemented - tba.

##### Havven #####

###### 1. Does not need to import Court.sol ######
Fixed.
###### 2. LastAverageBalance and penultimateAverageBalance are public and would quite frequently be out-of-date, misleading ######
Not implemented - added warning in comments.

##### ERC20FeeToken #####

###### 1. Use of uint256 in contrast to otherwise consistent unit usage [36] ######
Not implemented - Can't find this.

### Owner Account Privileges ###

We understand that there are a significant number of direct and indirect priveleges for the Owner account. We are comfortable with the level of control in this version of Havven. In future, upgraded versions of the contracts will gradually relinquish control.