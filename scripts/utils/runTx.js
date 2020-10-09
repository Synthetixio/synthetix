const ethers = require('ethers');

async function runTx({ tx, provider }) {
	try {
		const receipt = await tx.wait();

		return {
			success: true,
			receipt,
		};
	} catch (error) {
		error.tx = tx;

		try {
			// Try to get the revert reason when non is provided
			const code = await provider.call(tx);
			error.extraInfo = ethers.utils.parseBytes32String(`0x${code.substr(138)}`);

			return {
				success: false,
				error,
			};
		} catch (error) {
			error.tx = tx;
			error.reason = error.error.error; // Yep! This is correct.

			return {
				success: false,
				error,
			};
		}
	}
}

module.exports = {
	runTx,
};
