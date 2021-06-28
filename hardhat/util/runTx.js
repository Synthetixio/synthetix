const ethers = require('ethers');

async function sendTx({ txPromise }) {
	try {
		const tx = await txPromise;

		return {
			success: true,
			tx,
		};
	} catch (error) {
		return {
			success: false,
			error,
		};
	}
}

async function confirmTx({ tx, provider }) {
	try {
		const receipt = await tx.wait();

		return {
			success: true,
			receipt,
		};
	} catch (error) {
		try {
			error.reason = await getRevertReason({ tx, provider });

			return {
				success: false,
				error,
			};
		} catch (suberror) {
			error.error = suberror;

			return {
				success: false,
				error,
			};
		}
	}
}

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

async function getRevertReason({ tx, provider }) {
	const code = (await provider.call(tx)).substr(138);
	const hex = `0x${code}`;

	if (code.length === '64') {
		return ethers.utils.parseBytes32String(hex);
	} else {
		return _hexToString(hex);
	}
}

module.exports = {
	sendTx,
	confirmTx,
	getRevertReason,
};
