'use strict';

const linker = require('solc/linker');

module.exports = {
	async deploy({ name, contractName, deploy, existingAddress, compiled, deployedContracts, args }) {
		// const [contractName, contractNamespace] = contractIdentifier.split('.');

		if (!compiled) throw new Error(`No compiled source for: ${name}`);
		// if (!settings.contracts[contractName]) {
		// 	throw new Error(`No settings for contract: ${contractName}`);
		// }

		// let contractSettings = settings.contracts[contractName];

		// if (contractNamespace) {
		// 	if (!contractSettings[contractNamespace]) {
		// 		throw new Error(`No settings for contract: ${contractIdentifier}`);
		// 	}

		// 	contractSettings = contractSettings[contractNamespace];
		// }

		// const { action, existingInstance } = contractSettings;

		// Any contract after SafeDecimalMath can automatically get linked.
		// Doing this with bytecode that doesn't require the library is a no-op.
		let bytecode = compiled.evm.bytecode.object;
		if (deployedContracts.SafeDecimalMath) {
			bytecode = linker.linkBytecode(bytecode, {
				[contractName + '.sol']: {
					SafeDecimalMath: deployedContracts.SafeDecimalMath.options.address,
				},
			});
		}

		compiled.evm.bytecode.linkedObject = bytecode;

		let deployedContract;

		if (deploy) {
			const newContract = new web3.eth.Contract(compiled.abi);
			deployedContract = await newContract
				.deploy({
					data: '0x' + bytecode,
					arguments: args,
				})
				.send(sendParameters('contract-deployment'));
		} else if (existingAddress) {
			deployedContract = new web3.eth.Contract(compiled.abi, existingAddress);
		} else {
			throw new Error(
				`Settings for contract: ${name} specify an existing contract, but do not give an address.`
			);
		}

		return deployedContract;
	},
};
