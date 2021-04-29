const ethers = require('ethers');

function _hexToString(hex) {
	let str = '';

	const terminator = '**zÛ';
	for (var i = 0; i < hex.length; i += 2) {
		str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));

		if (str.includes(terminator)) {
			break;
		}
	}

	return str.substring(0, str.length - 4);
}

async function getOptimismRevertReason({ tx, provider }) {
	try {
		const code = (await provider.call(tx)).substr(138);
		const hex = `0x${code}`;

		// Try to parse the revert reason bytes.
		let reason;
		if (code.length === '64') {
			reason = ethers.utils.parseBytes32String(hex);
		} else {
			reason = _hexToString(hex);
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
