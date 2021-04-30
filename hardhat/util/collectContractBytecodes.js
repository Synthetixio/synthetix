const path = require('path');
const fs = require('fs');
const {
	constants: { BUILD_FOLDER },
} = require('../../index');

function collectContractBytesCodes() {
	// Where hardhat puts compiled contract artifacts
	// Should be synthetix/build/artifacts/contracts/
	const builtContractsPath = path.resolve(
		__dirname,
		'../../',
		BUILD_FOLDER,
		'artifacts',
		'contracts'
	);

	// Read all sub-folders within this folder
	// Discard folders that don't end with ".sol"
	// Eg:
	//   artifacts/contracts/Synthetix.sol/
	//   artifacts/contracts/Exchanger.sol/
	//   ...
	const contractsFolders = fs
		.readdirSync(builtContractsPath)
		.filter(folderName => path.extname(folderName) === '.sol');

	// Read json files within each folder,
	// and collect them in a combined object.
	// Eg:
	//   artifacts/contracts/Synthetix.sol/Synthetix.json
	//   artifacts/contracts/Exchanger.sol/Exchanger.json
	//   ...
	const contractBytecodes = {};
	for (const contractFolder of contractsFolders) {
		const contractName = path.basename(contractFolder, '.sol');

		const jsonFileName = `${contractName}.json`;
		const jsonfilePath = path.resolve(builtContractsPath, contractFolder, jsonFileName);
		const jsonFileContents = fs.readFileSync(jsonfilePath);
		const artifacts = JSON.parse(jsonFileContents);

		contractBytecodes[contractName] = artifacts.bytecode;
	}

	return contractBytecodes;
}

module.exports = {
	collectContractBytesCodes,
};
