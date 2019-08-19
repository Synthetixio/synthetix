# PurgeableSynth

[Go Back](../contracts.md)

## Notes

This is a Synth where all the holders can be liquidated back to sUSD at current rates, so that the contract can be repurposed, removed from the system, or self destructed.

## Inherited Contracts

* [Synth](Synth.md)
* ^[ExternStateToken](ExternStateToken.md)
* ^^[SelfDestructible](SelfDestructible.md)
* ^^[Proxyable](Proxyable.md)
* ^^[TokenFallbackCaller](TokenFallbackCaller.md)
* ^^^[Owned](Owned.md)
* ^^^[ReentrancyPreventer](ReentrancyPreventer.md)

## Related Contracts

### Referenced

* [ExchangeRates](ExchangeRates.md)
* [SafeDecimalMath](SafeDecimalMath.md)

## Variables

* `maxSupplyToPurgeInUSD: uint public`: Disallow purging the synth if the value of its supply greater than this. Initialised to \$10000.
* `exchangeRates: ExchangeRates public`: The contract to obtain price information from. NOTE: Typo in the docstring: `threshpld`.

## Functions

* `purge(address[] addresses)`: Only callable by the owner. Allows purging only if the total token supply is worth less than `maxSupplyToPurge` US dollars at current prices, or if the token's price is frozen on the `ExchangeRates` contract (only possible if it is an inverse synth). If so, iterate through the provided address list, convert each balance to sUSD, and send this quantity to them.
* `setExchangeRates(ExchangeRates _exchangeRates)`: Only callable by the contract owner.

## Events

* `Purged(address indexed account, uint value)`
