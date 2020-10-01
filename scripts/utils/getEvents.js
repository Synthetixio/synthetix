const { gray } = require('chalk');

async function getPastEvents({ contract, eventName, provider, fromBlock, toBlock }) {
	let filter = { address: contract.address };

	if (eventName) {
		filter = contract.filters[eventName]();
		if (!filter) throw new Error(`Event ${eventName} not found in contract abi.`);
	}

	filter.fromBlock = fromBlock || (await provider.getBlockNumber()) - 10000;
	filter.toBlock = toBlock || 'latest';

	console.log(
		gray(`  > Querying events ${eventName || '*'}, from: ${filter.fromBlock} to ${filter.toBlock}`)
	);

	let logs = await provider.getLogs(filter);
	logs = logs.map(log => contract.interface.parseLog(log));

	return logs;
}

module.exports = {
	getPastEvents,
};
