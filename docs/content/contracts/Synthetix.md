# Synthetix

## Description

**Source:** [Synthetix.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/Synthetix.sol)

## Architecture

---

### Inheritance Graph

<centered-image>
    ![Synthetix inheritance graph](../img/graphs/Synthetix.svg)
</centered-image>

---

### Related Contracts

<centered-image>
    ![Synthetix architture graph](../img/graphs/Synthetix-architecture.svg)
</centered-image>

??? example "Details"

    - [`Proxy`](Proxy.md): The Synthetix contract, which is [`Proxyable`](Proxyable.md), exists behind a `CALL`-style proxy for upgradeability.
    - [`Synth`](Synth.md): Synthetix manages the supply of synths. It keeps track of which ones exist, and they are all issued and burnt from the Synthetix contract. The Synthetix contract is also responsible for exchange between different synth flavours.
    - [`FeePool`](FeePool.md): The Synthetix contract remits exchange fees as sUSD to the fee pool, and also uses it to keep track of historical issuance records for each issuer.
    - [`SynthetixEscrow`](SynthetixEscrow.md): The escrow contract keeps track of SNX owed to participants in the initial token sale, and releases them according to specified vesting schedules.
    - [`RewardEscrow`](RewardEscrow.md): This is similar to the SynthetixEscrow contract, but it is where the SNX inflationary supply is kept before it is released to Synth issuers.
    - [`RewardsDistribution`](RewardsDistribution): This contract works closely with RewardEscrow to release portions of the inflationary supply to different recipients.
    - [`ExchangeRates`](ExchangeRates.md): The Synthetix contract fetches prices from the exchange rates contract to facilitate synth exchange and to determine the value of various quantities of synths.
    - [`SynthetixState`](SynthetixState.md): This state contract stores the debt ledger and the current issuance information for synth issuers.
    - [`SupplySchedule`](SupplySchedule.md): The supply schedule determines the rate at which SNX are released from the inflationary supply.
    - [`Depot`](Depot.md): The depot trades SNX and therefore knows the Synthetix address. \* [`ArbRewarder`](ArbRewarder.md): The ArbRewarder knows the Synthetix address because it exchanges SNX.

---

## Constants

---

### `TOKEN_NAME`

