async function assertRevertOptimism({ tx, reason, provider }) {
	let receipt;
	let revertReason;

	try {
		const response = await tx;

		receipt = await response.wait();
	} catch (error) {
		const body = JSON.parse(error.error.error.body);
		revertReason = body.error.message;
	}

	if (receipt) {
		throw new Error(`Transaction was expected to revert with "${reason}", but it did not revert.`);
	} else {
		if (!revertReason.includes(reason)) {
			throw new Error(
				`Transaction was expected to revert with "${reason}", but it reverted with "${revertReason}" instead.`
			);
		}
	}
}

module.exports = {
	assertRevertOptimism,
};
