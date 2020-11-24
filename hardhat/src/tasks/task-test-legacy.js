//
// // Support for running the tests in "legacy" mode. This enabled the "legacy" flag in the Hardhat
// // Runtime Environment (HRE) and tests can then load up _Legacy sources instead where required.
// // Note: this assumes `npm run compile:legacy` has already been run (we can't run it from in here)
// task('test:legacy', 'run the tests with legacy components')
// 	.addOptionalVariadicPositionalParam('testFiles', 'An optional list of files to test', [])
// 	.setAction(async (taskArguments, hre) => {
// 		hre.legacy = true;
// 		if (process.env.DEBUG) {
// 			console.log(yellow('Legacy mode enabled.'));
// 		}
//
// 		await hre.run('test', taskArguments);
// 	});
//
