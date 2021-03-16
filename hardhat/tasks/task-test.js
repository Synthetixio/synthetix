const { task } = require('hardhat/config');
const { gray, yellow } = require('chalk');
const optimizeIfRequired = require('../util/optimizeIfRequired');

task('test')
	.addFlag('optimizer', 'Compile with the optimizer')
	.addFlag('gas', 'Compile gas usage')
	.addFlag('native', 'Compile with the native solc compiler')
	.addOptionalParam('gasOutputFile', 'Gas reporter output file')
	.addOptionalParam('grep', 'Filter tests to only those with given logic')
	.setAction(async (taskArguments, hre, runSuper) => {
		const { gas, grep, native, gasOutputFile, noCompile } = taskArguments;

		// apply a 90s timeout unless already set (for coverage say)
		hre.config.mocha.timeout = hre.config.mocha.timeout || 90e3;

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
