'use strict';

const fs = require('fs');

const { gray } = require('chalk');

const {
	utils: { parseBytes32String },
} = require('ethers');
const { getUsers } = require('../../../..');

module.exports = async ({
	deployer,
	deployment,
	generateSolidity,
	network,
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

	for (const [runIndex, { skipSolidity, contract, target, writeArg, write }] of Object.entries(
		runSteps
	)) {
		if (skipSolidity) {
			continue;
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
				/^0x[0-9a-fA-F]{64}/.test(input) ? `"${parseBytes32String(input)}"` : input;

			if (Array.isArray(argument)) {
				// arrays needs to be created in memory
				const typeOfArrayElement = internalType.replace(/\[|\]/g, '').replace(/^contract /, '');

				const variableName = `${contract.toLowerCase()}_${write}_${runIndex}_${index}`;
				instructions.push(
					`${typeOfArrayElement}[] memory ${variableName} = new ${typeOfArrayElement}[](${argument.length})`
				);
				for (const [i, arg] of Object.entries(argument)) {
					instructions.push(
						`${variableName}[${i}] = ${typeOfArrayElement}(${decodeBytes32IfRequired(arg)})`
					);
				}
				argsForWriteFnc.push(variableName);
			} else if (/^contract /.test(internalType)) {
				// if it's a contract type, it needs casting
				argsForWriteFnc.push(`${internalType.split(' ')[1]}(${argument})`);
			} else {
				// otherwise just add it
				argsForWriteFnc.push(decodeBytes32IfRequired(argument));
			}
		}
		instructions.push(`${contract.toLowerCase()}_i.${write}(${argsForWriteFnc})`);
	}

	const contractsAddedToSolidity = Array.from(contractsAddedToSoliditySet);

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


contract Migrator {
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

		// accept ownership
		${contractsAddedToSolidity
			.map(contract => `${contract.toLowerCase()}_i.acceptOwnership();`)
			.join('\n\t\t')}

		// perform migration
		${instructions.join(';\n\t\t')};

		// nominate ownership back to owner
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
`;

	fs.writeFileSync(generateSolidity, solidity);

	console.log(gray('Wrote Solidity output to', generateSolidity));
};
