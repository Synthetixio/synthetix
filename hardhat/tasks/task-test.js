const { task } = require('hardhat/config');
const { gray, yellow } = require('chalk');
const optimizeIfRequired = require('../util/optimizeIfRequired');

task('test')
	.addFlag('optimizer', 'Compile with the optimizer')
	.addFlag('gas', 'Compile gas usage')
	.addFlag('useOvm', 'Run tests on the OVM using a custom OVM provider')
	.addFlag('native', 'Compile with the native solc compiler')
	.addOptionalParam('gasOutputFile', 'Gas reporter output file')
	.addOptionalParam('grep', 'Filter tests to only those with given logic')
	.setAction(async (taskArguments, hre, runSuper) => {
		const { gas, grep, useOvm, native, gasOutputFile, noCompile } = taskArguments;

		if (useOvm) {
			if (!noCompile) {
				await hre.run('compile', { useOvm });
			}

			if (!hre.config.prod) {
				hre.ovm = true;
			}

			console.log(gray('Running tests in the OVM...'));
			require('@eth-optimism/plugins/hardhat/compiler');
			require('@eth-optimism/plugins/hardhat/web3');

			if (!grep) {
				console.log(gray(`Ignoring test specs containing`, yellow('@ovm-skip')));
				hre.config.mocha.grep = '@ovm-skip';
				hre.config.mocha.invert = true;
			}
			hre.config.mocha.timeout = 3600e3; // 1hr timeout for ovm
		} else {
			// apply a 90s timeout unless already set (for coverage say)
			hre.config.mocha.timeout = hre.config.mocha.timeout || 90e3;
		}

		if (native) {
			hre.config.solc.native = true;
		}

		optimizeIfRequired({ hre, taskArguments });

		if (grep) {
			console.log(gray('Filtering tests to those containing'), yellow(grep));
			hre.config.mocha.grep = grep;
		}

		if (gas) {
			console.log(gray(`Enabling ${yellow('gas')} reports, tests will run slower`));
			hre.config.gasReporter.enabled = true;
			if (!grep) {
				console.log(gray(`Ignoring test specs containing`, yellow('@gas-skip')));
				hre.config.mocha.grep = '@gas-skip';
				hre.config.mocha.invert = true;
			}
		}

		if (gasOutputFile) {
			hre.config.gasReporter.outputFile = gasOutputFile;
		}

		await runSuper(taskArguments);
	});
