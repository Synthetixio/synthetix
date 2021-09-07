const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

const { connectContracts } = require('./contracts');
const { prepareDeploy, deployInstance } = require('./deploy');
const { updateExchangeRatesIfNeeded } = require('./rates');

const {
	constants: { SYNTHS_FILENAME },
	getPathToNetwork,
} = require('../../..');

function addSynths({ ctx, synths, useOvm }) {
	before(`add synths "${synths}" used for testing to system`, async () => {
		const network = hre.config.fork ? 'mainnet' : 'local';

		const { providerUrl, providerPort } = hre.config;

		const synthsFile = getPathToNetwork({ network, file: SYNTHS_FILENAME, path });
		const synthsContent = fs.readFileSync(synthsFile);

		// this mutates the synths.json for the network
		await prepareDeploy({
			network,
			useOvm,
			synthsToAdd: synths.map(name => ({ name, asset: 'USD' })),
		});

		await deployInstance({
			addNewSynths: true,
			freshDeploy: false,
			network,
			providerPort,
			providerUrl,
			useFork: hre.config.fork,
			useOvm,
		});

		// reset synths.json back to normal
		fs.writeFileSync(synthsFile, synthsContent);

		connectContracts({ ctx });

		await updateExchangeRatesIfNeeded({ ctx });
	});
}

module.exports = {
	addSynths,
};