A constant used to initialise the ERC20 [`ExternStateToken.name`](ExternStateToken.md#name) field upon construction.

**Type:** `string constant`

**Value:** `"Synthetix Network Token"`

---

### `TOKEN_SYMBOL`

A constant used to initialise the ERC20 [`ExternStateToken.symbol`](ExternStateToken.md#symbol) field upon construction.

**Type:** `string constant`

**Value:** `"SNX"`

---

### `DECIMALS`

A constant used to initialise the ERC20 [`ExternStateToken.decimals`](ExternStateToken.md#decimals) field upon construction.

**Type:** `uint8 constant`

**Value:** `18`

---

## Variables

---

### `availableSynths`

List of the active [`Synths`](Synth.md). Used to compute the total value of issued synths.

**Type:** `Synth[] public`

---

### `escrow`

The [`SynthetixEscrow`](SynthetixEscrow.md) contract where Synths escrowed at the time of the original token sale are kept.

**Type:** `SynthetixEscrow public`

---

### `exchangeEnabled`

Allows the contract owner to disable synth exchanges, for example during system upgrades.

**Type:** `bool public`

---

### `exchangeRates`

The [`ExchangeRates`](ExchangeRates.md) contract provides Synth (and inverse Synth) prices, for example to convert between Synths or to compute the total system value. [`ExchangeRates`](ExchangeRates.md) also possesses the capability to disable Synth exchanges while its prices are being updated by the [`oracle`](ExchangeRates.md#oracle).

**Type:** `ExchangeRates public`

---

### `feePool`

The address of the [`FeePool`](FeePool.md) contract, where exchange fees are deposited, and user issuance information is stored.

**Type:** `FeePool public`

---

### `protectionCircuit`

When the protection circuit is activated, any [Synth exchanges](#exchange) will result in the input quantity to be [liquidated](#_internalliquidation).

This mechanism, which can only be [activated](#setprotectioncircuit) by the [oracle](ExchangeRates.md#oracle), is designed to discourage profitable front-running of price updates. The oracle, when it detects front-running, targets the relevant transaction for liquidation by activating the protection circuit and deactivating it once triggered.

See [SIP-6](https://sips.synthetix.io/sips/sip-6) and [SIP-7](https://sips.synthetix.io/sips/sip-7) for further details.

**Type:** `bool private`

---

### `rewardsDistribution`

The [`RewardsDistribution`](RewardsDistribution.md) contract works in concert with the [`RewardsEscrow`](#rewardsescrow) contract mentioned above to direct inflationary SNX rewards to various recipient pools the protocol specifies.

**Type:** `RewardsDistribution public`

---

### `rewardEscrow`

The [`RewardEscrow`](RewardEscrow.md) contract, where SNX inflationary rewards are held in escrow for a year after they are claimed.

**Type:** `RewardEscrow public`

---

### `synthetixState`

The [`SynthetixState`](SynthetixState.md) contract holds a number of vital records including the [debt ledger](SynthetixState.md#debtledger), the [current issuance data for each account](SynthetixState.md#issuancedata), and the [global target issuance ratio](SynthetixState.md#issuanceratio).

**Type:** `SynthetixState public`

---

### `synths`

A mapping from currency keys (three letter descriptors) to [`Synth`](Synth.md) token contract addresses.

**Type:** `mapping(bytes32 => Synth) public`

---

### `supplySchedule`

The [`SupplySchedule`](SupplySchedule.md) governs the rate at which inflationary SNX rewards are released. Whenever [new tokens are minted](#mint), it ensures the total created so far comports with its annual schedule.

**Type:** `SupplySchedule public`

---

## Constructor

---

The constructor initialises the various addresses that this contract knows about, as well as the inherited [`ExternStateToken`](ExternStateToken.md) instance.

??? example "Details"

    **Signature**

    `constructor(address _proxy, TokenState _tokenState, SynthetixState _synthetixState, address _owner, ExchangeRates _exchangeRates, FeePool _feePool, SupplySchedule _supplySchedule, SynthetixEscrow _rewardEscrow, SynthetixEscrow _escrow, RewardsDistribution _rewardsDistribution, uint _totalSupply) public`

    **Superconstructors**

    * [`ExternStateToken(_proxy, _tokenState, TOKEN_NAME, TOKEN_SYMBOL, _totalSupply, DECIMALS, _owner)`](ExternStateToken.md#constructor)

---

## Views

---

### `availableCurrencyKeys`

Returns the [currency key](Synth.md#currencykey) for each synth in [`availableSynths`](#availablesynths).

??? example "Details"

    **Signature**

    `availableCurrencyKeys() public view returns (bytes32[])`

---

### `availableSynthCount`

Returns the number of synths in the system, that is [`availableSynths.length`](#availablesynths).

??? example "Details"

    **Signature**

    `availableSynthCount() public view returns (uint)`

---

### `collateral`

Returns the total SNX owned by the given account, locked and unlocked, escrowed and unescrowed. This is the quantity of SNX synths can be issued against.

This is computed as the sum of [`Synthetix.balanceOf(account)`](TokenState.md#balanceof), [`SynthetixEscrow.balanceOf(account)`](SynthetixEscrow.md#balanceof), and [`RewardEscrow.balanceOf(account)`](RewardEscrow.md#balanceof); so an account may issue synths against both its active balance and its unclaimed escrow funds.

??? example "Details"

    **Signature**

    `collateral(address account) public view returns (uint)`

---

### `collateralisationRatio`

The ratio between value of synths that an account has issued and the value of the collateral they control. That is, this is just [`debtBalanceOf(issuer, "SNX") /`](#debtbalanceof) [`collateral(issuer)`](#collateral).

Ideally, issuers should maintain their collateralisation ratio at a level less than the [global issuance ratio](SynthetixState.md#issuanceratio), and they are incentivised to do this by the [fees they can claim](FeePool.md#claim) if they do so.

??? example "Details"

    **Signature**

    `collateralisationRatio(address issuer) public view returns (uint)`

---

### `debtBalanceOf`

Reports the quantity of a given currency required to free up all SNX locked in given account.

If $\mathrm{X}$ is the [total value of all issued synths](#totalissuedsynths), and $\check{\omega}$ is fraction of that value currently accounted for by this account's locked SNX, then the result is simply:

$$
\check{\omega} \ \mathrm{X}
$$

In order to account for fluctuations in synth prices and supply, the current ownership fraction is computed as the adjusted value:

$$
\check{\omega} = \omega \frac{\Delta_\text{last}}{\Delta_\text{entry}}
$$

Where $\omega$ is the account's debt ownership fraction at the time it [last issued or burnt](SynthetixState.md#issuancedata) synths, which produced the $\Delta_\text{entry}$ item in the [debt ledger](SynthetixState.md#debtledger). $\Delta_\text{last}$ is the latest value on the ledger. This logic is much the same as that found in [`FeePool._effectiveDebtRatioForPeriod`](FeePool.md#_effectivedebtratioforperiod). The actual value of $\omega$ is set in [`_addToDebtRegister`](#_addtodebtregister) and [`_removeFromDebtRegister`](#_removefromdebtregister).

??? example "Details"

    **Signature**

    `debtBalanceOf(address issuer, bytes32 currencyKey) public view returns (uint)`

---

### `effectiveValue`

Reports an equivalent value of a quantity of one synth in terms of another at current exchange rates. This is a simple wrapper for [`ExchangeRates.effectiveValue`](ExchangeRates.md#effectivevalue)

??? example "Details"

    **Signature**

    `effectiveValue(bytes32 sourceCurrencyKey, uint sourceAmount, bytes32 destinationCurrencyKey) public view returns (uint)`

---

### `maxIssuableSynths`

The maximum number of a given synth that is issuable against the issuer's collateral. This is simply [`issuanceRatio *`](SynthetixState.md#issuanceratio) [`collateral(issuer)`](#collateral), priced in the requested currency.

??? example "Details"

    **Signature**

    `maxIssuableSynths(address issuer, bytes32 currencyKey) public view returns (uint)`

---

### `remainingIssuableSynths`

The remaining sUSD synths this account can issue.

If $\text{maxIssuable}$ is [`maxIssuableSynths(issuer)`](#maxissuablesynths) and $\text{debt}$ is [`debtBalanceOf(issuer, currencyKey)`](#debtbalanceof), then the result of this function is $max(0, \text{maxIssuable} - \text{debt})$.

If prices fluctuate then the account's issued synth debt may exceed its current maximum issuable synths, in which case it may not issue any more synths until more collateral is added.

??? example "Details"

    **Signature**

    `remainingIssuableSynths(address issuer) public view returns (uint)`

---

### `totalIssuedSynths`

Returns the total value of Synths in the system, priced in terms of a given currency.

This value is equivalent to:

$$
\frac{1}{\pi_d}\sum_{s \in \text{synths}}{\sigma_s \pi_s}
$$

Where $\sigma_s$ and $\pi_s$ are the total supply and price of synth $s$, and $\pi_d$ is the price of the denominating synth flavour.

??? example "Details"

    **Signature**

    `totalIssuedSynths(bytes32 currencyKey) public view returns (uint)`

    **Modifiers**

    * [`rateNotStale(currencyKey)`](#ratenotstale)

    **Preconditions**

    * No rate for any of the [currently available currencies](#availablesynths) [can be stale](ExchangeRates.md#anyrateisstale).

---

### `transferableSynthetix`

The quantity of SNX this account can transfer given that a portion of it may be locked due to issuance.

If $\text{balance}$ is [`balanceOf(account)`](TokenState.md#balanceof), and $\text{lockedSnx}$ is [`debtBalanceOf(account, "SNX") / SynthetixState.issuanceRatio`](#debtbalanceof), the function returns $max(0, \text{balance} - \text{lockedSnx})$. Escrowed tokens are not taken into account in this computation, so unescrowed tokens are locked immediately.

???+ info "A Note on Price Motion"

    The value of $\text{lockedSnx}$ depends on the current ($\pi$) and previous ($\pi'$) prices being reported by the oracle, and the issuance ratio ($\rho$).

    If we consider a situation where the synth supply has not changed in the time period under consideration, then ownership fractions do not change even if prices do. Further assuming that there is only a single synth circulating, debt balances correspond to the same number of synths, although perhaps not the same value.

    In such a situation, we can think of each user having issued a particular quantity of synths. This quantity depends on the prices of synths and SNX at the time of issuance.

    $$
    Q_s = \rho \ \frac{\pi'_c}{\pi'_s} \ Q_c
    $$

    Whose value at the present time priced [in terms of SNX](#effectivevalue), which is what [`debtBalanceOf(account, "SNX")`](#debtbalanceof) returns, is:

    $$
    {V_s}^{c} = \rho \ \frac{\pi'_c}{\pi'_s} \ \pi_c \ Q_c
    $$

    Note that this computation has a factor of $\rho$ in it, and this must be divided out in order to ascertain the quantity of SNX which are presently locked.

    $$
    \text{lockedSnx} = \frac{{V_s}^{c}}{\rho} = \frac{\pi'_c}{\pi'_s} \ \pi_c \ Q_c
    $$

    Which is to say that the quantity of SNX locked in this situation depends on the price.

    !!! todo "Extend this to the multicurrency case"

        Consider a two synth system, one primary synth and a secondary one which represents the price/supply of all other synths. Use the total issued value function to derive the behaviour for multiple currencies, and then examine a single currency as a special case.

??? example "Details"

    **Signature**

    `transferableSynthetix(address account) public view returns (uint)`

    **Modifiers**

    * [`rateNotStale("SNX")`](#ratenotstale)

---

## Mutative Functions

---

### `burnSynths`

[Burns](Synth.md#burn) a quantity of `sUSD` in the calling address, in order to free up its locked SNX supply.

If the caller attempts to burn more synths than their SNX debt is worth, this function will only burn sufficiently many tokens to cover the debt and leave the rest untouched.

The new debt position of the caller is recorded with [`_appendAccountIssuanceRecord`](#appendaccountissuancerecord), and the adjustment to global debt recorded with [`_removeFromDebtRegister`](#_removefromdebtregister).

??? example "Details"

    **Signature**

    `burnSynths(uint amount) external`

    **Modifiers**

    * [`Proxyable.optionalProxy`](Proxyable.md#optionalproxy)

    **Preconditions**

    * The [existing debt](#debtbalanceof) the caller must be nonzero.

---

### `exchange`

Exchanges one synth flavour for an equivalent value of another at current [exchange rates](ExchangeRates.md) and transfers the converted quantity to a destination address. An [exchange fee](FeePool.md#exchangefeerate) is charged on the way.
See [`_internalExchange`](#_internalExchange) for further implementation details.

If the [protection circuit](#protectioncircuit) is active, then the incoming synths are simply burnt ([`_internalLiquidation`](#_internalliquidation)).

??? example "Details"

    **Signature**

    `exchange(bytes32 sourceCurrencyKey, uint sourceAmount, bytes32 destinationCurrencyKey, address destinationAddress) external returns (bool)`

    **Modifiers**

    * [`Proxyable.optionalProxy`](Proxyable.md#optionalproxy)

    **Preconditions**

    * The source and destination currencies must be distinct.
    * The exchanged quantity must be nonzero.

---

### `issueSynths`

[Issues](Synth.md#issue) a new quantity of `sUSD` into the calling address. The new debt issuance is recorded with [`_addToDebtRegister`](#_addtodebtregister), and the account's issuance records are updated with [`_appendAccountIssuanceRecord`](#_appendaccountissuancerecord).

??? example "Details"

    **Signature**

    `issueSynths(uint amount) public`

    **Modifiers**

    * [`Proxyable.optionalProxy`](Proxyable.md#optionalproxy)

    **Preconditions**

    * The quantity of new synths to be minted must be no greater than the [remaining issuable](#remainingissuablesynths) for that account.

---

### `issueMaxSynths`

Issues the [maximum quantity](#remainingissuablesynths) `sUSD` issuable by the caller of a particular synth flavour. Otherwise, this operates exactly as [`issueSynths`](#issuesynths) does.

??? example "Details"

    **Signature**

    `issueMaxSynths() external`

    **Modifiers**

    * [`Proxyable.optionalProxy`](Proxyable.md#optionalproxy)

---

### `mint`

This function is responsible for creating the inflationary SNX supply. It is a public function, so any address can ensure new tokens are released on schedule. When a new quantity is minted, the calling address is rewarded with a small incentive of SNX tokens, defined by [`SupplySchedule.minterReward`](SupplySchedule.md#minterreward).

The supply is released according to the schedule defined in [`SupplySchedule.schedules`](SupplySchedule.md#schedules), being sent to the [`RewardsDistribution`](RewardsDistribution.md#distributerewards) contract for distribution and escrow. The total supply SNX supply is thus increased by the quantity specified by the schedule.

This function always returns true if the transaction did not revert.

??? example "Details"

    **Signature**

    `mint() external returns (bool)`

    **Preconditions**

    * The [`rewardsDistribution`](#rewardsdistribution) address must be initialised.
    * The supply to mint retrieved from [`SupplySchedule.mintableSupply`](SupplySchedule.md#mintablesupply) must be nonzero.

    **Emits**

    * [`Transfer(synthetix, rewardDistribution, newSupply - minterReward)`](ExternStateToken.md#transfer)
    * [`Transfer(synthetix, msg.sender, minterReward)`](ExternStateToken.md#transfer)

---

### `transfer`

This is a ERC20 transfer functions.

A successful transfer requires the message sender to have sufficient balance, accounting for [locked SNX](#transferablesynthetix).

Implemented based on [`ExternStateToken._transfer_byProxy`](ExternStateToken#_transfer_byproxy).

??? example "Details"

    **Signatures**

    * `transfer(address to, uint value) public returns (bool)`

    **Modifiers**

    * [`Proxyable.optionalProxy`](Proxyable.md#optionalproxy)

    **Preconditions and Events**

    * `value` must not exceed [`transferableSynthetix(messageSender)`](#transferablesynthetix)

    Otherwise, function behaves as per [`ExternStateToken._internalTransfer`](ExternStateToken.md#_internaltransfer).

---

### `transferFrom`

This is a ERC20 transferFrom functions.

A successful transfer requires the token owner to have sufficient balance, accounting for [locked SNX](#transferablesynthetix).

Implemented based on [`ExternStateToken._transferFrom_byProxy`](ExternStateToken#_transferfrom_byproxy).

??? example "Details"

    **Signatures**

    * `transferFrom(address from, address to, uint value) public returns (bool)`
    * `transfer(address from, address to, uint value) public returns (bool)`

    **Modifiers**

    * [`Proxyable.optionalProxy`](Proxyable.md#optionalproxy)

    **Preconditions and Events**

    * `value` must not exceed [`transferableSynthetix(from)`](#transferablesynthetix)

    Otherwise, the these functions behave as per [`ExternStateToken._internalTransfer`](ExternStateToken.md#_internaltransfer).

---

## Owner Functions

---

### `addSynth`

Allows the owner to add a new [`Synth`](Synth.md) to the system, inserting it into [`availableSynths`](#availablesynths) and [`synths`](#synths). The new synth's [currency key](Synth.md#currencykey) must be unique.

??? example "Details"

    **Signature**

    `addSynth(Synth synth) external`

    **Modifiers**

    * [`Proxyable.optionalProxy_onlyOwner`](Proxyable.md#optionalproxy_onlyowner)

    **Preconditions**

    * The new synth's currency key must not be taken already in the [`synths`](#synths) address mapping.

---

### `removeSynth`

Allows the owner to remove a [`Synth`](Synth.md) from the system.
Upon removal it is also deleted from [`availableSynths`](#availablesynths) and [`synths`](#synths), which frees that currency key to be reused.

A Synth cannot be removed if it has outstanding issued tokens.

??? example "Details"

    **Signature**

    `removeSynth(bytes32 currencyKey) external`

    **Modifiers**

    * [`Proxyable.optionalProxy_onlyOwner`](Proxyable.md#optionalproxy_onlyowner)

    **Preconditions**

    * The synth's currency key must exist in the [`synths`](#synths) address mapping.
    * The synth's total supply must be zero.
    * The sUSD synth cannot be removed.

---

### `setFeePool`

Allows the owner to set the [address](#feepool) of the [`FeePool`](FeePool.md) contract.

??? example "Details"

    **Signature**

    `setFeePool(FeePool _feePool) external`

    **Modifiers**

    * [`Proxyable.optionalProxy_onlyOwner`](Proxyable.md#optionalproxy_onlyowner)

---

### `setExchangeRates`

Allows the owner to set the [address](#exchangerates) of the [`ExchangeRates`](ExchangeRates.md) contract.

??? example "Details"

    **Signature**

    `setExchangeRates(ExchangeRates _exchangeRates) external`

    **Modifiers**

    * [`Proxyable.optionalProxy_onlyOwner`](Proxyable.md#optionalproxy_onlyowner)

---

### `setProtectionCircuit`

Allows the oracle to activate or deactivate the [front running protection circuit](#protectioncircuit).

??? example "Details"

    **Signature**

    `setProtectionCircuit(bool _protectionCircuitIsActivated) external`

    **Modifiers**

    * [`onlyOracle`](#onlyoracle)

---

### `setExchangeEnabled`

Allows the owner to [disable synth exchanges](#exchangeenabled).

??? example "Details"

    **Signature**

    `setExchangeEnabled(bool _exchangeEnabled) external`

    **Modifiers**

    * [`Proxyable.optionalProxy_onlyOwner`](Proxyable.md#optionalproxy_onlyowner)

---

## Internal & Restricticed Functions

---

### `synthInitiatedExchange`

Allows a synth to perform a free exchange into a different flavour.
This is only used by [`PurgeableSynth.purge`](#PurgeableSynth.md#purge) in order to convert outstanding synths into sUSD. No exchange fee is charged on such liquidations.

??? example "Details"

    **Signature**

    `synthInitiatedExchange(address from, bytes32 sourceCurrencyKey, sourceAmount, bytes32 destinationCurrencyKey, address destinationAddress) external returns (bool)`

    **Modifiers**

    * [`Proxyable.optionalProxy`](Proxyable.md#optionalproxy) through [`_onlySynth`](#_onlysynth)

    **Preconditions**

    * The message sender must be a synth ([`_onlySynth`](#_onlysynth)).
    * The source and destination currencies must be distinct.
    * The exchanged quantity must be nonzero.

---

### `_internalExchange`

Implements synth exchanges for [`exchange`](#exchange) and [`synthInitiatedExchange`](#synthinitiatedexchange).

Conversion is performed by burning the specified quantity of the source currency from the `from` address, and issuing an [equivalent value](#effectivevalue) of the destination currency into the destination address, minus a [fee](FeePool.md#amountreceivedfromexchange) if `chargeFee` is true. This fee is issued into the [fee address](FeePool.md#feeaddress) in sUSD, and the fee pool is [notified](FeePool.md#feepaid).

This function can be [disabled](#setexchangeenabled) by the owner.

??? example "Details"

    **Signature**

    `_internalExchange(address from, bytes32 sourceCurrencyKey, uint sourceAmount, bytes32 destinationCurrencyKey, address destinationAddress, bool chargeFee) internal returns (bool)`

    **Preconditions**

    * [`exchangeEnabled`](#exchangeenabled) must be true.
    * The destination address must not be the zero address.
    * The destination address must not be the Synthetix contract itself.
    * The destination address must not be the Synthetix proxy.
    * The `from` address must have at least `sourceAmount` of the source currency.

---

### `_internalLiquidation`

This simply burns a quantity of the given synth from the specified account. This always returns true if the transaction was not reverted.

??? example "Details"

    **Signature**

    `_internalLiquidation(address from, bytes32 sourceCurrencyKey, uint sourceAmount) internal returns (bool)`

---

### `_addToDebtRegister`

Whenever synths are issued, this function is invoked to update the [debt ledger](SynthetixState.md#debtledger). It computes the factor the issuance changes the overall supply by and appends the resulting entry to the debt ledger. This entry is saved as a [27-decimal fixed point number](SafeDecimalMath.md).

In addition, the caller's [current issuance data](SynthetixState.md#setcurrentissuancedata) is updated and, if they haven't issued before, the [total issuer count is incremented](SynthetixState.md#incrementtotalissuercount).

This function performs the same operation as [`_removeFromDebtRegister`](#_removefromdebtregister), but a quantity of debt is added rather than removed from the total pool.

???+ info "Debt Ledger and Issuance Data"

    The following holds for both addition and [removal](#_removefromdebtregister) of debt; the logic of the latter is nearly identical to that of the former, but with a negative value of $\chi$.

    **Definitions**

    | Term             | Definition                                           | Description                                                                                                                                                                                                                                                                                                                                 |
    | ---------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | $\Delta$         | See the **Ledger Updates** section below.            | The [debt ledger](SynthetixState.md#debtledger): an array of debt movement factors, indicating the size of the issued system debt over time. $\Delta_n$ is the $n^{th}$ entry in the ledger.                                                                                                                                                |
    | $X$              | $\frac{1}{\pi_\text{sUSD}}\sum_{c}{\pi_c \sigma_c}$   | The sUSD value of all issued synths ([`totalIssuedSynths`](#totalissuedsynths)) at current prices.                                                                                                                                                                                                                                           |
    | $\widehat{\chi}$ | $\omega \frac{\Delta_\text{last}}{\Delta_{entry}} X$ | The XDR value of the account's existing issuance debt at current prices ([`debtBalanceOf`](#debtbalanceof)). $\omega$ is the calling account's last recorded owership fraction of the total system debt. We will also refer to the adjusted current ownership fraction $\check{\omega} = \omega \frac{\Delta_\text{last}}{\Delta_{entry}}$. |
    | $\chi$           |                                                      | The XDR value of the newly-issued synth debt; the new total debt will be $X + \chi$.                                                                                                                                                                                                                                                        |
    | $\omega'$        | $\frac{\chi}{X + \chi}$                              | The fraction of the new total debt accounted for by $\chi$.                                                                                                                                                                                                                                                                                 |
    | $\delta$         | $1 - \omega' \ = \ \frac{X}{X + \chi}$               | The factor to multiply existing debt ownership positions by to obtain their new fraction of the total after adding in $\chi$; that is, the ratio of the old total debt to the new total debt.                                                                                                                                               |

    **Ledger Updates**

    After this function is invoked, the user's ownership fraction $\omega$ and their debt entry index $\text{entry}$ are updated to new values as follows:

    $$
    \begin{equation}
    \begin{split}
    \omega \ &\leftarrow \ \frac{\widehat{\chi} + \chi}{X + \chi} \ = \  \check{\omega} \delta + \omega' \\
    entry \ &\leftarrow \ |\Delta|
    \end{split}
    \end{equation}
    $$

    That is, the updated ownership fraction includes both the old debt and the new debt, adjusted to current prices. The updated debt ledger entry index is the length of the debt ledger, because that will be the index of the new ledger entry that is about to be added.

    The new entry is appended to the debt ledger, growing it by one element. The new last element of the ledger takes the value:

    $$
    \Delta_\text{last} \times \delta
    $$

    Hence each element of the ledger incorporates the value of the previous entry, noting that $\Delta_0 = 1$.

    This gives us a recurrence defining the $n^{th}$ debt ledger entry $\Delta_n$, corresponding to the $n^{th}$ issuance or burning event.

    $$
    \begin{equation}
    \begin{split}
    \Delta_n &= \left\{
                \begin{array}{ll}
                    1 & \text{if} \ n = 0 \\
                    \Delta_{n-1} \ \delta_n & \text{otherwise} \\
                \end{array}
                \right. \\
    \text{ with } \\
    \delta_n &= \frac{X_n}{X_n + \chi_n} \\
    \end{split}
    \end{equation}
    $$

    As a result we can conclude that:

    $$
    \begin{equation}
    \begin{split}
    \Delta_n &= \prod_{k=1}^{n}\delta_k \\
    \Rightarrow \frac{\Delta_n}{\Delta_m} &= \prod_{k=m+1}^{n}\delta_k, \ m \lt n \\
    \end{split}
    \end{equation}
    $$

    So a given debt ledger entry is the cumulative debt movement up to that point, and the division of one entry by another is the debt movement between them.

    Note that, due to price movements in the tokens the system tracks, in general it is not the case that $X_n = X_{n-1} + \chi_{n-1}$. However, if it is assumed that this is the case, one obtains a telescoping series that yields $\Delta_n = \frac{X_1}{X_{n+1}}$. Consequently, the debt ledger measures the overall system growth, as the reciprocal of a particular debt ledger entry is the factor the total system debt had expanded by since the system's inception at the time it was generated.

??? example "Details"

    **Signature**

    `_addToDebtRegister(bytes32 currencyKey, uint amount) internal`

    **Modifiers**

    * [`Proxyable.optionalProxy`](Proxyable.md#optionalproxy)

---

### `_appendAccountIssuanceRecord`

Whenever synths are issued or burnt, the calling account's new [issuance data](FeePoolState.md#issuancedata) (debt ownership and ledger index) is appended to its [historical issuance ledger](FeePoolState.md#accountissuanceledger).

This operates by calling [`FeePool.appendAccountIssuanceRecord`](FeePool.md#appendaccountissuancerecord) thence [`FeePoolState.appendAccountIssuanceRecord`](FeePoolState.md#appendaccountissuancerecord).

??? example "Details"

    **Signature**

    `_appendAccountIssuanceRecord() internal`

---

### `_removeFromDebtRegister`

Whenever synths are burnt, this function is invoked to update the [debt ledger](SynthetixState.md#debtledger). It computes the factor the burning changes the overall supply by and appends the resulting entry to the debt ledger. This entry is saved as a [27-decimal fixed point number](SafeDecimalMath.md).

In addition, the caller's [current issuance data](SynthetixState.md#setcurrentissuancedata) is updated and, if they are burning all their tokens, the [total issuer count is decremented](SynthetixState.md#decrementtotalissuercount).

This function performs the same operation as [`_addToDebtRegister`](#_addtodebtregister), but a quantity of debt is removed rather than added to the total pool.

???+ info "Relationship With [`_addToDebtRegister`](#_addtodebtregister)"

    If debt removal is considered as the addition of a negative quantity of debt, then the functions perform a largely identical function (and could perhaps be merged). The only difference here is that the new total debt is expressed as $X - \chi$. In particular, we have, explicitly computed within this function:

    $$
    \begin{equation}
    \begin{split}
    \omega' \ &= \ \frac{\chi}{X - \chi} \\
    \delta \ &= \ 1 + \omega' \ = \ \frac{X}{X - \chi} \\
    \omega \ &\leftarrow \ \frac{\widehat{\chi} - \chi}{X - \chi} \ = \ \check{\omega} \delta - \omega'
    \end{split}
    \end{equation}
    $$

    Which are all the same as in [`_addToDebtRegister`](#_addtodebtregister) with $\chi$'s sign flipped. See that function's notes for further discussion and definitions.

??? example "Details"

    **Signature**

    `_removeFromDebtRegister(uint amount) internal`

---

## Modifiers

---

### `notFeeAddress`

The transaction is reverted if the given account is the [fee address](FeePool.md#fee_address).

**Signature:** `notFeeAddress(address account)`

---

### `onlyOracle`

The transaction is reverted if `msg.sender` is not the [exchange rates oracle](ExchangeRates.md#oracle).

---

### `rateNotStale`

The transaction is reverted if the given currency's latest exchange rate [is stale](ExchangeRates.md#rateisstale). This will also revert if the currency key is unknown to the exchange rates contract.

---

## Events

---

### `SynthExchange`

Records that an [exchange](#exchange) between two flavours of synths occurred.

This event is emitted from the Synthetix [proxy](Proxy.md#_emit) with the `emitSynthExchange` function.

**Signature:** `SynthExchange(address indexed account, bytes32 fromCurrencyKey, uint256 fromAmount, bytes32 toCurrencyKey, uint256 toAmount, address toAddress)`

---
