# Synthetix

[![Build Status](https://travis-ci.org/Synthetixio/synthetix.svg?branch=master)](https://travis-ci.org/Synthetixio/synthetix)
[![CircleCI](https://circleci.com/gh/Synthetixio/synthetix.svg?style=svg)](https://circleci.com/gh/Synthetixio/synthetix)
[![codecov](https://codecov.io/gh/Synthetixio/synthetix/branch/develop/graph/badge.svg)](https://codecov.io/gh/Synthetixio/synthetix)
[![npm version](https://badge.fury.io/js/synthetix.svg)](https://badge.fury.io/js/synthetix)
[![Discord](https://img.shields.io/discord/413890591840272394.svg?color=768AD4&label=discord&logo=https%3A%2F%2Fdiscordapp.com%2Fassets%2F8c9701b98ad4372b58f13fd9f65f966e.svg)](https://discordapp.com/channels/413890591840272394/)
[![Twitter Follow](https://img.shields.io/twitter/follow/synthetix_io.svg?label=synthetix_io&style=social)](https://twitter.com/synthetix_io)

Synthetix is a crypto-backed synthetic asset platform.

It is a multitoken system, powered by SNX, the Synthetix Network Token. SNX holders can stake SNX to issue Synths, on-chain synthetic assets via the [Mintr Dapp](https://mintr.synthetix.io) The network currently supports an ever growing [list of synthetic assets](https://www.synthetix.io/tokens/). Please see the [list of the deployed contracts on MAIN and TESTNETS](https://developer.synthetix.io/api/docs/deployed-contracts.html)
Synths can be traded using (https://synthetix.exchange)

Synthetix uses a proxy system so that upgrades will not be disruptive to the functionality of the contract. This smooths user interaction, since new functionality will become available without any interruption in their experience. It is also transparent to the community at large, since each upgrade is accompanied by events announcing those upgrades. New releases are managed via the [Synthetix Improvement Proposal (SIP)](https://sips.synthetix.io/all-sip) system similar to the [EF's EIPs](https://eips.ethereum.org/all)

Prices are commited on chain by a trusted oracle. Moving to a decentralised oracle is phased in with the first phase completed for all forex prices using Chainlink. (https://landing-feeds.surge.sh).

Please note that this repository is under development.

The code here will be under continual audit and improvement as the project progresses.

## DApps

- https://mintr.synthetix.io
- https://synthetix.exchange
- https://dashboard.synthetix.io

## Branching

A note on the branches used in this repo.

- `master` represents the contracts live on `mainnet` and all testnets.
- `alpha` is for the newest version of contracts, and is reserved for deploys to `kovan`
- `beta` is for promoted alpha contracts, and is reserved for deploys to `rinkeby`
- `release-candidate` is for promoted beta contracts, and is reserved for deploys to `ropsten`

When a new version of the contracts makes its way through all testnets, it eventually becomes promoted in `master`, with [semver](https://semver.org/) reflecting contract changes in the `major` or `minor` portion of the version (depending on backwards compatibility). `patch` changes are simply for changes to the JavaScript interface.

## Usage and requirements

### As an npm module

```javascript
const snx = require('synthetix');

// retrieve an object detailing the contract deployed to the given network.
snx.getTarget({ network: 'rinkeby', contract: 'ProxySynthetix' });
/*
{
  name: 'ProxySynthetix',
  address: '0x322A3346bf24363f451164d96A5b5cd5A7F4c337',
  source: 'Proxy',
  link: 'https://rinkeby.etherscan.io/address/0x322A3346bf24363f451164d96A5b5cd5A7F4c337',
  timestamp: '2019-03-06T23:05:43.914Z',
  network: 'rinkeby'
}
*/

// retrieve an object detailing the contract ABI and bytecode
snx.getSource({ network: 'rinkeby', contract: 'Proxy' });
/*
{
  bytecode: '0..0',
  abi: [ ... ]
}
*/

// retrieve the array of synths used
snx.getSynths({ network: 'rinkeby' }).map(({ name }) => name);
// ['sUSD', 'sEUR', ...]
```

### As an npm CLI tool

Same as above but as a CLI tool that outputs JSON:

```bash
npx synthetix target --network rinkeby --contract ProxySynthetix
# {
#   "name": "ProxySynthetix",
#   "address": "0x322A3346bf24363f451164d96A5b5cd5A7F4c337",
#   "source": "Proxy",
#   "link": "https://rinkeby.etherscan.io/address/0x322A3346bf24363f451164d96A5b5cd5A7F4c337",
#   "timestamp": "2019-03-06T23:05:43.914Z",
#   "network": "rinkeby"
# }

npx synthetix source --network rinkeby --contract Proxy
# {
#   "bytecode": "0..0",
#   "abi": [ ... ]
# }

npx synthetix synths --network rinkeby --key name
# ["sUSD", "sEUR", ... ]
```

### For tests (in JavaScript)

Install the dependencies for the project using npm

```
$ npm i
```

To run the tests:

```
$ npm test
```

## System Summary

Traditionally gold was used as a reserve store of value by various governments around the world to prove that there was value to back their currency. The Synthetix system replicates this setup, but completely on-chain, and with multiple flavours of stablecoin (Synths), and a store of value backing them up (SNX - Synthetix Network Token).

As users exchange synths via `Exchanger.exchange()` or on [synthetix.exchange](https://synthetix.exchange), small fees are remitted, which get sent to SNX holders that enable the economy to exist.

Users are able to withdraw their fees sUSD. Users are entitled to fees once they've issued synths (to help create the economy generating the fees) and waited for a complete fee period to elapse (currently 7 days). Issuers are incentivised to maintain the ratio of collateral (SNX) to Synths such that the Synths in circulation are generally only worth 20% of the value of the Synthetix Network Tokens backing them up via a penalty for being over 20% collateralised. This allows pretty severe price shocks to SNX without threatening the value of the Synths.

Also it's worth noting that there's a decimal library being used for "floating point" math with 10^18 as the base. Also many of the contracts are provided behind a proxy contract for easy upgradability.

---

## Documentation

For the latest system documentaion see
- http://snxdocs.synthetix.io
- https://synthetix.community
- https://contracts.synthetix.io