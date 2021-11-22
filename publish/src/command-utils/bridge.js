'use strict';

const getBatchCallData = ({ contractsCallData, OwnerRelayOnEthereum, xDomainGasLimit }) => {
	const targets = [];
	const payloads = [];
	for (const contractCallData of contractsCallData) {
		const { address, calldata } = contractCallData;
		targets.push(address);
		payloads.push(calldata);
	}
	return {
		targets,
		payloads,
		batchData: OwnerRelayOnEthereum.interface.encodeFunctionData('initiateRelayBatch', [
			targets,
			payloads,
			xDomainGasLimit,
		]),
	};
};

module.exports = {
	getBatchCallData,
};
