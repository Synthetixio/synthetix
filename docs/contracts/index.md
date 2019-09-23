# Overview

## Deployed Contract Instances

---

In addition to its mainnet deployment, Synthetix has test environments running on several test networks.

A complete listing is currently available [here](https://developer.synthetix.io/api/docs/deployed-contracts.html).

### Mainnet

This is the main Ethereum chain, where the canonical SNX token, Synths, and operational infrastructure are deployed.

??? example "Mainnet Synthetix Contracts"
    All the addresses need to be migrated to here.

### Ropsten

This needs a description of the purpose of the Ropsten deployment.

??? example "Ropsten Synthetix Contracts"
    All the addresses need to be migrated to here.

### Rinkeby

This needs a description of the purpose of the Rinkeby deployment.

??? example "Rinkeby Synthetix Contracts"
    All the addresses need to be migrated to here.

### Kovan

This needs a description of the purpose of the Kovan deployment.

??? example "Kovan Synthetix Contracts"
    All the addresses need to be migrated to here.

<section-sep />

## Smart Contract API

---

The following contracts compose the core of the Synthetix system.

### Tokens

Contract | Description
---------|------------
[`ExternStateToken`](ExternStateToken.md) | An ERC20/ERC223 token with an external state.
[`TokenState`](TokenState.md) | A state contract to be used with [`ExternStateToken`](ExternStateToken.md)
[`TokenFallbackCaller`](TokenFallbackCaller.md) | Adds an ERC223 token fallback calling function to inheriting contracts.
[`Synthetix`](Synthetix.md) | The central contract in the Synthetix system, which manages Synth supplies, keeping track of rewards, and so on.
[`SynthetixState`](SynthetixState.md) | An auxiliary state contract to sit alongside [`Synthetix`](Synthetix.md) which stores Synth issuance and debt information.
[Synth](Synth.md) | The basic contract underlying all Synths.
[PurgeableSynth](PurgeableSynth.md) | A Synth that can be liquidated if it has reached the end of its life.

### Incentive-related

Contract | Description
---------|------------
[`FeePool`](FeePool.md) | Holds information related to fee entitlements, and exposes functions for computing them.
[`FeePoolEternalStorage`](FeePoolEternalStorage.md) | Stores fee withdrawal times for each address on behalf of the [`FeePool`](FeePool.md).
[`FeePoolState`](FeePoolState.md) | Stores a limited history of issuance data per user on behalf of the [`FeePool`](FeePool.md).
[`DelegateApprovals`](DelegateApprovals.md) | Allows addresses to delegate another address to withdraw fees from the [`FeePool`](FeePool.md) on their behalf.
[`SupplySchedule`](SupplySchedule.md) | Determines the rate that inflationary SNX tokens are released.
[`SynthetixEscrow`](SynthetixEscrow.md) | Holds the escrowed token sale balances of SNX.
[`RewardEscrow`](RewardEscrow.md) | Receives inflationary SNX rewards and distributes them to those entitled to them after an escrow period.
[`SynthetixAirdropper`](SynthetixAirdropper.md) | Distributes tokens from the inflationary supply to individual residents of the the UniSwap ETH/sETH liquidity pool.
[`RewardsDistribution`](RewardsDistribution.md) | Apportions designated quantities of inflationary rewards to the [`RewardEscrow`](RewardEscrow.md) and [`SynthetixAirdropper`](SynthetixAirdropper.md) contracts.

### Infrastructure

Contract | Description
---------|------------
[`Proxy`](Proxy.md) | The Synthetix proxy contract.
[`ProxyERC20`](ProxyERC20.md) | A proxy contract which explicitly supports the ERC20 interface.
[`Proxyable`](Proxyable.md) | An abstract contract designed to work with the [Synthetix proxy](Proxy.md).
[`ExchangeRates`](ExchangeRates.md) | The Synthetix exchange rates contract which supplies token prices to all contracts that need them.
[`Depot`](Depot.md) | A vendor contract that allows users to exchange their ETH for sUSD or SNX, or their sUSD for SNX. It also allows users to deposit SNX to be sold in exchange for sUSD.
[ArbRewarder](ArbRewarder.md) | A contract which automates the process of arbitraging the ETH/sETH price on UniSwap through Synthetix conversion functions.

### Utilities

Contract | Description
---------|------------
[`EscrowChecker`](EscrowChecker.md) | Augments the [`SynthetixEscrow`](SynthetixEscrow.md) contract with a function for dApps to conveniently query it.
[`EternalStorage`](EternalStorage.md) | Persistent/unstructured smart contract storage pattern.
[`LimitedSetup`](LimitedSetup.md) | A contract whose functions are disabled a set time after deployment.
[`Owned`](Owned.md) | A contract with a distinct owner who has special privileges.
[`Pausable`](Pausable.md) | A contract whose operations can be paused by its owner.
[`ReentrancyPreventer`](ReentrancyPreventer.md) | Implements a mutex that prevents re-entrant function calls.
[`SelfDestructible`](SelfDestructible.md) | A contract that can be self destructed after a delay.
[`State`](State.md) | An external state contract whose fields can only be modified by a particular contract address.
[`Migrations`](Migrations.md) | Truffle migrations contract.
[`SafeMath`](SafeMath.md) | OpenZeppelin guarded arithmentic library.
[`SafeDecimalMath`](SafeDecimalMath.md) | A library for performing fixed point arithmetic at two different precision levels.

<section-sep />

??? TODO
    * Extract internal and dev notes into separate document and prepare to make this public-facing.
    * Work out which licence headers are incorrect.
    * Inheriting descendents as well as ancestors.
    * Categorise contracts in nav
    * Solidity syntax highlighting.
    * Audit above contracts
    * Links to etherscan and addresses.
    * Fix inheritance hierarchy and references.
    * List dapp integrations
    * Make a system diagram of what points to what.
    * Check consistency with dev docs and docstrings
    * PurgeableSynth.sol - Module description is broken.
    * Check the legality of the licence headers
    * Modifiers
    * Full inheritance hierarchy
    * Related contracts from inheritance
    * Related contract variables.
    * Ensure all contract texts in this document link to the relevant page
    * Enhance Contract Mapper: Command line args etc. Look for calls out to other contracts in function bodies.
