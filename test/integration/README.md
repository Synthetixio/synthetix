# Integration tests

These tests deploy real instances of Synthetix in local evm and/or ovm chains, using the same deploy script used in production and test the main features of the system, such as staking, exchanging etc. Coverage is low, but all tests are run against realistic or integrated environments.

## Basic usage

All integration tests are run via `npx hardhat test:integration:<test-type>`.
`<test-type>` can be either `l1`, `l2`, or `dual`.

## L1 tests

These tests deploy a standalone instance of the system in L1 or an evm network. They are located in `test/integration/l1`.

### Running standalone L1 tests against a local hardhat node

1. Run `npx hardhat node`
2. Run `npx hardhat test:integration:l1 --compile --deploy`

### Running standalone L1 tests on a fork

1. Run `npx hardhat node --target-network <network-name>`
2. Run `npx hardhat test:integration:l1 --compile --deploy --use-fork`

## L2 tests

These tests deploy a standalone instance of the system in L2 or an ovm network. They are located in `test/integration/l2`.

Atm, the only way to run a local L2/ovm chain is using Optimism's ops tool, which requires docker to be installed.

### Running standalone L1 tests against the ops tool

1. Run `npx hardhat ops --start`
2. Run `npx hardhat test:integration:l1 --compile --deploy --provider-port 9545`

Note: The port 9545 is used because by default, the ops tool serves the L1/evm chain there.

### Running standalone L2 tests against the ops tool

1. Run `npx hardhat ops --start`
2. Run `npx hardhat test:integration:l2 --compile --deploy`

## Dual L1<>L2 tests

These tests deploy an L1/evm instance _and_ an L2/evm instance and connects them, allowing to test their interconnection features, such as deposits or withdrawals via the L1<>L2 bridges.

### Running dual tests against the ops tool

1. Run `npx hardhat ops --start`
2. Run `npx hardhat test:integration:dual --compile --deploy`

## Advanced usage

### Avoiding compilation and deployment

All integration tests commands include a `--compile` and a `--deploy` flag.
`--compile` should be used the first time you run the tests, and every time you make a change to a contract.
`--deploy` should be used the first time you run the tests, whenever you recompile, or whenever you want a clean instance of the system.

### Using Optimism's ops tool

The first time `npx hardhat ops --start` is used can take a while, since this clones Optimism's repo, builds it, and builds the docker image required to spin up a local L2/ovm chain.

See `npx hardhat ops --help` for available fine usage of the tool, including ways to target a specific Optimism commit, re-building the docker image, etc.

It's recommended to use Docker's UI to monitor the subprocesses of the ops tool, since they can crash at times. When this happens, try stopping the tool and re-starting it.

### Debugging Optimism ops tool

Both `npx hardhat test:integration:l2` and `npx hardhat:integration:dual`, that is any integration tests that runs against the ops tool, accept a `--debug-optimism` flag, which prints out a lot of information about how the two instances are being bridged and kept in sync.

## Developing tests

Please consider the following aspects when developing new integration tests.

### What to test?

Unlike unit tests, integration tests run against complex set ups (i.e. Optimism's ops tool) and are thus fragile and slow. Coverage should be kept to a bare minimum, and test files should be ~100 lines of code and be kept minimal and super easy to read. Anything that makes these tests slow or hard to maintain should be avoided.

Small details of a contract should be tested in unit tests, and integration tests should be reserved to global emergent features of the system that required multiple parts of it integrated together. Always ask yourself if something can be tested in an unit test instead, and really needs to be tested at an integration level, and avoid writing tests at this level if possible.

### Behaviors

Some high level features of the system are expected to exist in both L1 and L2 instances, such as staking, or sUSD's ERC20 properties. So, instead of writing duplicate tests, we implement behaviors and use these behaviors to avoid test code duplication.

Whenever writing tests for a feature that is expected to exist in both L1 and L2 instances, please use a behavior. If a feature previously existed on an instance but not in the other, please extract the tests to a behavior and use the behavior in both instances.

### Utils

Whenever a task is common in integration tests, such as ensuring that a user has SNX, the task should be abstracted from the test as much as possible, so that the test file remains to the point and easy to read. For example, if a behavior is testing exchange functionality, we wouldn't want to add 50 lines of code at the beginning of the test file to make sure that the user has SNX. Instead, we abstract it to a util and call `ensureBalance`. This way, someone coming to see why the integration test is failing, can immediately start reading lines of code directly related to the behavior at hand.
