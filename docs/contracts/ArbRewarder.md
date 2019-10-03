# ArbRewarder

!!! todo "Work in Progress"
    Haven't had a proper chance to examine this contract. More work required. 

## Description

Initial Gitcoin Bounty: https://github.com/Synthetixio/synthetix/issues/188

Announcement Post: https://blog.synthetix.io/our-new-seth-snx-arb-contract-is-now-live/

**Source:** [`ArbRewarder.sol`](https://github.com/Synthetixio/synthetix/blob/arb-rewarder/contracts/ArbRewarder.sol)

!!! todo
    Add the following link to the deployed contracts list

    https://etherscan.io/address/0x9a4935749dbdfaf786a19df1c61a6d28b7a6cf94#code

<section-sep />

## Inheritance Graph

<centered-image>
    ![ArbRewarder inheritance graph](../img/graphs/ArbRewarder.svg)
</centered-image>

## Libraries

* [`SafeMath`](SafeMath.md) for `uint`
* [`SafeDecimalMath`](SafeDecimalMath.md) for `uint`

<section-sep />

## Variables

---

### `off_peg_min`

---

### `acceptable_slippage`

---

### `max_delay`

---

### `divisor`

---

### `seth_exchange_addr`

---

### `snx_erc20_addr`

---

### `synthetix_rates`

---

### `seth_uniswap_exchange`

---

### `seth_erc20`

---

### `snx_erc20`

---

<section-sep />

## Functions

---

### `constructor`

---

### `setParams`

---

### `setSynthetix`

---

### `setSynthetixETHAddress`

---

### `setExchangeRates`

---

### `recoverETH`

---

### `recoverERC20`

---

### `addEth`

---

### `isArbable`

---

### `rewardCaller`

---

### `expectedOutput`

---

### `applySlippage`

---

### `maxConvert`

---

### `sqrt`

---

### `min`

---


<section-sep />

## Modifiers

### `rateNotStale`

<section-sep />
