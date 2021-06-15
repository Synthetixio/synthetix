async function waitForEvent(contract, filter, fromBlockNumber, pollInterval = 10 / 1000) {
	const eventPolling = async () => {
		while (true) {
			const events = await contract.queryFilter(filter, fromBlockNumber, 'latest');
			if (events.length) return events;
			await new Promise((resolve, reject) => setTimeout(resolve, pollInterval));
		}
	};

	return eventPolling();
}

module.exports = {
	waitForEvent,
};
