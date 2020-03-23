'use strict';

const linker = require('solc/linker');
const Web3 = require('web3');
const { gray, green, yellow } = require('chalk');

/**
 *
 */
class Deployer {
	/**
	 *
	 * @param {object} compiled An object with full combined contract name keys mapping to ABIs and bytecode
	 * @param {object} config An object with full combined contract name keys mapping to a deploy flag and the contract source file name
	 * @param {object} deployment An object with full combined contract name keys mapping to existing deployment addresses (if any)
	 */
	constructor({
		compiled,
		config,
		deployment,
		gasPrice,
		methodCallGasLimit,
		contractDeploymentGasLimit,
		providerUrl,
		privateKey,
	}) {
		this.compiled = compiled;
		this.config = config;
		this.deployment = deployment;
		this.gasPrice = gasPrice;
		this.methodCallGasLimit = methodCallGasLimit;
		this.contractDeploymentGasLimit = contractDeploymentGasLimit;

		// Configure Web3 so we can sign transactions and connect to the network.
		this.web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));

		this.web3.eth.accounts.wallet.add(privateKey);
		this.web3.eth.defaultAccount = this.web3.eth.accounts.wallet[0].address;
		this.account = this.web3.eth.defaultAccount;
		this.deployedContracts = {};
		this._dryRunCounter = 0;
	}

	sendParameters(type = 'method-call') {
		return {
			from: this.account,
			gas: type === 'method-call' ? this.methodCallGasLimit : this.contractDeploymentGasLimit,
			gasPrice: this.web3.utils.toWei(this.gasPrice, 'gwei'),
		};
	}

	async deploy({ name, source, args = [], deps = [], force = false, dryRun = false }) {
		if (!this.config[name] && !force) {
			console.log(yellow(`Skipping ${name} as it is NOT in contract flags file for deployment.`));
			return;
		}
		const missingDeps = deps.filter(d => !this.deployedContracts[d]);
		if (missingDeps.length) {
			throw Error(`Cannot deploy ${name} as it is missing dependencies: ${missingDeps.join(',')}`);
		}
		// by default, we deploy if force tells us to
		let deploy = force;
		// though use what's in the config if it exists
		if (this.config[name]) {
			deploy = this.config[name].deploy;
		}
		const compiled = this.compiled[source];
		const existingAddress = this.deployment.targets[name]
			? this.deployment.targets[name].address
			: '';
		const existingABI = this.deployment.sources[source] ? this.deployment.sources[source].abi : '';

		if (!compiled) {
			throw new Error(
				`No compiled source for: ${name}. The source file is set to ${source}.sol - is that correct?`
			);
		}

		// Any contract after SafeDecimalMath can automatically get linked.
		// Doing this with bytecode that doesn't require the library is a no-op.
		let bytecode = compiled.evm.bytecode.object;
		['SafeDecimalMath', 'Math'].forEach(contractName => {
			if (this.deployedContracts[contractName]) {
				bytecode = linker.linkBytecode(bytecode, {
					[source + '.sol']: {
						[contractName]: this.deployedContracts[contractName].options.address,
					},
				});
			}
		});

		compiled.evm.bytecode.linkedObject = bytecode;

		let deployedContract;

		if (deploy) {
			console.log(gray(` - Attempting to deploy ${name}`));
			let gasUsed;
			if (dryRun) {
				this._dryRunCounter++;
				// use the existing version of a contract in a dry run
				deployedContract = this.getContract({ abi: compiled.abi, address: existingAddress });
				const { account } = this;
				// but stub out all method calls except owner because it is needed to
				// determine which actions can be performed directly or need to be added to ownerActions
				Object.keys(deployedContract.methods).forEach(key => {
					deployedContract.methods[key] = () => ({
						call: () => (key === 'owner' ? Promise.resolve(account) : undefined),
					});
				});
				deployedContract.options.address = '0x' + this._dryRunCounter.toString().padStart(40, '0');
			} else {
				const newContract = new this.web3.eth.Contract(compiled.abi);
				deployedContract = await newContract
					.deploy({
						data: '0x' + bytecode,
						arguments: args,
					})
					.send(this.sendParameters('contract-deployment'))
					.on('receipt', receipt => (gasUsed = receipt.gasUsed));
			}
			deployedContract.options.deployed = true; // indicate a fresh deployment occurred
			console.log(
				green(
					`${dryRun ? '[DRY RUN] - Simulated deployment of' : '- Deployed'} ${name} to ${
						deployedContract.options.address
					} ${gasUsed ? `used ${(gasUsed / 1e6).toFixed(1)}m in gas` : ''}`
				)
			);
		} else if (existingAddress && existingABI) {
			// get ABI from the deployment (not the compiled ABI which may be newer)
			deployedContract = this.getContract({ abi: existingABI, address: existingAddress });
			console.log(gray(` - Reusing instance of ${name} at ${existingAddress}`));
		} else {
			throw new Error(
				`Settings for contract: ${name} specify an existing contract, but cannot find address or ABI.`
			);
		}

		// append new deployedContract
		this.deployedContracts[name] = deployedContract;

		return deployedContract;
	}

	getContract({ abi, address }) {
		return new this.web3.eth.Contract(abi, address);
	}
}

module.exports = Deployer;
