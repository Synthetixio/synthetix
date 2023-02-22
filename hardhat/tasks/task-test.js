const Mocha = require('mocha');
const { task, subtask } = require('hardhat/config');
const { TASK_TEST_RUN_MOCHA_TESTS } = require('hardhat/builtin-tasks/task-names');
const { gray, yellow } = require('chalk');
const optimizeIfRequired = require('../util/optimizeIfRequired');
const isCI = require('is-ci');

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

let coverage = false;

task('coverage').setAction(async (taskArguments, hre, runSuper) => {
	coverage = true;
	await runSuper(taskArguments);
});

task('test')
	.addFlag('optimizer', 'Compile with the optimizer')
	.addFlag('gas', 'Compile gas usage')
	.addFlag('native', 'Compile with the native solc compiler')
	.addOptionalParam('gasOutputFile', 'Gas reporter output file')
	.setAction(async (taskArguments, hre, runSuper) => {
		const { gas, native, gasOutputFile } = taskArguments;

		if (native) {
			hre.config.solc.native = true;
		}

		optimizeIfRequired({ hre, taskArguments });

		if (gas) {
			console.log(gray(`Enabling ${yellow('gas')} reports, tests will run slower`));
			hre.config.gasReporter.enabled = true;
		}

		if (gasOutputFile) {
			hre.config.gasReporter.outputFile = gasOutputFile;
		}

		// When using CircleCI, output the test metadata
		// See https://circleci.com/docs/2.0/collect-test-data
		if (isCI && !coverage) {
			hre.config.mocha.reporter = 'mocha-junit-reporter';
			hre.config.mocha.reporterOptions = {
				mochaFile: '/tmp/junit/test-results.[hash].xml',
			};
		}

		await runSuper(taskArguments);
	});
