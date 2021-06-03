# futures-keeper

## Usage.

```sh
FUTURES_MARKET_ETH_ADDRESS=$(cat ../publish/deployed/local-ovm/deployment.json | jq -r .targets.ProxyFuturesMarketETH.address) EXCHANGE_RATES_ADDRESS=$(cat ../publish/deployed/local-ovm/deployment.json | jq -r .targets.ExchangeRates.address) node src/
```
