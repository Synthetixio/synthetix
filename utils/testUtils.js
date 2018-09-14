const BN = require('bn.js');

/**
 * Sets default properties on the jsonrpc object and promisifies it so we don't have to copy/paste everywhere.
 */
const send = payload => {
	if (!payload.jsonrpc) payload.jsonrpc = '2.0';
	if (!payload.id) payload.id = new Date().getTime();

	return new Promise((resolve, reject) => {
		web3.currentProvider.send(payload, (error, result) => {
			if (error) return reject(error);

			return resolve(result);
		});
	});
};

/**
 *  Mines a single block in Ganache (evm_mine is non-standard)
 */
const mineBlock = () => send({ method: 'evm_mine' });

/**
 *  Gets the current local time.
 */
const currentTime = () => Math.floor(Date.now() / 1000);

/**
 *  Increases the time in the EVM.
 *  @param seconds Number of seconds to increase the time by
 */
const fastForward = async seconds => {
	await send({
		method: 'evm_increaseTime',
		params: [seconds],
	});

	await mineBlock();
};

/**
 *  Increases the time in the EVM to as close to a specific date as possible
 *  NOTE: Because this operation figures out the amount of seconds to jump then applies that to the EVM,
 *  sometimes the result can vary by a second or two depending on how fast or slow ganache is responding.
 *  @param time Date object representing the desired time at the end of the operation
 */
const fastForwardTo = async time => {
	const now = new Date();
	if (time < now)
		throw new Error(
			`Time parameter (${time}) is less than now ${now}. You can only fast forward to times in the future.`
		);

	const secondsBetween = Math.floor((time.getTime() - now.getTime()) / 1000);

	await fastForward(secondsBetween);
};

/**
 *  Takes a snapshot and returns the ID of the snapshot for restoring later.
 */
const takeSnapshot = async () => {
	const { result } = await send({ method: 'evm_snapshot' });

	await mineBlock();

	return result;
};

/**
 *  Restores a snapshot that was previously taken with takeSnapshot
 *  @param id The ID that was returned when takeSnapshot was called.
 */
const restoreSnapshot = async id => {
	await send({
		method: 'evm_revert',
		params: [id],
	});

	await mineBlock();
};

/**
 *  Convenience method to assert that an event matches a shape
 *  @param actualEventOrTransaction The transaction receipt, or event as returned in the event logs from web3
 *  @param expectedEvent The event name you expect
 *  @param expectedArgs The args you expect in object notation, e.g. { newOracle: '0x...', updatedAt: '...' }
 */
const assertEventEqual = (actualEventOrTransaction, expectedEvent, expectedArgs) => {
	// If they pass in a whole transaction we need to extract the first log, otherwise we already have what we need
	const event = Array.isArray(actualEventOrTransaction.logs)
		? actualEventOrTransaction.logs[0]
		: actualEventOrTransaction;

	// Assert the names are the same.
	assert.equal(event.event, expectedEvent);

	assertDeepEqual(event.args, expectedArgs);
	// Note: this means that if you don't assert args they'll pass regardless.
	// Ensure you pass in all the args you need to assert on.
};

/**
 *  Convenience method to assert that two BN.js instances are equal.
 *  @param actualBN The BN.js instance you received
 *  @param expectedBN The BN.js amount you expected to receive
 */
const assertBNEqual = (actualBN, expectedBN) => {
	assert.equal(actualBN.toString(), expectedBN.toString());
};

/**
 *  Convenience method to assert that two BN.js instances are NOT equal.
 *  @param actualBN The BN.js instance you received
 *  @param expectedBN The BN.js amount you expected NOT to receive
 */
const assertBNNotEqual = (actualBN, expectedBN) => {
	assert.notEqual(actualBN.toString(), expectedBN.toString());
};

/**
 *  Convenience method to assert that two objects or arrays which contain nested BN.js instances are equal.
 *  @param actual What you received
 *  @param expected The shape you expected
 */
const assertDeepEqual = (actual, expected) => {
	// Check if it's a value type we can assert on straight away.
	if (BN.isBN(actual) || BN.isBN(expected)) {
		assertBNEqual(actual, expected);
	} else if (
		typeof expected === 'string' ||
		typeof actual === 'string' ||
		typeof expected === 'number' ||
		typeof actual === 'number' ||
		typeof expected === 'boolean' ||
		typeof actual === 'boolean'
	) {
		assert.equal(actual, expected);
	}
	// Otherwise dig through the deeper object and recurse
	else if (Array.isArray(expected)) {
		for (let i = 0; i < expected.length; i++) {
			assertDeepEqual(actual[i], expected[i]);
		}
	} else {
		for (const key of Object.keys(expected)) {
			assertDeepEqual(actual[key], expected[key]);
		}
	}
};

/**
 *  Convenience method to assert that an amount of ether (or other 10^18 number) was received from a contract.
 *  @param actualWei The value retrieved from a smart contract or wallet in wei
 *  @param expectedAmount The amount you expect e.g. '1'
 *  @param expectedUnit The unit you expect e.g. 'gwei'. Defaults to 'ether'
 */
const assertEtherEqual = (actualWei, expectedAmount, expectedUnit = 'ether') => {
	assertBNEqual(actualWei, web3.utils.toWei(expectedAmount, expectedUnit));
};

/**
 *  Convenience method to assert that an amount of ether (or other 10^18 number) was NOT received from a contract.
 *  @param actualWei The value retrieved from a smart contract or wallet in wei
 *  @param expectedAmount The amount you expect NOT to be equal to e.g. '1'
 *  @param expectedUnit The unit you expect e.g. 'gwei'. Defaults to 'ether'
 */
const assertEtherNotEqual = (actualWei, expectedAmount, expectedUnit = 'ether') => {
	assertBNNotEqual(actualWei, web3.utils.toWei(expectedAmount, expectedUnit));
};

const assertRevert = async blockOrPromise => {
	let errorCaught = false;
	try {
		const result = typeof blockOrPromise === 'function' ? blockOrPromise() : blockOrPromise;
		await result;
	} catch (error) {
		assert.include(error.message, 'revert');
		errorCaught = true;
	}

	assert.equal(errorCaught, true, 'Operation did not revert');
};

module.exports = {
	mineBlock,
	fastForward,
	fastForwardTo,
	takeSnapshot,
	restoreSnapshot,
	currentTime,

	assertEventEqual,
	assertBNEqual,
	assertBNNotEqual,
	assertEtherEqual,
	assertEtherNotEqual,
	assertRevert,
};
