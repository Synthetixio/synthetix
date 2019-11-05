# SynthetixAirdropper

## Description

This airdrop contract has been adapted to distribute tokens from the inflationary supply to [incentivise liquidity providers](../incentives.md#liquidity-providers) to participate in the [sETH/ETH UniSwap Liquidity Pool](https://etherscan.io/address/0xe9cf7887b93150d4f2da7dfc6d502b216438f244/#tokentxns). A deep liquidity pool such as this is critical to ensuring low-friction movement in and out of [synthetix.exchange](https://synthetix.exchange).

Each fee period, the [`RewardsDistribution`](RewardsDistribution.md) contract sends SynthetixAirdropper 5% of the [new supply](SupplySchedule.md), currently $72\,000$ SNX. This is distributed to liquidity providers in the uniswap pool pro-rata based on the percentage of overall liquidity they provide. These allocations are presently computed off-chain and distributed with the [`multisend`](#multisend) function. The specifics are covered in [SIP-8](https://sips.synthetix.io/sips/sip-8).

**Source:** [`SynthetixAirdropper.sol`](https://github.com/Synthetixio/synthetix/blob/SynthetixAirdropper/contracts/SynthetixAirdropper.sol)

## Architecture

---

### Inheritance Graph

<centered-image>
    ![SynthetixAirdropper inheritance graph](../img/graphs/SynthetixAirdropper.svg)
</centered-image>

---

## Functions

---

### `constructor`

Initialises the inherited [`Owned`](Owned.md) instance.

??? example "Details"
    **Signature**

    `constructor(address _owner) public`

    **Superconstructors**

    * [`Owned(_owner)`](Owned.md#constructor)

---

### `multisend`

Performs batches of ERC20 token transfers to save gas.

??? example "Details"
    **Signature**

    `multisend(address _tokenAddress, address[] _destinations, uint256[] _values) external`

    **Modifiers**

    * [`Owned.onlyOwner`](Owned.md#onlyOwner)

    **Preconditions**

    * `_destinations.length` must equal `_values.length`.

---

### `() (fallback function)`

This fallback function immediately transfers any ether sent to the contract to the contract owner.

??? example "Details"
    **Signature**

    `() external payable`

---
