# Synthetix

[![Build Status](https://travis-ci.org/Synthetixio/synthetix.svg?branch=master)](https://travis-ci.org/Synthetixio/synthetix)
[![CircleCI](https://circleci.com/gh/Synthetixio/synthetix.svg?style=svg)](https://circleci.com/gh/Synthetixio/synthetix)
[![codecov](https://codecov.io/gh/Synthetixio/synthetix/branch/develop/graph/badge.svg)](https://codecov.io/gh/Synthetixio/synthetix)
[![npm version](https://badge.fury.io/js/synthetix.svg)](https://badge.fury.io/js/synthetix)
[![Discord](https://img.shields.io/discord/413890591840272394.svg?color=768AD4&label=discord&logo=https%3A%2F%2Fdiscordapp.com%2Fassets%2F8c9701b98ad4372b58f13fd9f65f966e.svg)](https://discordapp.com/channels/413890591840272394/)
[![Twitter Follow](https://img.shields.io/twitter/follow/synthetix_io.svg?label=synthetix_io&style=social)](https://twitter.com/synthetix_io)

Synthetix is a crypto-backed synthetic asset platform.

It is a multitoken system, powered by SNX, the Synthetix Network Token. SNX holders can stake SNX to issue Synths, on-chain synthetic assets via the [Mintr dApp](https://mintr.synthetix.io) The network currently supports an ever growing [list of synthetic assets](https://www.synthetix.io/tokens/). Please see the [list of the deployed contracts on MAIN and TESTNETS](https://developer.synthetix.io/api/docs/deployed-contracts.html)
Synths can be traded using [synthetix.exchange](https://synthetix.exchange)

Synthetix uses a proxy system so that upgrades will not be disruptive to the functionality of the contract. This smooths user interaction, since new functionality will become available without any interruption in their experience. It is also transparent to the community at large, since each upgrade is accompanied by events announcing those upgrades. New releases are managed via the [Synthetix Improvement Proposal (SIP)](https://sips.synthetix.io/all-sip) system similar to the [EF's EIPs](https://eips.ethereum.org/all)

Prices are commited on chain by a trusted oracle. Moving to a decentralised oracle is phased in with the first phase completed for all forex prices using [Chainlink](https://feeds.chain.link/)

Please note that this repository is under development.

For the latest system documentation see [docs.synthetix.io](https://docs.synthetix.io)

## DApps

- [mintr.synthetix.io](https://mintr.synthetix.io)
- [synthetix.exchange](https://synthetix.exchange)
- [dashboard.synthetix.io](https://dashboard.synthetix.io)

### Community

[![Discord](https://img.shields.io/discord/413890591840272394.svg?color=768AD4&label=discord&logo=https%3A%2F%2Fdiscordapp.com%2Fassets%2F8c9701b98ad4372b58f13fd9f65f966e.svg)](https://discordapp.com/channels/413890591840272394/) [![Twitter Follow](https://img.shields.io/twitter/follow/synthetix_io.svg?label=synthetix_io&style=social)](https://twitter.com/synthetix_io)

For a guide from the community, see [synthetix.community](https://synthetix.community)

---

## Repo Guide

### Branching

A note on the branches used in this repo.

- `master` represents the contracts live on `mainnet` and all testnets.
- `alpha` is for the newest version of contracts, and is reserved for deploys to `kovan`
- `beta` is for promoted alpha contracts, and is reserved for deploys to `rinkeby`
- `release-candidate` is for promoted beta contracts, and is reserved for deploys to `ropsten`

When a new version of the contracts makes its way through all testnets, it eventually becomes promoted in `master`, with [semver](https://semver.org/) reflecting contract changes in the `major` or `minor` portion of the version (depending on backwards compatibility). `patch` changes are simply for changes to the JavaScript interface.

### Testing

[![Build Status](https://travis-ci.org/Synthetixio/synthetix.svg?branch=master)](https://travis-ci.org/Synthetixio/synthetix)
[![CircleCI](https://circleci.com/gh/Synthetixio/synthetix.svg?style=svg)](https://circleci.com/gh/Synthetixio/synthetix)
[![codecov](https://codecov.io/gh/Synthetixio/synthetix/branch/develop/graph/badge.svg)](https://codecov.io/gh/Synthetixio/synthetix)

Please docs.synthetix.io/contracts/testing for an overview of the automated testing methodologies.

## Module Usage

[![npm version](https://badge.fury.io/js/synthetix.svg)](https://badge.fury.io/js/synthetix)

This repo may be installed via `npm install` to support both node.js scripting applications and Solidity contract development.

### Examples

:100: Please see our walkthrus for code examples in both JavaScript and Solidity: [docs.synthetix.io/contracts/walkthrus](https://docs.synthetix.io/contracts/walkthrus)

### Solidity API

All interfaces are available via the path [`synthetix/contracts/interfaces`](./contracts/interfaces/).

:zap: In your code, the key is to use `IAddressResolver` which can be tied to the immutable proxy: [`ReadProxyAddressResolver`](https://contracts.synthetix.io/ReadProxyAddressResolver) ([introduced in SIP-57](https://sips.synthetix.io/sips/sip-57)). You can then fetch `Synthetix`, `FeePool`, `Depot`, et al via `IAddressResolver.getAddress(bytes32 name)` where `name` is the `bytes32` version of the contract name (case-sensitive). Or you can fetch any synth using `IAddressResolver.getSynth(bytes32 synth)` where `synth` is the `bytes32` name of the synth (e.g. `iETH`, `sUSD`, `sDEFI`).

E.g.

`npm install synthetix`

then you can write Solidity as below (using a compiler that links named imports via `node_modules`):

```solidity
pragma solidity 0.5.16;

import 'synthetix/contracts/interfaces/IAddressResolver.sol';
import 'synthetix/contracts/interfaces/ISynthetix.sol';


contract MyContract {
	// This should be instantiated with our ReadProxyAddressResolver
	// it's a ReadProxy that won't change, so safe to code it here without a setter
	// see https://docs.synthetix.io/addresses for addresses in mainnet and testnets
	IAddressResolver public synthetixResolver;

	constructor(IAddressResolver _snxResolver) public {
		synthetixResolver = _snxResolver;
	}

	function synthetixIssue() external {
		ISynthetix synthetix = synthetixResolver.getAddress('Synthetix');
		require(synthetix != address(0), 'Synthetix is missing from Synthetix resolver');

		// Issue for msg.sender = address(MyContract)
		synthetix.issueMaxSynths();
	}

	function synthetixIssueOnBehalf(address user) external {
		ISynthetix synthetix = synthetixResolver.getAddress('Synthetix');
		require(synthetix != address(0), 'Synthetix is missing from Synthetix resolver');

		// Note: this will fail if `DelegateApprovals.approveIssueOnBehalf(address(MyContract))` has
		// not yet been invoked by the `user`
		synthetix.issueMaxSynthsOnBehalf(user);
	}
}
```

### Node.js API

- `getTarget({ network })` Return the information about a contract's `address` and `source` file. The contract names are those specified in [docs.synthetix.io/addresses](https://docs.synthetix.io/addresses)
- `getSource({ network })` Return `abi` and `bytecode` for a contract `source`
- `getSynths({ network })` Return the list of synths for a network
- `getUsers({ network })` Return the list of user accounts within the Synthetix protocol (e.g. `owner`, `fee`, etc)

#### Via code

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

// retrieve the list of system user addresses
snx.getUsers({ network: 'mainnet' });
/*
[ { name: 'owner',
    address: '0xEb3107117FEAd7de89Cd14D463D340A2E6917769' },
  { name: 'deployer',
    address: '0xDe910777C787903F78C89e7a0bf7F4C435cBB1Fe' },
  { name: 'marketClosure',
    address: '0xC105Ea57Eb434Fbe44690d7Dec2702e4a2FBFCf7' },
  { name: 'oracle',
    address: '0xaC1ED4Fabbd5204E02950D68b6FC8c446AC95362' },
  { name: 'fee',
    address: '0xfeEFEEfeefEeFeefEEFEEfEeFeefEEFeeFEEFEeF' },
  { name: 'zero',
    address: '0x0000000000000000000000000000000000000000' } ]
*/

// get suspension reason from uint code
snx.getSuspensionReasons({code: 2});
// 'Market Closure'

snx.getSuspensionReasons();
/*
const suspensionReasonMap =
{
	1: 'System Upgrade',
	2: 'Market Closure',
	3: 'Circuit breaker',
	99: 'Emergency',
};
*/
```

#### As a CLI tool

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

npx synthetix users --network mainnet --user oracle
# {
#   "name": "oracle",
#   "address": "0xaC1ED4Fabbd5204E02950D68b6FC8c446AC95362"
# }

npx synthetix suspension-reason --code 2
# Market Closure
```
