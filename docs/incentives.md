# Incentives

Here is an overview of the incentives and token flow in the Synthetix system. Those who benefit are charged, and those who provide benefit are rewarded.

## Sources of Value

### Exchange Fees

??? todo "Work in Progress"
    See the API notes for the [`Synthetix.exchange`](../contracts/Synthetix#exchange) function.

### Inflationary Supply

??? todo "Work in Progress"
    See the API notes for the [`SupplySchedule`](../contracts/SupplySchedule) contract.

## Value Recipients

### Stakers

??? todo "Work in Progress"

    A short overview already exists here: https://www.synthetix.io/stakingrewards

    It will also be useful to examine the [`Synthetix`](../contracts/Synthetix#exchange) and [`FeePool`](../contracts/FeePool) contract notes.

### Liquidity Providers

??? todo "Work in Progress"
    For now it will be most instructive to to examine the [`RewardEscrow`](../contracts/RewardEscrow), [`RewardsDistribution`](../contracts/RewardsDistribution), and  [`SynthetixAirdropper`](../contracts/SynthetixAirdropper) contract notes.

    Liquidity providers are incentivised to provide depth to the [sETH/ETH UniSwap Liquidity Pool](https://etherscan.io/address/0xe9cf7887b93150d4f2da7dfc6d502b216438f244/#tokentxns). It is important that the prices of [sETH](https://etherscan.io/address/0x5e74c9036fb86bd7ecdcb084a0673efc32ea31cb) and ETH are close, so that the UniSwap pool can act as a low-friction on/off-ramp for [synthetix.exchange](https://etherscan.io/address/0x5e74c9036fb86bd7ecdcb084a0673efc32ea31cb).  This pool is assigned 5% of the inflationary supply, currently $72,000$ SNX per week.

    Further notes on the blog [here](https://blog.synthetix.io/uniswap-seth-pool-incentives/), [here](https://blog.synthetix.io/snx-arbitrage-pool/), and [here](https://sips.synthetix.io/sips/sip-8).

    !!! bug
        Find the script used for computing distributions mentioned in SIP-8.
        This script needs to be included in the SIP itself.

### Arbitrageurs

??? todo "Work in Progress"
    For now, examine the [ArbRewarder](../contracts/ArbRewarder) contract notes.
