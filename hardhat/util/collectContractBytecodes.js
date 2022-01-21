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

	const contractBytecodes = {};

	function searchRecurse({ entryPath }) {
		const filesInDir = fs.readdirSync(entryPath);

		for (const contractFolder of filesInDir) {
			if (path.extname(contractFolder) === '.sol') {
				// Read json files within each folder,
				// and collect them in a combined object.
				// Eg:
				//   artifacts/contracts/Synthetix.sol/Synthetix.json
				//   artifacts/contracts/Exchanger.sol/Exchanger.json
				//   ...
				const contractName = path.basename(contractFolder, '.sol');

				const jsonFileName = `${contractName}.json`;
				const jsonfilePath = path.resolve(entryPath, contractFolder, jsonFileName);
				const jsonFileContents = fs.readFileSync(jsonfilePath);
				const artifacts = JSON.parse(jsonFileContents);

				contractBytecodes[contractName] = artifacts.deployedBytecode;
			} else {
				searchRecurse({ entryPath: path.join(entryPath, contractFolder) });
			}
		}
	}

	searchRecurse({ entryPath: builtContractsPath });

	return contractBytecodes;
}

module.exports = {
	collectContractBytesCodes,
};
