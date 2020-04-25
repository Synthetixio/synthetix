# Legacy Sources

This folder contains a number of legacy sources that need to be compiled and tested against newer sources.

For example, most older Proxy, ProxyERC20 and TokenState contracts will not be replaced on mainnet, so we want to be able to integration test modern contracts which have to interact with older ones.

To compile just these, use `npm run compile:legacy`. This will compile all sources in `legacy` and copy those from `legacy/common` into the build artifacts alongside the modern sources. However, these legacy sources will be given the `_Legacy` suffix, so we can easily pull them into our tests using `artifacts.require('Contract_Legacy')`
