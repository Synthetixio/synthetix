#!/bin/sh
set -ex

# Now compile our code.
node publish build --test-helpers --use-ovm

# Deploy to OVM
# We must specify the private key, as geth-ovm has no notion of unlocked accounts.
#node publish deploy --network local --use-ovm --method-call-gas-limit 8999999 --provider-url http://localhost:8545 --fresh-deploy --yes --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Connect up L1 and L2.
node publish deploy-ovm-pair
# deploy-ovm-pair compiles the OVM artifacts last, so no need to recompile them.

# Generate a gas report through testing.
# Get an understanding of gas costs during tests for different contracts.
# 2. Specify "--network localhostOVM" as the default behaviour of running the tests against a forked hardhat
# will run the code in EVM, rather than OVM.
npx hardhat test:prod:ovm --gas test/contracts/EtherWrapper.js