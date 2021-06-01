const { wait } = require('./rpc');

async function waitForEvent(contract, filter, fromBlockNumber, timeout = 7500) {
	const timeoutFn = async () => {
		await new Promise((resolve, reject) => setTimeout(resolve, timeout));
		return [];
	};

	const eventPolling = async () => {
		while (true) {
			const events = await contract.queryFilter(filter, fromBlockNumber, 'latest');
			if (events.length) return events;
			await wait(0.5);
		}
	};

	return Promise.race([timeoutFn(), eventPolling()]);
}

module.exports = {
	waitForEvent,
};
