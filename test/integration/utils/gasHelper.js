const chalk = require('chalk');

async function runTxAndLogGasUsed(ctx, tx) {
	const receipt = await tx.wait();
	const gasUsed = receipt.gasUsed.toString();

	// Append to running test title.
	ctx._runnable.title = `${ctx._runnable.title} (${chalk.green(gasUsed)}${chalk.gray(' gas)')}`;
}

module.exports = {
	runTxAndLogGasUsed,
};
