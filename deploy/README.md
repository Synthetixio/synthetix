# Deploy Script

This script can build, flatten, deploy and verify (on Etherscan) the Synthetix code.

Usage:

```bash
# build (flatten and compile all .SOL sources)
node deploy/index.js build

# deploy (take compiled SOL files and deploy)
node deploy/index.js deploy

# verify (verify compiled sources by uploading flattened source to Etherscan via their API)
node verify/index.js verify
```
