# Smart Contract Listing

The following contracts compose the core of the Synthetix system.

* [ ] [ArbRewarder](ArbRewarder.md)
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
* [ ] [SafeMath](SafeMath.md)
* [x] [SafeDecimalMath](SafeDecimalMath.md)
* [x] [SelfDestructible](SelfDestructible.md)
* [x] [State](State.md)
* [x] [SupplySchedule](SupplySchedule.md)
* [ ] [Synth](Synth.md)
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
* Ensure function and variable types are correct
* Modifiers
* Full inheritance hierarchy
* Libraries into own sections
* Related contracts from inheritance
* Related contract variables.
* Ensure all contract texts in this document link to the relevant page
* Enhance Contract Mapper: Command line args etc. Look for calls out to other contracts in function bodies.

## From the main repo

    ExchangeRates.sol: A key value store (bytes4 -> uint) of currency exchange rates, all priced in USD. Understands the concept of whether a rate is stale (as in hasn't been updated frequently enough), and only allows a single annointed oracle address to do price updates.
    ExternStateToken.sol: The concept of an ERC20/ERC223(ish) token which stores its allowances and balances outside of the contract for upgradability.
    FeePool.sol: Understands fee information for Synthetix. As users transact, their fees are kept in 0xfeefeefee... and stored in XDRs. Allows users to claim fees they're entitled to.
    Synthetix.sol: Has a list of Synths and understands issuance data for users to be able to mint and burn Synths.
    SynthetixEscrow.sol: During the crowdsale, users were asked to escrow their Havvens to insulate against price shocks on the token. Users are able to unlock their SNX on a vesting schedule.
    Depot.sol: Allows users to exchange ETH for sUSD and SNX (has not yet been updated for multicurrency).
    LimitedSetup.sol: Some contracts have actions that should only be able to be performed during a specific limited setup period. After this period elapses, any functions using the onlyDuringSetup modifier should no longer be callable.
    Migrations.sol: Truffle's migrations contract.
    Synth.sol: Synth token contract which remits fees on transfers, and directs the Synthetix contract to do exchanges when appropriate.
    SynthAirdropper.sol: Used to optimise gas during our initial airdrop of Synth.
    Owned.sol: Allows us to leverage the concept of a contract owner that is specially priviledged and can perform certain actions.
    Pausable.sol: Implements the concept of a pause button on a contract. Methods that should be paused use a particular modifier.
    Proxy.sol: Our proxy contracts which forward all calls they receive to their target. Events are always emitted at the proxy, not within the target, even if you call the target directly.
    Proxyable.sol: Implemented on a contract so it can be the target of a proxy contract.
    ReentryancyPreventer.sol: Specific logic to try to prevent reentrancy when calling the ERC223 tokenFallback() function.
    SafeDecimalMath.sol: Safe math + decimal math. Using _dec on an operation makes it operate "on decimals" by either dividing out the extra UNIT after a multiplication, or multiplying it in before a division.
    SelfDestructible.sol: Allows an owner of a contract to set a self destruct timer on it, then once the timer has expired, to kill the contract with selfdestruct.
    State.sol: Implements the concept of an associated contract which can be changed by the owner.
    TokenFallbackCaller.sol: Implements a reusable function which can be pulled into the token contracts to trigger an optional call to tokenFallback if the destination address is a contract.
    TokenState.sol: Holds approval and balance information for tokens.
