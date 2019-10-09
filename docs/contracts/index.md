# Overview

## Smart Contract API

!!! todo Current Version
    Insert here a release or a commit hash as of which this documentation is current.

Here you will find descriptions of the smart contract interfaces of every smart contract in the Synthetix system. These documents go a bit further than just the code does, as they include additional descriptions of architecture, functionality, and the reasoning behind them.

Where possible, the interactions between different system components has been emphasised. Also included where relevant, in order to place these contracts in the broader context of the ideas they implement, are discussions of the technical aspects of the Synthetix incentive mechanisms and links back to related governance processes.

Developers wishing to understand Synthetix code and the tradeoffs within it will be well-advised to read these documents alongside the Solidity itself.

The addresses of currently-deployed contract instances are available in the [Deployments](deployments.md) section.

<section-sep />

## Contract Listing

The following contracts compose the core of the Synthetix system. These underlie the various [integrations and dapps](../#integrations-and-dapps) created by Synthetix and others.

---

### Tokens

Contract | Description
---------|------------
[`Synthetix`](Synthetix.md) | The central contract in the Synthetix system, which manages Synth supplies, keeping track of rewards, the debt ledger, and so on.
[`SynthetixState`](SynthetixState.md) | An auxiliary state contract to sit alongside [`Synthetix`](Synthetix.md) which stores Synth issuance and debt information.
[Synth](Synth.md) | The basic contract underlying all Synths.
[PurgeableSynth](PurgeableSynth.md) | A Synth that can be liquidated if it has reached the end of its life.
[`ExternStateToken`](ExternStateToken.md) | A partial ERC20/ERC223 token contact with an external state, which all tokens in Synthetix are built upon.
[`TokenState`](TokenState.md) | A state contract to be used with [`ExternStateToken`](ExternStateToken.md) to store balances.

---

### Fee Pool

Contract | Description
---------|------------
[`FeePool`](FeePool.md) | Holds accumulated fees, computes and stores fee entitlements and historic issuance data.
[`FeePoolState`](FeePoolState.md) | Stores a limited history of issuance data per user on behalf of the [`FeePool`](FeePool.md).
[`FeePoolEternalStorage`](FeePoolEternalStorage.md) | Stores fee withdrawal times for each address on behalf of the [`FeePool`](FeePool.md).
[`DelegateApprovals`](DelegateApprovals.md) | Allows addresses to delegate another address to withdraw fees from the [`FeePool`](FeePool.md) on their behalf.

---

### Inflationary Incentives and Escrow

Contract | Description
---------|------------
[`SupplySchedule`](SupplySchedule.md) | Determines the rate that inflationary SNX tokens are released.
[`RewardEscrow`](RewardEscrow.md) | Receives inflationary SNX rewards to be distributed after a year escrow.
[`RewardsDistribution`](RewardsDistribution.md) | Apportions designated quantities of inflationary rewards to the [`RewardEscrow`](RewardEscrow.md) and [`SynthetixAirdropper`](SynthetixAirdropper.md) contracts.
[`SynthetixAirdropper`](SynthetixAirdropper.md) | Distributes tokens from the inflationary supply to individual residents of the the UniSwap ETH/sETH liquidity pool.
[`SynthetixEscrow`](SynthetixEscrow.md) | Holds the escrowed balances of SNX from the original token sale.
[`EscrowChecker`](EscrowChecker.md) | Augments the [`SynthetixEscrow`](SynthetixEscrow.md) contract with a function for dApps to conveniently query it.

---

### Infrastructure

Contract | Description
---------|------------
[`ExchangeRates`](ExchangeRates.md) | The Synthetix exchange rates contract which receives token prices from the oracle, and supplies them to all contracts that need it.
[`Depot`](Depot.md) | A vendor contract that allows users to exchange their ETH for sUSD or SNX, or their sUSD for SNX. It also allows users to deposit Synths to be sold in exchange for ETH.
[ArbRewarder](ArbRewarder.md) | A contract which automates the process of arbitraging the ETH/sETH price on UniSwap through Synthetix conversion functions.

---

### Proxy

Contract | Description
---------|------------
[`Proxy`](Proxy.md) | The Synthetix proxy contract.
[`ProxyERC20`](ProxyERC20.md) | A proxy contract which explicitly supports the ERC20 interface.
[`Proxyable`](Proxyable.md) | An abstract base contract designed to work with the [Synthetix proxy](Proxy.md).

---

### Utility

Contract | Description
---------|------------
[`SafeDecimalMath`](SafeDecimalMath.md) | A library for performing fixed point arithmetic at two different precision levels.
[`SafeMath`](SafeMath.md) | OpenZeppelin guarded arithmentic library, used by [`SafeDecimalMath`](SafeDecimalMath.md) and others.
[`Owned`](Owned.md) | A contract with a distinct owner who can have special privileges.
[`LimitedSetup`](LimitedSetup.md) | A contract which can disable functions a set time after deployment.
[`State`](State.md) | An external state contract which can restrict its fields to be modifiable only by a particular contract address.
[`SelfDestructible`](SelfDestructible.md) | A contract that can be self destructed by its owner after a delay.
[`Pausable`](Pausable.md) | A contract whose operations can be paused by its owner.
[`ReentrancyPreventer`](ReentrancyPreventer.md) | Implements a mutex that prevents re-entrant function calls.
[`TokenFallbackCaller`](TokenFallbackCaller.md) | Adds an ERC223 token fallback calling function to inheriting contracts.
[`EternalStorage`](EternalStorage.md) | A persistent/unstructured smart contract storage pattern.
[`Migrations`](Migrations.md) | Truffle migrations contract.

---

<section-sep />

??? TODO
    * Go back through function docstrings and dev docs to ensure everything matches up.
    * Extract internal and dev notes into separate document and prepare to make this public-facing.
    * Work out which licence headers are incorrect.
    * Inheriting descendents as well as ancestors.
    * Solidity syntax highlighting.
    * Links to etherscan and addresses.
    * Fix inheritance hierarchy and references.
    * List inherited fields and methods in a collapsible details panel in the inheritance section.
    * Expand function signatures out with descriptions of parameters and return values.
    * Related contracts
    * Enhance Contract Mapper: Command line args etc. Look for calls out to other contracts in function bodies.
    * Mark all `uint`s that are fixed point numbers with their precision level.
    * Add links to the new explainers on synthetix.io
    * Sequence diagrams for complex inter-contract functions.
    * Propagate preconditions, events due to function composition.
