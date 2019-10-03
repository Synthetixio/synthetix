# Overview

## Smart Contract API

!!! todo Current Version
    Insert here a release or a commit hash as of which this documentation is current.

Here you will find descriptions of the smart contract interfaces of every smart contract in the Synthetix system. These documents go a bit further than just the code does, as they include additional descriptions of architecture, functionality, and the reasoning behind them.

Where possible, the interactions between different system components has been emphasised. Also included where relevant, in order to place these contracts in the broader context of the ideas they implement, are discussions of the technical aspects of the Synthetix incentive mechanisms and links back to related governance processes.

Developers wishing to understand Synthetix code and the tradeoffs within it will be well-advised to read these documents alongside the Solidity itself.

<section-sep />

## Deployments

---

!!! danger "Work in Progress"
    All the contract addresses need to be migrated from the current listing to this document.

In addition to its mainnet deployment, Synthetix has test environments running on several test networks.

The current listing is available [here](https://developer.synthetix.io/api/docs/deployed-contracts.html).

#### Mainnet

This is the main Ethereum chain, where the canonical SNX token, Synths, and operational infrastructure are deployed.

??? example "Mainnet Synthetix Contracts"
    All the addresses need to be migrated to here.

#### Ropsten

This needs a description of the purpose of the Ropsten deployment.

??? example "Ropsten Synthetix Contracts"
    All the addresses need to be migrated to here.

#### Rinkeby

This needs a description of the purpose of the Rinkeby deployment.

??? example "Rinkeby Synthetix Contracts"
    All the addresses need to be migrated to here.

#### Kovan

This needs a description of the purpose of the Kovan deployment.

??? example "Kovan Synthetix Contracts"
    All the addresses need to be migrated to here.

<section-sep />

## Contract Listing

---

The following contracts compose the core of the Synthetix system. These underlie the various [integrations and dapps](../#integrations-and-dapps) created by Synthetix and others.

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
[`Depot`](Depot.md) | A vendor contract that allows users to exchange their ETH for sUSD or SNX, or their sUSD for SNX. It also allows users to deposit Synths to be sold in exchange for ETH.
[ArbRewarder](ArbRewarder.md) | A contract which automates the process of arbitraging the ETH/sETH price on UniSwap through Synthetix conversion functions.

### Utility

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
    * Go back through function docstrings and ensure everything matches up.
    * Extract internal and dev notes into separate document and prepare to make this public-facing.
    * Work out which licence headers are incorrect.
    * Inheriting descendents as well as ancestors.
    * Categorise contracts in nav
    * Solidity syntax highlighting.
    * Links to etherscan and addresses.
    * Fix inheritance hierarchy and references.
    * List inherited fields and methods in a collapsible details panel in the inheritance section.
    * Check consistency with dev docs and docstrings
    * Related contracts
    * Enhance Contract Mapper: Command line args etc. Look for calls out to other contracts in function bodies.
    * Mark all `uint`s that are fixed point numbers with their precision level.
    * Remove specific entries for event emission functions and fold them into the event descriptions themselves.
    * Add links to the new explainers on synthetix.io
    * Expand function signatures out with descriptions of parameters and return values.
    * Sequence diagrams for complex inter-contract functions.
