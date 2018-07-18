# Havven

[![Build Status](https://travis-ci.org/Havven/havven.svg?branch=master)](https://travis-ci.org/Havven/havven)

Havven is a decentralised payment network and stablecoin.
It is critical to the system's viability that functionality is phased in over time. At this stage of the project, this will occur over three iterations, A, B, C.

The system uses a proxy system so that upgrades will not be disruptive to the functionality of the contract. This smooths user interaction, since new functionality will become available without any interruption in their experience. It is also transparent to the community at large, since each upgrade is accompanied by events announcing those upgrades.

* __System A__: All issuance is performed by the foundation at a static collateralisation ratio. USD Nomins (nUSD) are issued directly into the foundation's wallet. This is the system that is currently operating.
* __System B__: Issuance is opened up to the market. As such, all incentive mechanisms will be activated, with nomins issued directly into market. This system will be complete in so far as the mechanisms in the white paper will be operating, but the nomin price will still be tracking USD only. 
* __System C__: This version will issue new flavours of nomins tracking currencies other than the US dollar.

At first, prices will be introduced into the blockchain by a trusted oracle. A parallel avenue of research is the ongoing decentralisation of this price oracle.

Please note that this repository is under development.
The code here will be under continual audit and improvement as the project progresses.


## Usage and requirements

Deployment and testing scripts require Python 3.6+, [web3.py](https://github.com/ethereum/web3.py) 4.0.0+, [py-solc](https://github.com/ethereum/py-solc) 2.1.0+, and [eth-utils](https://github.com/ethereum/eth-utils) 1.0.0+. To install these dependencies, ensure that python is up to date and run:

```pip3 install -r requirements.txt```

In addition, the test and deployment scripts require [solc](https://github.com/ethereum/solidity) 0.4.21+ to be installed. The tests need [ganache](https://github.com/trufflesuite/ganache-cli) 6.1.0+, for speed and time fast-forwarding. It can be installed from the node package manager with:

```npm install ganache-cli```

Ensure `BLOCKCHAIN_ADDRESS` in `utils/deployutils.py` is pointing to a running
Ethereum client or `ganache-cli` instance. Update other variables like
the master address as appropriate. Then, from the root directory,
deployment is as simple as:

```python3 deploy.py```

Run the test suite as follows:

```python3 run_tests.py```


## Files

The following files should be sufficient for deploying and testing version 1.0
of the havven system. We have leant heavily towards logical simplicity and
explicitness where possible; while in documentation and naming conventions,
verbosity and descriptiveness even to the point of [excess](https://en.wikipedia.org/wiki/Literate_programming).
Some consideration has been given to efficiency, but typically architecturally,
in determining how to allow operations to pay for themselves as they go.
We have mostly forgone local and machine optimisations whenever they would
come at the expense of clarity or simplicity.

* `deploy.py` For deploying Havven contracts to the blockchain.
* `run_tests.py` Runs the test suite, which additionally generates a `test_settings.py` file, which can be used to activate or deactivate particular tests.
* `contracts/` Contains smart contract code to be deployed.
* `contracts/abis/` Contains abis for each smart contract in `contracts/`.
* `contracts/Owned.sol` A contract with an owner.
* `contracts/SelfDestructible.sol` A contract which can be destroyed by its owner after a delay.
* `contracts/LimitedSetup.sol` An abstract contract which provides a modifier which disables functions except during a short period after construction.
* `contracts/Pausable.sol` A contract that allows contract functions to be paused by the owner.
* `contracts/SafeDecimalMath.sol` a math library for unsigned fixed point decimal arithmetic, with built-in safety checking.
* `contracts/State.sol` A generic external state contract that can be attached to another contract for storage purposes.
* `contracts/TokenState.sol` The balances of ERC20 token contracts, inherits from State.
* `contracts/ExternStateToken.sol` A foundation for generic ERC20 tokens with external state.
* `contracts/FeeToken.sol` A foundation for generic ERC20 tokens which also charge fees on transfers, with external state.
* `contracts/Nomin.sol` The nomin contract.
* `contracts/Havven.sol` The havven contract issuance functions are performed from here, as the Nomin and Havven contracts integrate together as a complex.
* `contracts/Proxy.sol` A contract that allows functions to be called on the proxy, and pushed to an underlying implementation so that contract logic can be upgraded. Can operate in one of two modes, providing either a `CALL` or a `DELEGATECALL` proxy style.
* `contracts/Proxyable.sol` An interface to allow underlying contracts to be used with a proxy operating in `CALL` style.
* `contracts/HavvenEscrow.sol` vesting schedule manager, allows vested havvens to be freed up after certain dates.
* `contracts/IssuanceController.sol` A contract that allows the foundation to buy and sell nomins in exchange for ether and havvens.
* `tests/` test cases.
* `tests/contracts` contracts used by the test suite.
* `utils/` helper functions for testing and deployment.
