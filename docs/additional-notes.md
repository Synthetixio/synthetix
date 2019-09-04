# Additional Notes

## Cryptoeconomics Blog posts

??? Posts
    * 14 Jun 2019 - [Response to The Block's analysis](https://blog.synthetix.io/response-to-the-block-analysis/)
    * 27 Aug 2019 - [Cross-Chain Infrastructure Revisited](https://blog.synthetix.io/cross-chain-infrastructure-revisited/)
    * 6 Dec 2018 - [Synthetix Overview](https://blog.havven.io/synthetix-overview-f4a5a6c41210)
    * Nov 7 2018 - [Devcon IV: A Welcome Dose of Humanity](https://blog.havven.io/https-medium-com-justinjmoses-devcon-iv-a-welcome-dose-of-humanity-5d7b6093a590)
    * Nov 1 2018 - [How to minimise risk with stablecoins](https://blog.havven.io/how-to-minimize-risk-with-stablecoins-fb320494455)
    * Oct 19 2018 - [Cryptoasset Collateral Concerns](https://blog.havven.io/cryptoasset-collateral-concerns-25e2c2d74f30)
    * Sep 18 2018 - [Introduction to Havven's Multicurrency System](https://blog.havven.io/introduction-to-havvens-multicurrency-system-36cca138c91e)
    * Aug 7 2018 - [Tether is a crypto abomination](https://blog.havven.io/tether-is-a-crypto-abomination-bb7250582382)
    * Aug 2 2018 - [Cross-chain infrastructure](https://blog.havven.io/cross-chain-infrastructure-eebe7ad7d7a2)
    * Jun 27 2018 - [Defining Decentralisation](https://blog.havven.io/defining-decentralisation-60afa00efa2a)
    * Apr 22 2018 - [Simultaneous Invention](https://blog.havven.io/simultaneous-invention-bf65290cbb23)
    * Mar 11 2018 - [Fee Aversion](https://blog.havven.io/fee-aversion-5f8e37302144)
    * Jan 19 2018 - [MakerDAO and the Dai](https://blog.havven.io/makerdao-and-the-dai-f21a4d5571a1)
    * Jan 5 2018 - [Basecoin: An Algorithmic Central Bank](https://blog.havven.io/basecoin-an-algorithmic-central-bank-2fffd164f8c4)
    * Jan 2 2018 - [A Decentralised Cryptocurrency Payment Gateway](https://blog.havven.io/a-decentralised-cryptocurrency-payment-gateway-92e33d64e53e)
    * Dec 10 2017 - [Catalan Independence and the Blockchain](https://blog.havven.io/catalan-independence-and-the-blockchain-6bc77fab851c)
    * Dec 8 2017 - [Protocol Funding & Tokenomics](https://blog.havven.io/protocol-funding-tokenomics-55a9b266c8ed)
    * Sep 25 2017 - [We Need a Decentralised Stablecoin](https://blog.havven.io/we-need-a-decentralised-stablecoin-b3e13346c74f)
    * Sep 7 2017 - [Havven Overview](https://blog.havven.io/havven-overview-2d4bb98a3be9)

## A Note on Conversion Fee Evasion

The Synthetix system has both a conversion and a transfer fee. Although they should be distinct,
the preferred currency auto conversion on transfer only charges the transfer fee, and not the conversion fee.
As a result, it is possible to convert Synths more cheaply whenever the transfer fee is less than the conversion fee.
Given that the transfer fee is currently nil, it is possible by this means to perform free conversions. First, this potentially
eliminates all fee revenue for the system to incentivise participants with. Second, if markets have priced in the conversion fee
and are unaware of the exploit, then there is a profit cycle here.

In particular:

Let $\phi_\kappa, \ \phi_\tau \in [0,1]$ be the conversion and transfer fee rates, respectively.
Let $\pi_A, \ \pi_B$ be the prices of synths $A$ and $B$ in terms of some implicit common currency.
$Q_A$ will be the starting quantity of synth $A$.

Then to convert from $A$ to $B$, quantities

$$
Q^\kappa_B = Q_A\frac{\pi_A}{\pi_B}(1 - \phi_\kappa) \\
Q^\tau_B = Q_A\frac{\pi_A}{\pi_B}(1 - \phi_\tau)
$$

are received if the user performs a standard conversion or a transfer conversion, respectively.
The profit of performing a transfer conversion relative to a standard one is then:

$$
Q^\tau_B - Q^\kappa_B = Q_A\frac{\pi_A}{\pi_B}(\phi_\kappa - \phi_\tau)
$$

That is, the relative profit is simply $(\phi_\kappa - \phi_\tau)$. With no transfer fee, the profit is $\phi_\kappa$, as expected.
