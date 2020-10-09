const { green, red, cyan, gray } = require('chalk');

function logReceipt(receipt, contract) {
	console.log(green(`  ✅ Success`));

	if (receipt.transactionHash) console.log(gray(`    tx hash: ${receipt.transactionHash}`));

	if (contract && receipt.logs && receipt.logs.length > 0) {
		for (let i = 0; i < receipt.logs.length; i++) {
			const log = receipt.logs[i];

			try {
				const parsedLog = contract.interface.parseLog(log);
				console.log(gray(`    log ${i}:`), cyan(parsedLog.name));
			} catch (err) {
				console.log(gray(`    log ${i}: unable to decode log - ${JSON.stringify(log)}`));
			}
		}
	}
}

function logError(error) {
	console.log(red(`  ❌ Error`));

	if (error.tx && error.tx.hash) console.log(red(`    Tx hash: ${error.tx.hash}`));
	if (error.reason) console.log(red(`    Reason: ${error.reason}`));
	if (error.extraInfo) console.log(red(`    Extra info: ${error.extraInfo}`));

	console.log(gray(error));
}

module.exports = {
	logReceipt,
	logError,
};
