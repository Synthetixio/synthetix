# Deploy Script

This script can build, flatten, deploy and verify (on Etherscan) the Synthetix code.

## 1. Build

Will compile bytecode and ABIs for all `.sol` files found in `node_modules` and the `contracts` folder. It will output them in a `compiled` folder in the given build path (see below), along with the flattened source files under the folder `flattened`.

```bash
# build (flatten and compile all .SOL sources)
node deploy/index.js build
```

### CLI Options

- `-b, --build-path [value]` Path for built files to go. (default of `./build`)

## 2. Deploy

Will attempt to deploy all

```bash
# deploy (take compiled SOL files and deploy)
node deploy/index.js deploy
```

### CLI Options

- ...

## 3. Verify

Will attempt to verify the contracts on Etherscan (by uploading the flattened source files and ABIs).

```bash
# verify (verify compiled sources by uploading flattened source to Etherscan via their API)
node verify/index.js verify
```
