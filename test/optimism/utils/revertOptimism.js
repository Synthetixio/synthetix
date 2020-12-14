const ethers = require('ethers');

async function getOptimismRevertReason({ tx, provider }) {
	try {
		let code = await provider.call(tx);
		code = code.substr(138);

		// Try to parse the revert reason bytes.
		let reason;
		if (code.length === 64) {
			reason = ethers.utils.parseBytes32String(`0x${code}`);
		} else {
			reason = '';
			const chunks = code.match(/.{1,62}/g);
			chunks.map(chunk => {
				try {
					const parsed = ethers.utils.toUtf8String(`0x${chunk}00`);
					reason += parsed;
				} catch (error) {}
			});
		}

		return reason;
	} catch (suberror) {
		throw new Error(`Unable to parse revert reason: ${suberror}`);
	}
}

async function assertRevertOptimism({ tx, reason, provider }) {
	let receipt;
	let revertReason;
	try {
		receipt = await tx.wait();
	} catch (error) {
		revertReason = await getOptimismRevertReason({ tx, provider });
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
	getOptimismRevertReason,
	assertRevertOptimism,
};
