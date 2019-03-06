# Publisher

This script can `build` (compiled and flatten), `deploy` and `verify` (on Etherscan) the Synthetix code to a testnet or mainnet.

## 1. Build

Will compile bytecode and ABIs for all `.sol` files found in `node_modules` and the `contracts` folder. It will output them in a `compiled` folder in the given build path (see below), along with the flattened source files under the folder `flattened`.

```bash
# build (flatten and compile all .SOL sources)
node publish build
```

### CLI Options

- `-b, --build-path [value]` Path for built files to go. (default of `./build`). The folders `compiled` and `flattened` will be made under this path and the respective files will go in there.
- `-w, --show-warnings` Include this option to see any warnings from compilation logged to screen.

## 2. Deploy

Will attempt to deploy (or reuse) all of the contracts listed in the given `contract-flags` input file, as well as perform initial connections between the contracts.

:warning: **This step requires the `build` step having been run to compile the sources into ABIs and bytecode.**

> Note: this action will update in place both the [contract-flag input file](contract-flags.json) and the contract addresses output ([here's the rinkeby one for example](out/rinkeby/contracts.json)) in real time so that if any transactions fail, it can be restarted at the same place.

```bash
# deploy (take compiled SOL files and deploy)
node publish deploy
```

### CLI Options

- `-b, --build-path [value]` Path for built files to go. (default of `./build` - relative to the root of this repo). The folders `compiled` and `flattened` will be made under this path and the respective files will go in there.
- `-c, --contract-deployment-gas-limit <value>` Contract deployment gas limit (default: 7000000 (7m))
- `-f, --contract-flag-source <value>`Path to a JSON file containing a list of contract flags - this is a mapping of full contract names to a deploy flag and the source solidity file. Only files in this mapping will be deployed. (default: [contract-flags.json](contract-flags.json))
- `-g, --gas-price <value>` Gas price in GWEI (default: "1")
- `-m, --method-call-gas-limit <value>` Method call gas limit (default: 150000)
- `-n, --network <value>` The network to run off. One of mainnet, kovan, rinkeby, rospen. (default: "kovan")
- `-o, --output-path <value>` Path to a folder hosting network-foldered deployed contract addresses (default: [out](out))
- `-s, --synth-list <value>` Path to a JSON file containing a list of synths (default: [synths.json](synths.json))

### Examples

```bash
# deploy to rinkeby with 8 gwei gas
node publish deploy -n rinkeby -g 8
```

## 3. Verify

Will attempt to verify the contracts on Etherscan (by uploading the flattened source files and ABIs).

:warning: **Note: the `build` step is required for the ABIs and the `deploy` step for the live addresses to use.**

```bash
# verify (verify compiled sources by uploading flattened source to Etherscan via their API)
node publish verify
```

### CLI Options

- `-b, --build-path [value]` Path for built files to come from. (default of `./build`). The folders `compiled` and `flattened` will be made under this path and the respective files will go in there.
- `-f, --contract-flag-source <value>` Path to a JSON file containing a list of contract flags - this is a mapping of full contract names to a deploy flag and the source solidity file. Only files in this mapping will be deployed. (default: [contract-flags.json](contract-flags.json))
- `-n, --network <value>` The network to run off. One of mainnet, kovan, rinkeby, rospen. (default: "kovan")
- `-o, --output-path <value>` Path to a folder hosting network-foldered deployed contract addresses (default: [deploy/out](deploy/out))
