# Chainlink POC

We have an example of our pricing engine being updated by a Chainlink oracle on KOCAN.

The example integrates Chainlink into our pricing contract [ExchangeRates.sol](contracts/ExchangeRates.sol).

https://kovan.etherscan.io/address/0x56000B741EC31C11acB10390404A9190F8E62EcB

To invoke a price update using Chainlink, run:

```bash
# Options:
# -s, --symbol (SNX)
# -n , --network (kovan)
# -d, --deployment-path
node chainlink request-price -s BTC -n kovan -d publish/deploy/kovan-chainlink
# will request the BTC price on Kovan
```

To get a price updated, run:

```bash
node chainlink get-price -s BTC
# will get the last retrieved BTC price on Kovan
```
