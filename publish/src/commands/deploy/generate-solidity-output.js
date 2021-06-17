'use strict';

const fs = require('fs');
const path = require('path');

const { gray, yellow } = require('chalk');

const {
	utils: { parseBytes32String },
} = require('ethers');
const {
	getUsers,
	releases,
	constants: { CONTRACTS_FOLDER, MIGRATIONS_FOLDER },
} = require('../../../..');

// Known limitations of this Solidity migration generator
// 1. 	Multidimensional arrays for inputs like CollateralManager.addShortableSynths
// 		are not currently supported.
// 2.	Enum inputs like SystemSettings.setCrossDomainMessageGasLimit are not supported
// 3. 	Large upgrades will cause Solidity "Stack Too Deep" errors.

module.exports = async ({
	deployer,
	deployment,
	generateSolidity,
	network,
	newContractsBeingAdded,
	useOvm,
	runSteps,
	sourceOf,
	addressOf,
}) => {
	if (!generateSolidity) {
		return;
	}

	const contractsAddedToSoliditySet = new Set();
	const instructions = [];

	// function to derive a unique name for each new contract
	const newContractVariableFunctor = name => `new_${name}_contract`;

	for (const [
		runIndex,
		{ skipSolidity, contract, target, writeArg, write, comment },
	] of Object.entries(runSteps)) {
		if (skipSolidity) {
			continue;
		}
		if (comment) {
			instructions.push(`// ${comment}`);
		}
		const { abi } = deployment.sources[sourceOf(target)];

		// set of unique contracts
		contractsAddedToSoliditySet.add(contract);

		const argumentsForWriteFunction = [].concat(writeArg).filter(entry => entry !== undefined); // reduce to array of args

		// now generate the write action as solidity
		const argsForWriteFnc = [];
		for (const [index, argument] of Object.entries(argumentsForWriteFunction)) {
			const abiEntry = abi.find(({ name }) => name === write);

			const { internalType } = abiEntry.inputs[index];

			const decodeBytes32IfRequired = input =>
				Array.isArray(input)
					? input.map(decodeBytes32IfRequired)
					: /^0x[0-9a-fA-F]{64}/.test(input)
					? `"${parseBytes32String(input)}"`
					: input;
			const useVariableForContractNameIfRequired = input =>
				Array.isArray(input)
					? input.map(useVariableForContractNameIfRequired)
					: input in newContractsBeingAdded
					? newContractVariableFunctor(newContractsBeingAdded[input])
					: input;
			const transformValueIfRequired = input =>
				useVariableForContractNameIfRequired(decodeBytes32IfRequired(input));

			if (Array.isArray(argument)) {
				// arrays needs to be created in memory
				const typeOfArrayElement = internalType.replace(/\[|\]/g, '').replace(/^contract /, '');

				const variableName = `${contract.toLowerCase()}_${write}_${runIndex}_${index}`;
				instructions.push(
					`${typeOfArrayElement}[] memory ${variableName} = new ${typeOfArrayElement}[](${argument.length})`
				);
				for (const [i, arg] of Object.entries(argument)) {
					instructions.push(
						`${variableName}[${i}] = ${typeOfArrayElement}(${transformValueIfRequired(arg)})`
					);
				}
				argsForWriteFnc.push(variableName);
			} else if (/^contract /.test(internalType)) {
				// if it's a contract type, it needs casting
				argsForWriteFnc.push(
					`${internalType.split(' ')[1]}(${transformValueIfRequired(argument)})`
				);
			} else {
				// otherwise just add it
				argsForWriteFnc.push(transformValueIfRequired(argument));
			}
		}
		instructions.push(`${contract.toLowerCase()}_i.${write}(${argsForWriteFnc.join(', ')})`);
	}

	const contractsAddedToSolidity = Array.from(contractsAddedToSoliditySet);

	const release = releases.reverse().find(release => (useOvm ? release.ovm : !release.ovm));

	const releaseName = release.name.replace(/[^\w]/g, '');

	const solidity = `
pragma solidity ^0.5.16;

${contractsAddedToSolidity
	.map(contract => {
		const contractSource = sourceOf(deployer.deployedContracts[contract]);
		// support legacy contracts in "legacy" subfolder
		return `import "../${
			/^Legacy/.test(contractSource) ? `legacy/${contractSource}` : contractSource
		}.sol";`;
	})
	.join('\n')}

interface ISynthetixNamedContract {
    // solhint-disable func-name-mixedcase
	function CONTRACT_NAME() external view returns (bytes32);
}

// solhint-disable contract-name-camelcase
contract Migration_${releaseName} {
	address public constant owner = ${getUsers({ network, useOvm, user: 'owner' }).address};

	${contractsAddedToSolidity
		.map(
			contract =>
				`${sourceOf(
					deployer.deployedContracts[contract]
				)} public constant ${contract.toLowerCase()}_i = ${sourceOf(
					deployer.deployedContracts[contract]
				)}(${addressOf(deployer.deployedContracts[contract])});`
		)
		.join('\n\t')}

	function migrate(address currentOwner) external {
		require(owner == currentOwner, "Only the assigned owner can be re-assigned when complete");

		// NEW CONTRACTS DEPLOYED TO BE ADDED TO PROTOCOL
		${Object.entries(newContractsBeingAdded)
			.map(([address, name]) => `address ${newContractVariableFunctor(name)} = ${address};`)
			.join('\n\t\t')}

		${Object.entries(newContractsBeingAdded)
			.map(
				([address, name]) =>
					`require(ISynthetixNamedContract(${newContractVariableFunctor(
						name
					)}).CONTRACT_NAME() == "${name}", "Invalid contract supplied for ${name}");`
			)
			.join('\n\t\t')}

		// ACCEPT OWNERSHIP for all contracts that require ownership to make changes
		${contractsAddedToSolidity
			.map(contract => `${contract.toLowerCase()}_i.acceptOwnership();`)
			.join('\n\t\t')}

		// MIGRATION
		${instructions.length ? `${instructions.join(';\n\t\t')};` : ''}

		// NOMINATE OWNERSHIP back to owner for aforementioned contracts
		${contractsAddedToSolidity
			.map(contract => {
				// support LegacyOwned
				const nominateFnc = deployment.sources[
					sourceOf(deployer.deployedContracts[contract])
				].abi.find(({ name }) => name === 'nominateNewOwner')
					? 'nominateNewOwner'
					: 'nominateOwner';
				return `${contract.toLowerCase()}_i.${nominateFnc}(owner);`;
			})
			.join('\n\t\t')}
	}
}
`.replace(/\t/g, ' '.repeat(4)); // switch tabs to spaces for Solidity

	const migrationContractPath = path.join(
		__dirname,
		'..',
		'..',
		'..',
		'..',
		CONTRACTS_FOLDER,
		MIGRATIONS_FOLDER,
		`Migration_${releaseName}.sol`
	);
	fs.writeFileSync(migrationContractPath, solidity);

	console.log(gray('Wrote Solidity output to', yellow(migrationContractPath)));
};
