const { task } = require('hardhat/config');
const { yellow, red } = require('chalk');

const optimizeIfRequired = require('../util/optimizeIfRequired');

const { collectContractBytesCodes } = require('../util/collectContractBytecodes');
const { logContractSizes } = require('../../publish/src/contract-size');

task('compile')
	.addFlag('showsize', 'Show size of compiled contracts')
	.addFlag('optimizer', 'Compile with the optimizer')
	.addFlag('failOversize', 'Fail if any contract is oversize')
	.addFlag('native', 'Compile with the native solc compiler')
	.addFlag('everything', 'Compile all subfolders regardless of ignore patterns')
	.setAction(async (taskArguments, hre, runSuper) => {
		if (taskArguments.native) {
			hre.config.solc.native = true;
		}

		optimizeIfRequired({ hre, taskArguments });

		// remove ignore pattern if requested
		if (taskArguments.everything) {
			hre.config.paths.ignore = undefined;
		}

		await runSuper(taskArguments);

		if (taskArguments.showsize || taskArguments.failOversize) {
			const contractToObjectMap = collectContractBytesCodes();
			const sizes = logContractSizes({ contractToObjectMap });

			if (taskArguments.failOversize) {
				const offenders = sizes.filter(entry => +entry.pcent.split('%')[0] > 100);
				if (offenders.length > 0) {
					const names = offenders.map(o => o.file);
					console.log(red('Oversized contracts:'), yellow(`[${names}]`));
					throw new Error(
						'Compilation failed, because some contracts are too big to be deployed. See above.'
					);
				}
			}
		}
	});
