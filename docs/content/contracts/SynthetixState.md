# SynthetixState

This is a state contract associated with the main [`Synthetix`](Synthetix.md) contract, which is the only address permitted to invoke most of its functionality.

This contract is responsible for recording issuance and debt information for the system and users within it, as well as the global [issuance ratio](#issuanceratio).

Upon system updates, this contract will continue to exist, while the Synthetix logic itself is swapped out.

!!! danger "Disabled: Preferred Currency Transfer Conversion"

    This contract also contains functionality enabling automatic [preferred currency](#preferredcurrency) conversion on Synth transfers, but it is currently disabled.

**Source:** [SynthetixState.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/SynthetixState.sol)

## Architecture

---

### Inheritance Graph

<centered-image>
    ![SynthetixState inheritance graph](../img/graphs/SynthetixState.svg)
</centered-image>

---

### Related Contracts

- Synthetix as this contract's `State.associatedContract`

---

### Libraries

- [`SafeDecimalMath`](SafeDecimalMath.md) for `uint`
- [`SafeMath`](SafeMath.md) for `uint`

---

## Structs

---

### IssuanceData

Individual wallets have an issuance data object associated with their address.
This holds the issuance state and preferred currency of users in the Synthetix system, which is used to compute user's exit price and collateralisation ratio.

| Field                | Type   | Description                                                                                                                                                      |
| -------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| initialDebtOwnership | `uint` | The percentage of the total system debt owned by the address associated with this entry at the time of issuance.                                                 |
| debtEntryIndex       | `uint` | The [debt ledger](SynthetixState.md#debtledger) index when this user last issued or destroyed tokens. That is, the length of the ledger at the time of issuance. |

This struct is replicated in the [`FeePoolState`](FeePoolState.md#issuancedata) contract.

---

## Variables

---

### `issuanceData`

The most recent issuance data for each address.

**Type:** `mapping(address => IssuanceData) public`

---

### `totalIssuerCount`

The number of people with outstanding synths.

**Type:** `uint public`

---

### `debtLedger`

A list of factors indicating, for each [debt-modifying event](#appenddebtledgervalue), what effect it had on the percentage of debt of all other holders. Later debt ledger entries correspond to more recent issuance events.

**Type:** `uint[] public`

---

### `importedXDRAmount`

The XDR-equivalent debt of `sUSD` imported which was outstanding immediately before the multicurrency transition.

**Type:** `uint public`

---

### `issuanceRatio`

The current global issuance ratio, which is the conversion factor between a value of SNX and the value of synths issued against them. As a result this determines the maximum ratio between the total value of Synths and SNX in the system.

It is also the target ratio for SNX stakers. As per the logic in [`FeePool.feesClaimable`](FeePool.md#feesclaimable), stakers can only claim any fee rewards if they are within ten percent of the issuance ratio. Therefore altering it will also alter the maximum total supply of Synths, as suppliers of Synths are strongly incentivised to track the issuance ratio closely.

If the issuance ratio is $\rho$, then the [maximum value](Synthetix.md#maxissuablesynths) $V_s$ of a synth $s$ [issuable](Synthetix.md#issuesynths) against a value $V_c$ of SNX collateral is just:

$$
V_s = \rho \ V_c
$$

Given that currency is worth its price times its quantity ($V_x = \pi_x \ Q_x$), we have:

$$
\pi_s \ Q_s = \rho \ \pi_c \ Q_c
$$

This implies that the quantity of synths received upon issuance is the quantity of collateral staked, multiplied by the issuance ratio and the ratio between the collateral and synth prices.

$$
Q_s = \rho \ \frac{\pi_c}{\pi_s} \ Q_c
$$

As a result of this calculation, the number of synths that can be issued increases as the SNX price increases, but decreases as the synth price increases. Since neither market prices nor synth supply can be controlled directly, the remaining parameter, the issuance ratio, is an important way of affecting these quantities.

???+ info "The Issuance Ratio as a Macro-Economic Lever"

    Tweaking the issuance ratio is an effective means of altering the total synth supply, and therefore its price.

    In cases where Synths are oversupplied, there is downward price pressure and decreased stability. Decreasing the issuance ratio both constrains the total supply of Synths circulating in the system, and transiently increases aggregate demand for Synths as every staker must rebuy a quantity of Synths and burn them.

    For precisely these reasons the issuance ratio was altered by [SCCP-2](https://sips.synthetix.io/sccp/sccp-2) from its initial value of $\frac{1}{5}$ to $\frac{2}{15}$.

    The related case of increasing the issuance ratio is similar.

**Type:** `uint public`

---

### `MAX_ISSUANCE_RATIO`

Constraining the value of [`issuanceRatio`](#issuanceratio) to be less than $1.0$ ensures that Synthetix does not become a fractional reserve system.

**Type:** `uint constant`

**Value:** `UNIT`

---

### `preferredCurrency`

!!! danger "Disabled"

    This feature is currently dormant. It can still operate, but the [`Synthetix`](Synthetix.md) contract does not expose any means for an account's preferred currency to actually be set, so it never operates.

If users nominate a preferred currency, all synths they receive will be converted to this currency. This mapping stores the nominated preferred currency for each account, if any. A null preferred currency means no conversion will be performed.

This is used within [`Synth._internalTransfer`](Synth.md#_internaltransfer).

**Type:** `mapping(address => bytes4) public`

!!! caution "Short Currency Keys"

    Note that as of [SIP-17](https://sips.synthetix.io/sips/sip-17) currency keys in other contracts are of the `bytes32` type. This means that if this preferred currency component is ever reused, it will only be able to support short-named synths unless new storage is provided.

---

## Functions

---

### `constructor`

Initialises the inherited [`State`](State.md) and [`LimitedSetup`](LimitedSetup.md) instances.

??? example "Details"

    **Signature**

    `constructor(address _owner, address _associatedContract) public`

    **Superconstructors**

    * [`State(_owner, _associatedContract)`](State.md#constructor)
    * [`LimitedSetup(1 weeks)`](LimitedSetup.md#constructor)

---

### `setCurrentIssuanceData`

Allows the [`Synthetix`](Synthetix.md) contract to update the debt ownership entry for this account and sets their debt entry index to the current length of the [`debtLedger`](#debtledger).
The debt ledger itself is not modified.

??? example "Details"

    **Signature**

    `setCurrentIssuanceData(address account, uint initialDebtOwnership) external`

    **Modifiers**

    * [`State.onlyAssociatedContract`](State.md#onlyassociatedcontract)

---

### `clearIssuanceData`

Deletes the issuance data associated with a given account.

??? example "Details"

    **Signature**

    `clearIssuanceData(address account) external`

    **Modifiers**

    * [`State.onlyAssociatedContract`](State.md#onlyassociatedcontract)

---

### `incrementTotalIssuerCount`

Increases [`totalIssuerCount`](#totalissuercount) by one. This is called within [`Synthetix._addToDebtRegister`](Synthetix.md#_addtodebtregister) whenever an account with no outstanding issuance debt mints new Synths.

??? example "Details"

    **Signature**

    `incrementTotalIssuerCount() external`

    **Modifiers**

    * [`State.onlyAssociatedContract`](State.md#onlyassociatedcontract)

---

### `decrementTotalIssuerCount`

Reduces [`totalIssuerCount`](#totalissuercount) by one. This is called within [`Synthetix._removeFromDebtRegister`](Synthetix.md#_removefromdebtregister) whenever an issuer burns enough Synths to pay down their entire outstanding debt.

??? example "Details"

    **Signature**

    `decrementTotalIssuerCount() external`

    **Modifiers**

    * [`State.onlyAssociatedContract`](State.md#onlyassociatedcontract)

---

### `appendDebtLedgerValue`

Pushes a new value to the end of the [`debtLedger`](#debtledger).

This is used by [`Synthetix._addToDebtRegister`](Synthetix.md#addtodebtregister) contract whenever Synths are issued or burnt, which modifies the total outstanding system debt.

??? example "Details"

    **Signature**

    `appendDebtLedgerValue(uint value) external`

    **Modifiers**

    * [`State.onlyAssociatedContract`](State.md#onlyassociatedcontract)

---

### `setPreferredCurrency`

!!! danger "Disabled"

    This function is not used anywhere within the [`Synthetix`](Synthetix.md) contract, which is the only address with the privileges to call it. As a result the preferred currency feature is not operational.

Sets the preferred currency for a particular account. Pass in null to unset this value.

??? example "Details"

    **Signature**

    `setPreferredCurrency(address account, bytes4 currencyKey) external`

    **Modifiers**

    * [`State.onlyAssociatedContract`](State.md#onlyassociatedcontract)

---

### `setIssuanceRatio`

Allows the owner to set the Synth [issuance ratio](#issuanceratio), but disallows setting it higher than $1.0$, which prevents more than one dollar worth of Synths being issued against each dollar of SNX backing them.

??? example "Details"

    **Signature**

    setIssuanceRatio(uint _issuanceRatio) external`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)

    **Preconditions**

    * `_issuanceRatio` cannot exceed [`MAX_ISSUANCE_RATIO`](#max_issuance_ratio), which is set to `1.0`.

    **Emits**

    * [`IssuanceRatioUpdated(_issuanceRatio)`](#issuanceratioupdated)

---

### `importIssuerData`

!!! danger "Disabled"

    This function only operated during the one week [setup period](LimitedSetup.md).

This function allowed the owner to migrate sUSD issuance data during the launch of multiple Synth flavours. It simply calls [`_addToDebtRegister`](#_addtodebtregister) in a loop.

??? example "Details"

    **Signature**

    `importIssuerData(address[] accounts, uint[] sUSDAmounts) external`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)
    * [`LimitedSetup.onlyDuringSetup`](LimitedSetup.md#onlyduringsetup)

    **Preconditions**

    * The `XDR` price [must not be stale](ExchangeRates.md#rateisstale).

---

### `_addToDebtRegister(address account, uint amount)`

!!! danger "Disabled"

    This function is only called from [`importIssuerData`](#importissuerdata), which only operated during the one week [setup period](LimitedSetup.md).

This utility function allows adds a new entry to the debt register to set up staker debt holdings when migrating from the previous Synthetix version.
It duplicates the logic of [`Synthetix._addToDebtRegister`](Synthetix.md#_addtodebtregister) with some minor modifications to keep track of how much [debt has been imported](#importedxdramount).

??? example "Details"

    **Signature**

    `_addToDebtRegister(address account, uint amount) internal`

---

### `debtLedgerLength`

Returns the number of entries currently in [`debtLedger`](#debtledger).

Primarily used in [`FeePool`](FeePool.md) for fee period computations.

??? example "Details"

    **Signature**

    `debtLedgerLength() external view returns (uint)`

---

### `lastDebtLedgerEntry`

Returns the most recent [`debtLedger`](#debtledger) entry.

Primarily used in the [`Synthetix`](Synthetix.md) for debt computations.

??? example "Details"

    **Signature**

    `lastDebtLedgerEntry() external view returns (uint)`

---

### `hasIssued`

Returns true if a given account has any outstanding issuance debt resulting from Synth minting.

Used in [`Synthetix._addToDebtRegister`](Synthetix.md#_addtodebtregister) to determine whether an minting event requires incrementing the total issuer count.

??? example "Details"

    **Signature**

    `hasIssued(address account) external view returns (uint)`

---

## Events

---

### `IssuanceRatioUpdated`

Records that the [issuance ratio](#issuanceratio) was modified.

**Signature:** `IssuanceRatioUpdated(uint newRatio)`

---
