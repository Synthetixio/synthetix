# PurgeableSynth

This is a [Synth](Synth.md) where all the holders can be liquidated back to sUSD at current rates, so that the contract can be removed from the system. A Synth must either be frozen (if it is an inverse synth) or have its total outstanding supply worth less than 10,000 USD in order for it to be liquidated. Hence it is mainly useful for eliminating Synths which are unused or at the end of their useful life. The value of the token is read from the system's central [ExchangeRates](ExchangeRates.md) contract.

Purgeable synths were introduced by [SIP-3](https://github.com/Synthetixio/SIPs/blob/master/SIPS/sip-3.md) in response to increasing gas costs associated with minting, and to allow the faster reconfiguration of inverse synths.

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
