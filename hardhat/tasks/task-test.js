const Mocha = require('mocha');
const { types, task, subtask } = require('hardhat/config');
const { TASK_TEST_RUN_MOCHA_TESTS } = require('hardhat/builtin-tasks/task-names');
const { gray, yellow } = require('chalk');
const optimizeIfRequired = require('../util/optimizeIfRequired');

// Override builtin "test:run-mocha-tests" subtask so we can use the local mocha
// installation, which is up to date and allows us to run parallel tests.
subtask(TASK_TEST_RUN_MOCHA_TESTS).setAction(async ({ testFiles }, { config }) => {
	const mocha = new Mocha(config.mocha);
	testFiles.forEach(file => mocha.addFile(file));

	const testFailures = await new Promise(resolve => {
		mocha.run(resolve);
	});

	return testFailures;
});

task('test')
	.addFlag('optimizer', 'Compile with the optimizer')
	.addFlag('gas', 'Compile gas usage')
	.addFlag('native', 'Compile with the native solc compiler')
	.addFlag('parallel', 'Run tests in parallel')
	.addOptionalParam('jobs', 'Max number of worker processes for parallel runs', 4, types.int)
	.addOptionalParam('gasOutputFile', 'Gas reporter output file')
	.addOptionalParam('grep', 'Filter tests to only those with given logic')
	.setAction(async (taskArguments, hre, runSuper) => {
		const { gas, grep, native, gasOutputFile, parallel, jobs } = taskArguments;

		if (native) {
			hre.config.solc.native = true;
		}

		optimizeIfRequired({ hre, taskArguments });

		if (parallel) {
			console.log(gray(`Running tests in parallel. Jobs count: ${jobs}`));
			hre.config.mocha.parallel = true;
			hre.config.mocha.jobs = jobs;
		}

		if (grep) {
			console.log(gray('Filtering tests to those containing'), yellow(grep));
			hre.config.mocha.grep = grep;
		}

		if (gas) {
			console.log(gray(`Enabling ${yellow('gas')} reports, tests will run slower`));
			hre.config.gasReporter.enabled = true;
		}

		if (gasOutputFile) {
			hre.config.gasReporter.outputFile = gasOutputFile;
		}

		await runSuper(taskArguments);
	});
