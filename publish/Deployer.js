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
	}

	sendParameters(type = 'method-call') {
		return {
			from: this.account,
			gas: type === 'method-call' ? this.methodCallGasLimit : this.contractDeploymentGasLimit,
			gasPrice: this.web3.utils.toWei(this.gasPrice, 'gwei'),
		};
	}

	async deploy({ name, args = [], deps = [] }) {
		if (!this.config[name]) {
			console.log(yellow(`Skipping ${name} as it is NOT in contract flags file for deployment.`));
			return;
		}
		const missingDeps = deps.filter(d => !this.deployedContracts[d]);
		if (missingDeps.length) {
			throw Error(`Cannot deploy ${name} as it is missing dependencies: ${missingDeps.join(',')}`);
		}
		const { deploy, contract } = this.config[name];
		const compiled = this.compiled[name];
		const existingAddress = this.deployment.targets[name]
			? this.deployment.targets[name].address
			: '';

		if (!compiled) throw new Error(`No compiled source for: ${name}`);

		// Any contract after SafeDecimalMath can automatically get linked.
		// Doing this with bytecode that doesn't require the library is a no-op.
		let bytecode = compiled.evm.bytecode.object;
		if (this.deployedContracts.SafeDecimalMath) {
			bytecode = linker.linkBytecode(bytecode, {
				[contract + '.sol']: {
					SafeDecimalMath: this.deployedContracts.SafeDecimalMath.options.address,
				},
			});
		}

		compiled.evm.bytecode.linkedObject = bytecode;

		let deployedContract;

		if (deploy) {
			console.log(gray(` - Attempting to deploy ${name}`));

			const newContract = new this.web3.eth.Contract(compiled.abi);
			deployedContract = await newContract
				.deploy({
					data: '0x' + bytecode,
					arguments: args,
				})
				.send(this.sendParameters('contract-deployment'));

			console.log(green(` - Deployed ${name} to ${deployedContract.options.address}`));
		} else if (existingAddress) {
			deployedContract = new this.web3.eth.Contract(compiled.abi, existingAddress);
			console.log(gray(` - Reusing instance of ${name} at ${existingAddress}`));
		} else {
			throw new Error(
				`Settings for contract: ${name} specify an existing contract, but do not give an address.`
			);
		}

		this.deployedContracts[name] = deployedContract;

		return deployedContract;
	}
}

module.exports = Deployer;
