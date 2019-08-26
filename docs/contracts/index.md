# Smart Contracts

## Listing

The following contracts compose the core of the Synthetix system.

* [x] [DelegateApprovals](contracts/DelegateApprovals.md)
* [x] [Depot](contracts/Depot.md)
* [x] [EscrowChecker](contracts/EscrowChecker.md)
* [x] [EternalStorage](contracts/EternalStorage.md)
* [x] [ExchangeRates](contracts/ExchangeRates.md)
* [ ] [ExternStateToken](contracts/ExternStateToken.md)
* [ ] [FeePool](contracts/FeePool.md)
* [x] [FeePoolEternalStorage](contracts/FeePoolEternalStorage.md)
* [x] [FeePoolState](contracts/FeePoolState.md)
* [x] [LimitedSetup](contracts/LimitedSetup.md)
* [x] [Migrations](contracts/Migrations.md)
* [x] [Owned](contracts/Owned.md)
* [x] [Pausable](contracts/Pausable.md)
* [x] [Proxy](contracts/Proxy.md)
* [x] [ProxyERC20](contracts/ProxyERC20.md)
* [x] [Proxyable](contracts/Proxyable.md)
* [x] [PurgeableSynth](contracts/PurgeableSynth.md)
* [x] [ReentrancyPreventer](ReentrancyPreventer.md)
* [x] [RewardEscrow](contracts/RewardEscrow.md)
* [ ] SafeMath
* [x] [SafeDecimalMath](contracts/SafeDecimalMath.md)
* [x] [SelfDestructible](contracts/SelfDestructible.md)
* [x] [State](contracts/State.md)
* [x] [SupplySchedule](contracts/SupplySchedule.md)
* [ ] Synth
* [ ] [Synthetix](contracts/Synthetix.md)
* [x] [SynthetixEscrow](contracts/SynthetixEscrow.md)
* [ ] [SynthetixState](contracts/SynthetixState.md)
* [x] [TokenFallbackCaller](contracts/TokenFallbackCaller.md)
* [x] [TokenState](TokenState.md)

## TODO

* Audit above contracts
* Add links to repositories for each one.
* Links to etherscan and addresses.
* Fix inheritance hierarchy and references.
* List dapp integrations
* Make a system diagram of what points to what.
* Check consistency with dev docs and docstrings
* PurgeableSynth.sol - Module description is broken.
* Check the legality of the licence headers
* Examine oracle addresses and actual update frequencies
* Entry for SafeMath
* Ensure function and variable types are correct
* Modifiers
* Full inheritance hierarchy
* Libraries into own sections
* Related contracts from inheritance
* Related contract variables.
* Ensure all contract texts in this document link to the relevant page
* Contract mapper: scan through ABI of contract at a particular address, look at nullary functions returning addresses. For each address extracted thereby, check if it is a contract. Fetch ABI of the contract at that address if it is, then recurse until done. Enhancement: also look for calls out to other contracts in function bodies.
