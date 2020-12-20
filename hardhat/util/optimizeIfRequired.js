const { gray, yellow } = require('chalk');
const {
	DEFAULTS: { optimizerRuns },
} = require('../../publish/src/commands/build');

module.exports = ({ hre, taskArguments: { optimizer } }) => {
	if (optimizer || hre.optimizer) {
		// only show message once if re-run
		if (hre.optimizer === undefined) {
			console.log(gray('Adding optimizer, runs', yellow(optimizerRuns)));
		}
		// Use optimizer (slower) but simulates real contract size limits and gas usage
		// Note: does not consider actual deployed optimization runs from
		// publish/src/contract-overrides.js
		for (const compiler of hre.config.solidity.compilers) {
			compiler.settings.optimizer = { enabled: true, runs: optimizerRuns };
		}
		hre.config.networks.hardhat.allowUnlimitedContractSize = false;
	} else {
		if (hre.optimizer === undefined) {
			console.log(gray('Optimizer disabled. Unlimited contract sizes allowed.'));
		}
		for (const compiler of hre.config.solidity.compilers) {
			compiler.settings.optimizer = { enabled: false };
		}
		hre.config.networks.hardhat.allowUnlimitedContractSize = true;
	}

	// flag here so that if invoked via "hardhat test" the argument will persist to the compile stage
	hre.optimizer = !!optimizer;
};
