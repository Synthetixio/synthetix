# Synthetix

[![Build Status](https://travis-ci.org/Synthetixio/synthetix.svg?branch=master)](https://travis-ci.org/Synthetixio/synthetix)
[![CircleCI](https://circleci.com/gh/Synthetixio/synthetix.svg?style=svg)](https://circleci.com/gh/Synthetixio/synthetix)
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
// ['XDR', 'sUSD', 'sEUR', ...]
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
# ["XDR", "sUSD", "sEUR", ... ]
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

As users transact in the system, small fees are remitted, which get sent to SNX holders that enable the economy to exist. Multicurrency is the latest piece of work on the system.

Users are able to withdraw their fees in any nomin currency that we support. Users are entitled to fees once they've issued synths (to help create the economy generating the fees) and waited for a complete fee period to elapse (currently 7 days). Issuers are incentivised to maintain the ratio of collateral (SNX) to Synths such that the Synths in circulation are generally only worth 20% of the value of the Synthetix Network Tokens backing them up via a penalty for being over 20% collateralised. This allows pretty severe price shocks to SNX without threatening the value of the Synths.

We have also invented a nomin currency called XDRs (Synthetix Drawing Rights, loosely modeled on SDRs from the UN). Its exchange rate is derived by looking at a basket aggregate of currencies to avoid biasing towards any particular fiat currency. Fees are stored in this currency, and users can hold these Synths if they want to lessen the impact on their holdings from a particular fiat currency changing in value.

Now that we have an `exchange()` mechanism that allows users to switch between Synth currencies, it made sense to move the fee logic out the Synth token into its own standalone contract. This allows us to have more complex fee collection logic as well.

Also it's worth noting that there's a decimal library being used for "floating point" math with 10^18 as the base. Also many of the contracts are provided behind a proxy contract for easy upgradability.

---

## Contracts

- **ExchangeRates.sol:** A key value store (bytes4 -> uint) of currency exchange rates, all priced in USD. Understands the concept of whether a rate is stale (as in hasn't been updated frequently enough), and only allows a single annointed oracle address to do price updates.
- **ExternStateToken.sol:** The concept of an ERC20 token which stores its allowances and balances outside of the contract for upgradability.
- **FeePool.sol:** Understands fee information for Synthetix. As users transact, their fees are kept in `0xfeefeefee...` and stored in sUSDs. Allows users to claim fees they're entitled to.
- **Synthetix.sol:** Has a list of Synths and understands issuance data for users to be able to mint and burn Synths.
- **SynthetixEscrow.sol:** During the crowdsale, users were asked to escrow their Havvens to insulate against price shocks on the token. Users are able to unlock their SNX on a vesting schedule.
- **Depot.sol:** Allows users to exchange ETH for sUSD and SNX (has not yet been updated for multicurrency).
- **LimitedSetup.sol:** Some contracts have actions that should only be able to be performed during a specific limited setup period. After this period elapses, any functions using the `onlyDuringSetup` modifier should no longer be callable.
- **Migrations.sol:** Truffle's migrations contract.
- **Synth.sol:** Synth token contract which remits fees on transfers, and directs the Synthetix contract to do exchanges when appropriate.
- **SynthAirdropper.sol:** Used to optimise gas during our initial airdrop of Synth.
- **Owned.sol:** Allows us to leverage the concept of a contract owner that is specially priviledged and can perform certain actions.
- **Pausable.sol:** Implements the concept of a pause button on a contract. Methods that should be paused use a particular modifier.
- **Proxy.sol:** Our proxy contracts which forward all calls they receive to their target. Events are always emitted at the proxy, not within the target, even if you call the target directly.
- **Proxyable.sol:** Implemented on a contract so it can be the target of a proxy contract.
- **SafeDecimalMath.sol:** Safe math + decimal math. Using `_dec` on an operation makes it operate "on decimals" by either dividing out the extra UNIT after a multiplication, or multiplying it in before a division.
- **SelfDestructible.sol:** Allows an owner of a contract to set a self destruct timer on it, then once the timer has expired, to kill the contract with `selfdestruct`.
- **State.sol:** Implements the concept of an associated contract which can be changed by the owner.
- **TokenState.sol:** Holds approval and balance information for tokens.
