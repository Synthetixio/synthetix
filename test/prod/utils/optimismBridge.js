const { connectContract } = require('./connectContract');
const { toBytes32 } = require('../../..');
const { gray } = require('chalk');

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const MOCK_ADDRESS = '0x0000000000000000000000000000000000000001';

async function mockAddressIfNeeded({ alias, AddressResolver }) {
	const registeredAddress = await AddressResolver.getAddress(toBytes32(alias));
	if (registeredAddress === ZERO_ADDRESS) {
		await AddressResolver.importAddresses([toBytes32(alias)], [MOCK_ADDRESS]);
	}
}

async function syncCacheIfNeeded({ contract }) {
	const isCached = await contract.isResolverCached();
	if (!isCached) {
		await contract.rebuildCache();
	}
}

async function mockOptimismBridge({ network, deploymentPath }) {
	const SynthetixBridgeToBase = await connectContract({
		network,
		deploymentPath,
		contractName: 'SynthetixBridgeToBase',
	});

	if (!SynthetixBridgeToBase) {
		return;
	}

	console.log(gray('    > Mocking Optimism bridge...'));

	const AddressResolver = await connectContract({
		network,
		deploymentPath,
		contractName: 'AddressResolver',
	});

	await mockAddressIfNeeded({ alias: 'ovm:SynthetixBridgeToBase', AddressResolver });
	await mockAddressIfNeeded({ alias: 'base:SynthetixBridgeToOptimism', AddressResolver });
	await mockAddressIfNeeded({ alias: 'ext:Messenger', AddressResolver });

	await syncCacheIfNeeded({ contract: SynthetixBridgeToBase });
}

module.exports = {
	mockOptimismBridge,
};
