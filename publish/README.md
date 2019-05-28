# Publisher

This script can `build` (compile and flatten), `deploy` and `verify` (on Etherscan) the Synthetix code to a testnet or mainnet.

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

- `-a, --add-new-synths` Whether or not any new synths in the synths.json file should be deployed if there is no entry in the config file.
- `-b, --build-path [value]` Path for built files to go. (default of `./build` - relative to the root of this repo). The folders `compiled` and `flattened` will be made under this path and the respective files will go in there.
- `-c, --contract-deployment-gas-limit <value>` Contract deployment gas limit (default: 7000000 (7m))
- `-d, --deployment-path <value>` Path to a folder that has your input configuration file (`config.json`), the synths list (`synths.json`) and where your `deployment.json` file will be written (and read from if it currently exists). The `config.json` should be in the following format ([here's an example](deployed/rinkeby/config.json)):

  ```javascript
  // config.json
  {
    "ProxysUSD": {
      "deploy": true // whether or not to deploy this or use existing instance from any deployment.json file
    },

    ...
  }
  ```

  > Note: the advantage of supplying this folder over just using the network name is that you can have multiple deployments on the same network in different folders

- `-g, --gas-price <value>` Gas price in GWEI (default: "1")
- `-m, --method-call-gas-limit <value>` Method call gas limit (default: 150000)
- `-n, --network <value>` The network to run off. One of mainnet, kovan, rinkeby, rospen. (default: "kovan")
- `-o, --oracle <value>` The address of the oracle to use. (default: `0xac1e8b385230970319906c03a1d8567e3996d1d5` - used for all testnets)
- `-f, --fee-auth <value>` The address of the fee Authority to use for feePool. (default: `0xfee056f4d9d63a63d6cf16707d49ffae7ff3ff01` - used for all testnets)

### Examples

```bash
# deploy to rinkeby with 8 gwei gas
node publish deploy -n ropsten -d publish/deployed/ropsten -g 20
node publish deploy -n rinkeby -d publish/deployed/rinkeby -g 20
node publish deploy -n kovan -d publish/deployed/kovan -g 8
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
- `-d, --deployment-path <value>` Same as `deploy` step above.
- `-n, --network <value>` The network to run off. One of mainnet, kovan, rinkeby, rospen. (default: "kovan")

### Examples

```bash
# verify on rinkeby.etherscan
node publish verify -n ropsten -d publish/deployed/ropsten
node publish verify -n rinkeby -d publish/deployed/rinkeby
node publish verify -n kovan -d publish/deployed/kovan
```

## 4. Nominate New Owner

For all given contracts, will invoke `nominateNewOwner` for the given new owner;

```bash
node publish nominate
```

### CLI Options

- `-c, --contracts [value]` One or more contracts to invoke. Leave empty to nominate all contracts in the `config.json` file. Call multiple by invoking `-c First -c Second -c Third` for example.
- `-d, --deployment-path <value>` Path to a folder that has your input configuration file (`config.json`), the synths list (`synths.json`) and where your `deployment.json` file will be written (and read from if it currently exists

- `-g, --gas-price <value>` Gas price in GWEI (default: "1")
- `-m, --method-call-gas-limit <value>` Method call gas limit (default: 150000)
- `-n, --network <value>` The network to run off. One of mainnet, kovan, rinkeby, rospen. (default: -kovan")
- `-o, --new-owner <value>` The address (with `0x` prefix included) of the new owner to nominate.

```bash
node publish nominate -n rinkeby -d publish/deployed/rinkeby -g 3 -c Synthetix -c ProxysUSD -o 0x0000000000000000000000000000000000000000
```

## 5. Owner Actions

Helps the owner take ownership of nominated contracts and run any deployment tasks deferred to them.

```bash
node publish owner
```

### CLI Options

- `-d, --deployment-path <value>` Path to a folder that has your input configuration file (`config.json`), the synths list (`synths.json`) and where your `deployment.json` file will be written (and read from if it currently exists

- `-n, --network <value>` The network to run off. One of mainnet, kovan, rinkeby, rospen. (default: "kovan")
- `-o, --new-owner <value>` The address (with `0x` prefix included) of the new owner to nominate.

```bash
node publish owner -n rinkeby -d publish/deployed/rinkeby -o 0x0000000000000000000000000000000000000001
```

## 6. Remove Synths

Will attempt to remove all given synths from the `Synthetix` contract (as long as they have `totalSupply` of `0`) and update the `config.json` and `synths.json` for the deployment folder.

```bash
node publish remove-synths
```

### CLI Options

- `-d, --deployment-path <value>` Path to a folder that has your input configuration file (`config.json`), the synths list (`synths.json`) and where your `deployment.json` file will be written (and read from if it currently exists
- `-g, --gas-price <value>` Gas price in GWEI (default: "1")
- `-l, --gas-limit <value>` Method call gas limit (default: 150000)
- `-n, --network <value>` The network to run off. One of mainnet, kovan, rinkeby, rospen. (default: "kovan")
- `-s, --synths-to-remove [value]...` One or more synth keys to remove. Call multiple by invoking `-s First -s Second -s Third` for example.

```bash
node publish remove-synths -n rinkeby -d publish/deployed/rinkeby -g 3 -s sRUB -s sETH
```

# When adding new synths

1. In the environment folder you are deploying to, add the synth key to the `synths.json` file
2. [Optional] Run `build` if you've changed any source files, if not you can skip this step.
3. Run `deploy` as usual but add the `--add-new-synths` flag
4. Run `verify` as usual.

# Additional functionality

## Generate token file

Th `generate-token-list` command will generate an array of token proxy addresses for the given deployment to be used in the Synthetix website. The command outputs a JSON array to the console.

```bash
# output a list of token addresses, decimals and symbol names for all the token proxy contracts
node publish generate-token-file
```

### CLI Options

- `-d, --deployment-path <value>` Same as `deploy` step above.

### Example

```bash
node publish generate-token-list -d publish/deployed/rinkeby/ > token-list.json
```
