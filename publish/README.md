# Publisher

This script can `build` (compile and flatten), `deploy` and `verify` (on Etherscan) the Synthetix code to a testnet or mainnet.

## 1. Build

Will compile bytecode and ABIs for all `.sol` files found in `node_modules` and the `contracts` folder. It will output them in a `compiled` folder in the given build path (see below), along with the flattened source files under the folder `flattened`.

```bash
# build (flatten and compile all .SOL sources)
node publish build # "--help" for options
```

## 2. Deploy

Will attempt to deploy (or reuse) all of the contracts listed in the given `contract-flags` input file, as well as perform initial connections between the contracts.

:warning: **This step requires the `build` step having been run to compile the sources into ABIs and bytecode.**

> Note: this action will update in place both the [contract-flag input file](contract-flags.json) and the contract addresses output ([here's the rinkeby one for example](out/rinkeby/contracts.json)) in real time so that if any transactions fail, it can be restarted at the same place.

```bash
# deploy (take compiled SOL files and deploy)
node publish deploy # "--help" for options
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

  > Note: the advantage of supplying this folder over just usi`ng the network name is that you can have multiple deployments on the same network in different folders

- `-g, --gas-price <value>` Gas price in GWEI (default: "1")
- `-m, --method-call-gas-limit <value>` Method call gas limit (default: 150000)
- `-n, --network <value>` The network to run off. One of mainnet, kovan, rinkeby, rospen. (default: "kovan")
- `-o, --oracle <value>` The address of the oracle to use. (default: `0xac1e8b385230970319906c03a1d8567e3996d1d5` - used for all testnets)
- `-f, --fee-auth <value>` The address of the fee Authority to use for feePool. (default:
  `0xfee056f4d9d63a63d6cf16707d49ffae7ff3ff01` - used for all testnets)
  --oracle-gas-limit (no default: set to 0x5a556cc012642e9e38f5e764dccdda1f70808198)

### Examples

```bash
# deploy to rinkeby with 8 gwei gas
node publish deploy -n ropsten -d publish/deployed/ropsten -g 20
node publish deploy -n rinkeby -d publish/deployed/rinkeby -g 20
node publish deploy -n kovan -d publish/deployed/kovan -g 8
node publish deploy -n local -d publish/deployed/local -g 8
```

## 3. Verify

Will attempt to verify the contracts on Etherscan (by uploading the flattened source files and ABIs).

:warning: **Note: the `build` step is required for the ABIs and the `deploy` step for the live addresses to use.**

```bash
# verify (verify compiled sources by uploading flattened source to Etherscan via their API)
node publish verify # "--help" for options
```

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
node publish nominate # "--help" for options
```

### Example

```bash
node publish nominate -n rinkeby -d publish/deployed/rinkeby -g 3 -c Synthetix -c ProxysUSD -o 0x0000000000000000000000000000000000000000
node publish nominate -o 0xB64fF7a4a33Acdf48d97dab0D764afD0F6176882 -n kovan -c ProxysUSD -d publish/deployed/kovan -g 20
```

## 5. Owner Actions

Helps the owner take ownership of nominated contracts and run any deployment tasks deferred to them.

```bash
node publish owner # "--help" for options
```

## 6. Remove Synths

Will attempt to remove all given synths from the `Synthetix` contract (as long as they have `totalSupply` of `0`) and update the `config.json` and `synths.json` for the deployment folder.

```bash
node publish remove-synths # "--help" for options
```

### Example

```bash
node publish remove-synths -n rinkeby -d publish/deployed/rinkeby -g 3 -s sRUB -s sETH
```

## 7. Replace Synths

Will attempt to replace all given synths with a new given `subclass`. It does this by disconnecting the existing TokenState for the Synth and attaching it to the new one.

```bash
node publish replace-synths # "--help" for options
```

## 7. Purge Synths

Will attempt purge the given synth with all token holders it can find. Uses the list of holders from mainnet, and as such won't do anything for other networks.

```bash
node publish purge-synths # "--help" for options
```

## 8. Release

Will initiate the synthetix release process, publishing the synthetix `npm` module and updating all dependent projects in GitHub and `npm`.

```bash
node publish release # "--help" for options
```

### Example

```bash
node publish release --version 2.22.0 --branch master --release Altair
```

# When adding new synths

1. In the environment folder you are deploying to, add the synth key to the `synths.json` file. If you want the synth to be purgeable, add `subclass: "PurgeableSynth"` to the object.
2. [Optional] Run `build` if you've changed any source files, if not you can skip this step.
3. Run `deploy` as usual but add the `--add-new-synths` flag
4. Run `verify` as usual.

# Additional functionality

## Generate token file

Th `generate-token-list` command will generate an array of token proxy addresses for the given deployment to be used in the Synthetix website. The command outputs a JSON array to the console.

```bash
# output a list of token addresses, decimals and symbol names for all the token proxy contracts
node publish generate-token-list -d publish/deployed/mainnet

```

### CLI Options

- `-d, --deployment-path <value>` Same as `deploy` step above.

### Example

```bash
node publish generate-token-list -d publish/deployed/rinkeby/ > token-list.json
```
