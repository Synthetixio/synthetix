![Synthetix](img/logos/synthetix_text_logo.png)

# System Documentation

## Introduction

Welcome to the Synthetix system documentation. These pages contain a description of how Synthetix operates; provided are high-level discussions of the system mechanics, as well as thorough technical specifications of the smart contract architecture and API. We hope this assists users and developers to understand the system, and to build on top of it.

## Get In Touch

* **Chat:** If you’re looking for somewhere to talk with the Synthetix team or with other developers about Synthetix, please visit our [Discord](https://discordapp.com/invite/AEdUHzt) or [/r/synthetix_io](https://reddit.com/r/synthetix_io) on reddit.
* **Read:** For updates, announcements, and information, check out our blog at [https://blog.synthetix.io/](https://blog.synthetix.io/), @twitter:synthetix_io on Twitter, or our [Telegram channel](https://t.me/havven_news).
* **Email:** Otherwise you can [contact us by email](https://www.synthetix.io/contact-us).

## Developer Resources

* **Code:** Open source repositories are available @synthetixio; the main Synthetix repo is @synthetixio/synthetix.
* **Smart Contract API:** Descriptions of all Synthetix smart contracts, their APIs, and a listing of deployed instances can be found [here](contracts).
* **SynthetixJS:** Synthetix offers a Javascript library which provides a simple interface to communicate with Synthetix contracts. Under the hood this library uses [ethers.js](https://github.com/ethers-io/ethers.js). The source is available @synthetixio/synthetix-js or just `npm i synthetix-js`.
* **GraphQL API:** The system can also be queried through a GraphQL endpoint via [The Graph](https://thegraph.com/explorer/subgraph/synthetixio-team/synthetix); source code available at @synthetixio/synthetix-subgraph.

## Integrations and Dapps

* **Synthetix Dashboard:** Provides an overview of the status of the Synthetix system including price, token supply, exchange volume, fee pool size, open interest, and current collateralisation levels. The dashboard also provides listings of exchanges where [SNX](https://dashboard.synthetix.io/buy-snx) and [sUSD](https://dashboard.synthetix.io/buy-susd) are traded. The dashboard is available at [https://dashboard.synthetix.io](https://dashboard.synthetix.io).
* **Synthetix.exchange:** The [Synthetix Exchange](https://www.synthetix.io/products/exchange) allows users to trade synths, and to buy sUSD with ether. Synthetix.Exchange has also played host to [trading competitions](https://blog.synthetix.io/synthetix-exchange-trading-competition-v3/) offering SNX prizes to the most successful participants. The source code for Synthetix.Exchange can be found at @synthetixio/synthetix-exchange. A twitter bot that reports statistics for the exchange posts daily at @twitter:SynthXBot.
* **Mintr:** [Mintr](https://www.synthetix.io/products/mintr) is a dApp for SNX holders to participate in the Synthetix Network. Using Mintr, users can mint and burn Synths, monitor their collateralisation levels, buy and sell sUSD through the [Depot](contracts/Depot.md), claim their staking rewards, and vest any SNX they have accrued from the token sale or by staking.
* **UniSwap:** [Uniswap](https://uniswap.io/) is a decentralised exchange for exchanging ETH and ERC20 tokens. Synthetix integrates with it to deepen the Synthetix ecosystem's liquidity, and it acts as an on-ramp/off-ramp for the Synth market. Users who provide liquidity to the [ETH/sETH pool](https://uniswap.exchange/swap/0x42456D7084eacF4083f1140d3229471bbA2949A8) are provided with staking rewards as [part of the Synthetix protocol](https://sips.synthetix.io/sips/sip-8). This is discussed further [here](https://blog.synthetix.io/uniswap-seth-pool-incentives/) and [here](https://blog.synthetix.io/snx-arbitrage-pool/).
* **KyberSwap:** Liquidity is further deepened by the integration of SNX and sUSD with [KyberSwap](https://kyberswap.com/swap/eth-snx), which is built on the [Kyber Network Protocol](https://kyber.network/). An example use case is described [here](https://blog.synthetix.io/snx-liquidity-has-been-added-to-kyberswap/).
