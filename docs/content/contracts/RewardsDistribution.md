# RewardsDistribution

## Description

This contract distributes the inflationary supply rewards after they have been minted. The primary recipient remains the population of SNX stakers, but new ones can be added to receive an allocation of tokens first. These entries can then be modified or removed.

The actual quantity of tokens to inject into the supply each week is passed into [`distributeRewards`](#distributerewards) by [`Synthetix.mint`](Synthetix.md#mint); how much the quantity is on any given week is determined by the [`SupplySchedule`](SupplySchedule.md) contract.

At present, the only non-staker recipient is the [`SynthetixAirdropper`](SynthetixAirdropper.md) instance incentivising depth in the [sETH/ETH UniSwap Liquidity Pool](https://etherscan.io/address/0xe9cf7887b93150d4f2da7dfc6d502b216438f244/#tokentxns), which assists entry and exit to [synthetix.exchange](https://synthetix.exchange). This pool is assigned 5% of the inflationary supply, currently $72\,000$ SNX per week. For further details, see the discussion on [liquidity provider incentives](../incentives.md#liquidity-providers).

Incentivising activities other than staking was first trialed with UniSwap, which was then formalised into [SIP-8](https://sips.synthetix.io/sips/sip-8), resulting in this contract. See the Airdropper and SIP-8 for detailed mechanics.

**Source:** [RewardsDistribution.sol](https://github.com/Synthetixio/synthetix/blob/master/contracts/RewardsDistribution.sol)

## Architecture

---

### Inheritance Graph

<centered-image>
    ![RewardsDistribution inheritance graph](../img/graphs/RewardsDistribution.svg)
</centered-image>

---

### Related Contracts

- \>[FeePoolProxy](Proxy.md)
- \>[RewardEscrow](RewardEscrow.md)
- \>[SynthetixProxy](Proxy.md)

---

### Libraries

- [SafeMath](SafeMath.md) for uint
- [SafeDecimalMath](SafeDecimalMath.md) for uint

---

## Structs

---

### `DistributionData`

Stores an address and a quantity of the inflationary tokens to send to it.

**Fields**

| Field       | Type      | Description                                                  |
| ----------- | --------- | ------------------------------------------------------------ |
| destination | `address` | The address to send a portion of the inflationary supply to. |
| amount      | `uint`    | The quantity of tokens to send.                              |

## Variables

---

### `authority`

The address authorised to call [`distributeRewards`](#distributerewards), which is used only by [`Synthetix.mint`](Synthetix.md#mint).

**Type:** `address public`

---

### `synthetixProxy`

The address of the Synthetix [`ProxyERC20`](ProxyERC20.md) for transferring SNX to distribution recipients and the [`RewardEscrow`](RewardEscrow.md) contract.

**Type:** `address public`

---

### `rewardEscrow`

The address of the [`RewardEscrow`](RewardEscrow.md), where all remaining tokens are sent once other distributions have been made.

**Type:** `address public`

---

### `feePoolProxy`

The address of the [`FeePool`](FeePool.md) [`Proxy`](Proxy.md), which has to be informed how many rewards it has left to distribute once distributions have been made.

**Type:** `address public`

---

### `distributions`

An array of distribution recipients and the amount of SNX each will receive from the weekly inflationary supply.

**Type:** `DistributionData[] public`

---

## Functions

---

### `constructor`

Initialises the addresses of various related contracts, as well as the inherited [`Owned`](Owned.md) instance.

??? example "Details"

    **Signature**

    `constructor(address _owner, address _authority, address _synthetixProxy, address _rewardEscrow, address _feePoolProxy) public`

    **Superconstructors**

    * [`Owned(_owner)`](Owned.md#constructor)

---

### `setSynthetixProxy`

Allows the owner to set the address of the [Synthetix ProxyERC20](#synthetixproxy).

??? example "Details"

    **Signature**

    `setSynthetixProxy(address _synthetixProxy) external`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)

---

### `setRewardEscrow`

Allows the owner to set the address of the [RewardEscrow](#rewardescrow) contract.

??? example "Details"

    **Signature**

    `setRewardEscrow(address _rewardEscrow) external`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)

---

### `setFeePoolProxy`

Allows the owner to set the address of the [FeePool Proxy](#feepoolproxy).

??? example "Details"

    **Signature**

    `setFeePoolProxy(address _feePoolProxy) external`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)

---

### `setAuthority`

Allows the owner to set the address of the [fee authority](#feeauthority).

??? example "Details"

    **Signature**

    `setAuthority(address _authority) external`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)

---

### `addRewardDistribution`

Allows the owner to add new reward distribution recipients.

This function always returns true if it does not revert.

??? example "Details"

    **Signature**

    `addRewardDistribution(address destination, uint amount) external returns (bool)`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)

    **Preconditions**

    * `destination` cannot be the zero address.
    * `amount` cannot be zero.

    **Emits**

    * [`RewardDistributionAdded(distributions.length - 1, destination, amount)`](#rewarddistributionadded)

---

### `removeRewardDistribution`

Removes a distribution recipient from the [`distributions`](#distributions) list at the specified index.

??? example "Details"

    **Signature**

    `removeRewardDistribution(uint index) external`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)

    **Preconditions**

    * `index` must not be past the end of the list.

---

### `editRewardDistribution`

Modifies a distribution recipient or the quantity to be released to them in the [`distributions`](#distributions) list at the specified index.

This function always returns true if it does not revert.

??? example "Details"

    **Signature**

    `editRewardDistribution(uint index, address destination, uint amount) external returns (bool)`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyowner)

    **Preconditions**

    * `index` must not be past the end of the list.

---

### `distributeRewards`

Distributes a quantity of new SNX among stakers and other reward recipients as part of supply inflation.

First, for each element `d` in the [`distributions`](#distributions) list, `d.amount` SNX is sent to `d.destination`. The remaining tokens are then transferred to the [`RewardEscrow`](RewardEscrow.md) contract to be claimed by stakers, and the [`FeePool`](FeePool.md#setrewardstodistribute) is notified of the updated claimable supply.

This function always returns true if it does not revert.

!!! info "Sufficient SNX Balance"

    There will always be sufficient SNX in the RewardsDistribution contract to support this operation, since its SNX balance is directly credited the correct number of tokens by [`Synthetix.mint`](Synthetix.md#mint) immediately before the only call to this function. Only the Synthetix contract is authorised to execute rewards distribution, and this is the only place new SNX finds its way into the system.

??? example "Details"

    **Signature**

    `distributeRewards(uint amount) external returns (bool)`

    **Preconditions**

    * `msg.sender` must be the [`authority`](#authority); i.e. the Synthetix contract.
    * The [`rewardEscrow`](#rewardescrow), [`synthetixProxy`](#synthetixproxy), and [feePoolProxy](#feepoolproxy) addresses must all be initialised.
    * The amount to distribute must be nonzero.
    * The SNX balance in RewardsDistribution must not be less than the amount to distribute.

    **Emits**

    [`RewardsDistributed(amount)`](#rewardsdistributed)

---

### `distributionsLength`

The number of recipients receiving distributions. This is an alias for `distributions.length`.

??? example "Details"

    **Signature**

    `distributionsLength() external view returns (uint)`

---

## Events

---

### `RewardDistributionAdded`

Records that a new recipient was added to the distributions list, and the index they were added at.

**Signature:** `RewardDistributionAdded(uint index, address destination, uint amount)`

---

### `RewardsDistributed`

Records that a quantity of the inflationary rewards have been dispersed among the [`distributions`](#distributions) recipients and the pool of stakers.

**Signature:** `RewardsDistributed(uint amount)`

---
