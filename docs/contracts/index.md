# Smart Contract Listing

The following contracts compose the core of the Synthetix system.

* [x] [DelegateApprovals](DelegateApprovals.md)
* [x] [Depot](Depot.md)
* [x] [EscrowChecker](EscrowChecker.md)
* [x] [EternalStorage](EternalStorage.md)
* [x] [ExchangeRates](ExchangeRates.md)
* [ ] [ExternStateToken](ExternStateToken.md)
* [ ] [FeePool](FeePool.md)
* [x] [FeePoolEternalStorage](FeePoolEternalStorage.md)
* [x] [FeePoolState](FeePoolState.md)
* [x] [LimitedSetup](LimitedSetup.md)
* [x] [Migrations](Migrations.md)
* [x] [Owned](Owned.md)
* [x] [Pausable](Pausable.md)
* [x] [Proxy](Proxy.md)
* [x] [ProxyERC20](ProxyERC20.md)
* [x] [Proxyable](Proxyable.md)
* [x] [PurgeableSynth](PurgeableSynth.md)
* [x] [ReentrancyPreventer](ReentrancyPreventer.md)
* [x] [RewardEscrow](RewardEscrow.md)
* [ ] SafeMath
* [x] [SafeDecimalMath](SafeDecimalMath.md)
* [x] [SelfDestructible](SelfDestructible.md)
* [x] [State](State.md)
* [x] [SupplySchedule](SupplySchedule.md)
* [ ] Synth
* [ ] [Synthetix](Synthetix.md)
* [x] [SynthetixEscrow](SynthetixEscrow.md)
* [ ] [SynthetixState](SynthetixState.md)
* [x] [TokenFallbackCaller](TokenFallbackCaller.md)
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
