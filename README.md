# Synthetix

[![Build Status](https://travis-ci.org/Synthetixio/synthetix.svg?branch=master)](https://travis-ci.org/Synthetixio/synthetix)
[![CircleCI](https://circleci.com/gh/Synthetixio/synthetix.svg?style=svg)](https://circleci.com/gh/Synthetixio/synthetix)
[![codecov](https://codecov.io/gh/Synthetixio/synthetix/branch/develop/graph/badge.svg)](https://codecov.io/gh/Synthetixio/synthetix)
[![npm version](https://badge.fury.io/js/synthetix.svg)](https://badge.fury.io/js/synthetix)
[![Discord](https://img.shields.io/discord/413890591840272394.svg?color=768AD4&label=discord&logo=https%3A%2F%2Fdiscordapp.com%2Fassets%2F8c9701b98ad4372b58f13fd9f65f966e.svg)](https://discordapp.com/channels/413890591840272394/)
[![Twitter Follow](https://img.shields.io/twitter/follow/synthetix_io.svg?label=synthetix_io&style=social)](https://twitter.com/synthetix_io)

## Protocol Overview

Synthetix is a crypto-backed synthetic asset platform.

It is a multitoken system, powered by SNX, the Synthetix Network Token. SNX holders can stake `SNX` to issue `sUSD`, on-chain synthetic assets via the [Mintr dApp](https://mintr.synthetix.io) The network currently supports an ever growing [list of synthetic assets](https://docs.synthetix.io/tokens/). Please see the [list of the deployed contracts on `mainnet` and testnets](https://docs.synthetix.io/addresses). Synths can be traded using the [synthetix.exchange](https://synthetix.exchange) dApp.

Synthetix uses a proxy system so that upgrades will not be disruptive to the functionality of the contract. This smooths user interaction, since new functionality will become available without any interruption in their experience. It is also transparent to the community at large, since each upgrade is accompanied by events announcing those upgrades. New releases are managed via the [Synthetix Improvement Proposal (SIP)](https://sips.synthetix.io/all-sip) system similar to the [EF's EIPs](https://eips.ethereum.org/all)

Prices are commited on chain by a trusted oracle. Moving to a decentralised oracle is phased in with the first phase completed for all forex prices using [Chainlink](https://feeds.chain.link/).

:warning: Please note that this repository is under development. The code here will be under continual audit and improvement as the project progresses. For a history of audits, [please see our documentation](https://docs.synthetix.io/contracts/audits).

### Documentation

For the latest system documentation see https://docs.synthetix.io

### DApps

- https://mintr.synthetix.io
- https://synthetix.exchange
- https://dashboard.synthetix.io

### Community

[![Discord](https://img.shields.io/discord/413890591840272394.svg?color=768AD4&label=discord&logo=https%3A%2F%2Fdiscordapp.com%2Fassets%2F8c9701b98ad4372b58f13fd9f65f966e.svg)](https://discordapp.com/channels/413890591840272394/) [![Twitter Follow](https://img.shields.io/twitter/follow/synthetix_io.svg?label=synthetix_io&style=social)](https://twitter.com/synthetix_io)

For a guide from the community, see https://synthetix.community

---

## Repo Guide

### Branching

A note on the branches used in this repo.

- `develop` is the newest version of all the contracts - typically everything going into the next release
- `staging` is for all work staging to mainnet - typically contracts that are going onto testnets prior to a mainnet release on `master`
- `master` represents the contracts live on `mainnet` and all testnets.

When a new version of the contracts makes its way through all testnets, it eventually becomes promoted in `master`, with [semver](https://semver.org/) reflecting contract changes in the `major` or `minor` portion of the version (depending on backwards compatibility). `patch` changes are simply for changes to the JavaScript interface.

### Usage and requirements

#### As an npm module

```javascript
const snx = require("synthetix");

// retrieve an object detailing the contract deployed to the given network.
snx.getTarget({network: "rinkeby", contract: "ProxySynthetix"});
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
snx.getSource({network: "rinkeby", contract: "Proxy"});
/*
{
  bytecode: '0..0',
  abi: [ ... ]
}
*/

// retrieve the array of synths used
snx.getSynths({network: "rinkeby"}).map(({name}) => name);
// ['sUSD', 'sEUR', ...]
```

#### As an npm CLI tool

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

#### For tests (in JavaScript)

Install the dependencies for the project using npm

```
$ npm i
```

To run the tests:

```
$ npm test
```
