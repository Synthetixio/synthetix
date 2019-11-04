# Incentives

??? todo "Work In Progress"
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

    ## Additional Crypto-economic Discussions

    Subject | Date
    --------|-----
    [Addressing Claims of Deleted Balances](https://blog.synthetix.io/addressing-claims-of-deleted-balances/) | 16 Sep 2019
    [Cross-Chain Infrastructure Revisited](https://blog.synthetix.io/cross-chain-infrastructure-revisited/) | 27 Aug 2019
    [SNX Arbitrage Pool](https://blog.synthetix.io/snx-arbitrage-pool/) | 22 Jul 2019
    [Uniswap sETH Pool Liquidity Incentives](https://blog.synthetix.io/uniswap-seth-pool-incentives/) | 12 Jul 2019
    [Response to The Block's analysis](https://blog.synthetix.io/response-to-the-block-analysis/) | 14 Jun 2019
    [Synthetix Monetary Policy Changes](https://blog.synthetix.io/synthetix-monetary-policy-changes/) | 15 Feb 2019
    [Synthetix Overview](https://blog.synthetix.io/synthetix-overview/) | 6 Dec 2018
    [Devcon IV: A Welcome Dose of Humanity](https://blog.synthetix.io/devcon-iv-a-welcome-dose-of-humanity/) | 7 Nov 2018
    [How to minimise risk with stablecoins](https://blog.synthetix.io/untitled/) | 1 Nov 2018
    [Cryptoasset Collateral Concerns](https://blog.synthetix.io/cryptoasset-collateral-concerns/) | 19 Oct 2018
    [Introduction to Havven's Multicurrency System](https://blog.synthetix.io/introduction-to-havvens-multicurrency-system/) | 18 Sep 2018
    [Tether is a crypto abomination](https://blog.synthetix.io/tether-is-a-crypto-abomination/) | 7 Aug 2018
    [Cross-chain infrastructure](https://blog.synthetix.io/cross-chain-infrastructure/) | 2 Aug 2018
    [Defining Decentralisation](https://blog.synthetix.io/defining-decentralisation/) | 27 Jun 2018
    [Simultaneous Invention](https://blog.synthetix.io/simultaneous-invention/) | 22 Apr 2018
    [Fee Aversion](https://blog.synthetix.io/fee-aversion/) | 11 Mar 2018
    [MakerDAO and the Dai](https://blog.synthetix.io/makerdao-and-the-dai/) | 19 Jan 2018
    [Basecoin: An Algorithmic Central Bank](https://blog.synthetix.io/basecoin-an-algorithmic-central-bank/) | 5 Jan 2018
    [A Decentralised Cryptocurrency Payment Gateway](https://blog.synthetix.io/a-decentralised-cryptocurrency-payment-gateway/) | 2 Jan 2018
    [Catalan Independence and the Blockchain](https://blog.havven.io/catalan-independence-and-the-blockchain-6bc77fab851c) | 10 Dec 2017
    [Protocol Funding & Tokenomics](https://blog.havven.io/protocol-funding-tokenomics-55a9b266c8ed) | 8 Dec 2017
    [We Need a Decentralised Stablecoin](https://blog.havven.io/we-need-a-decentralised-stablecoin-b3e13346c74f) | 25 Sep 2017
    [Havven Overview](https://blog.havven.io/havven-overview-2d4bb98a3be9) | 7 Sep 2017
