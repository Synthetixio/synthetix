'use strict';

const { gray, yellow } = require('chalk');

const SafeBatchSubmitter = require('../SafeBatchSubmitter');

const safeInitializer = async ({ network, signer, safeAddress }) => {
	const safeBatchSubmitter = new SafeBatchSubmitter({ network, signer, safeAddress });
	try {
		// attempt to initialize a gnosis safe from the new owner
		const { currentNonce, pendingTxns } = await safeBatchSubmitter.init();
		console.log(
			gray(
				'Loaded safe at address',
				yellow(safeAddress),
				'nonce',
				yellow(currentNonce),
				'with',
				yellow(pendingTxns.count),
				'transactions pending signing'
			)
		);

		return safeBatchSubmitter;
	} catch (err) {
		if (
			!/Safe Proxy contract is not deployed in the current network/.test(err.message) &&
			!/Safe contracts not found in the current network/.test(err.message)
		) {
			// TODO: In the future we should throw here and get Gnosis to help fix these errors.
			console.error(err.message);
		}
	}
};

module.exports = {
	safeInitializer,
};
