const chalk = require('chalk');

function skipIfL2({ ctx, reason }) {
	before('skip if running on :2', async function() {
		if (!ctx.useOvm) {
			return;
		}

		if (!reason) {
			throw new Error('Please specify a reason when skipping L2 tests.');
		}
		console.log(chalk.yellow(`>> Skipping L2 tests because ${reason}`));

		this.skip();
	});
}

module.exports = {
	skipIfL2,
};
