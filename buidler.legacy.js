const { task } = require('@nomiclabs/buidler/config');

task('compile', 'compilation', async (taskArguments, bre, runSuper) => {
	await runSuper();

	// TODO, move sources
	console.log('Built');
});

module.exports = {
	solc: {
		version: '0.4.25',
	},
	paths: {
		sources: './legacy',
		artifacts: './build/artifacts-legacy',
		cache: './build/cache',
	},
};
