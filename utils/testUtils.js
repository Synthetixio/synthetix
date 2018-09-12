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
 *  NOTE: Because this operation requires two EVM operations, sometimes the result can vary by a second or two
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

module.exports = {
	mineBlock,
	fastForward,
	fastForwardTo,
	takeSnapshot,
	restoreSnapshot,
};
