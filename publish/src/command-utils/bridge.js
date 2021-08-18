'use strict';

const getBatchCallData = ({ contractsCallData, OwnerRelayOnEthereum }) => {
	const targets = [];
	const datas = [];
	for (const contractCallData of contractsCallData) {
		const { address, calldata } = contractCallData;
		targets.push(address);
		datas.push(calldata);
	}
	return {
		targets,
		datas,
		batchData: OwnerRelayOnEthereum.interface.encodeFunctionData('initiateRelayBatch', [
			targets,
			datas,
		]),
	};
};

module.exports = {
	getBatchCallData,
};
