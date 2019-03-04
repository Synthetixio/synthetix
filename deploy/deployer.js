'use strict';

module.exports = {
	async deployContract(contractIdentifier, constructorArguments) {
		console.log(` - Deploying ${contractIdentifier}`);

		const [contractName, contractNamespace] = contractIdentifier.split('.');

		if (!artifacts[contractName]) throw new Error(`Unknown contract: ${contractName}`);
		if (!settings.contracts[contractName]) {
			throw new Error(`No settings for contract: ${contractName}`);
		}

		let contractSettings = settings.contracts[contractName];

		if (contractNamespace) {
			if (!contractSettings[contractNamespace]) {
				throw new Error(`No settings for contract: ${contractIdentifier}`);
			}

			contractSettings = contractSettings[contractNamespace];
		}

		const { action, existingInstance } = contractSettings;

		// Any contract after SafeDecimalMath can automatically get linked.
		// Doing this with bytecode that doesn't require the library is a no-op.
		let bytecode = artifacts[contractName].evm.bytecode.object;

		if (deployedContracts.SafeDecimalMath) {
			bytecode = linker.linkBytecode(bytecode, {
				[contractName + '.sol']: {
					SafeDecimalMath: deployedContracts.SafeDecimalMath.options.address,
				},
			});
		}

		artifacts[contractName].evm.bytecode.linkedObject = bytecode;

		if (action === 'use-existing') {
			console.log('   - Using existing instance');

			if (!existingInstance) {
				throw new Error(
					`Settings for contract: ${contractIdentifier} specify an existing contract, but do not give an address.`
				);
			}

			deployedContracts[contractIdentifier] = new web3.eth.Contract(
				artifacts[contractName].abi,
				existingInstance
			);
		} else if (action === 'deploy') {
			console.log('   - Deploying new instance...');

			const newContract = new web3.eth.Contract(artifacts[contractName].abi);
			deployedContracts[contractIdentifier] = await newContract
				.deploy({
					data: '0x' + bytecode,
					arguments: constructorArguments,
				})
				.send(sendParameters('contract-deployment'));
		} else {
			throw new Error(`Unknown action for contract ${contractIdentifier}: ${action}`);
		}

		console.log(`   - ${deployedContracts[contractIdentifier].options.address}`);

		return deployedContracts[contractIdentifier];
	},
};
