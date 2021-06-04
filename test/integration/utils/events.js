const { wait } = require('./rpc');

async function waitForEvent(
	contract,
	filter,
	fromBlockNumber,
	timeout = 7500,
	pollInterval = 1 / 1000
) {
	const timeoutFn = () =>
		new Promise((resolve, reject) =>
			setTimeout(() => reject(new Error('Timed out while waiting for event')), timeout)
		);

	const eventPolling = async () => {
		while (true) {
			const events = await contract.queryFilter(filter, fromBlockNumber, 'latest');
			if (events.length) return events;
			await wait(pollInterval);
		}
	};

	return Promise.race([timeoutFn(), eventPolling()]);
}

module.exports = {
	waitForEvent,
};
