const { confirmAction } = require('../util');
const { gray, cyan } = require('chalk');

function logTx(tx) {
	console.log(gray(`  > tx hash: ${tx.transactionHash}`));
}

const confirmOrEnd = async (yes, isContract, message) => {
	try {
		if (yes) {
			console.log(message);
		} else {
			await confirmAction(
				message +
					cyan(
						`\nPlease type "y" to ${
							isContract ? 'stage' : 'submit'
						} transaction, or enter "n" to cancel and resume this later? (y/n) `
					)
			);
		}
	} catch (err) {
		console.log(gray('Operation cancelled'));
		process.exit();
	}
};

module.exports = {
	logTx,
	confirmOrEnd,
};
