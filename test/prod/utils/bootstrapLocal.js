const testUtils = require('../../utils/index');
const { toBytes32 } = require('../../..');
const { connectContract } = require('./connectContract');
const { web3 } = require('@nomiclabs/buidler');
const { toWei } = require('web3-utils');

const network = 'local';
let deploymentPath;

async function simulateExchangeRates() {
	const Issuer = await connectContract({
		network,
		deploymentPath,
		contractName: 'Issuer',
	});

	let currencyKeys = await Issuer.availableCurrencyKeys();
	currencyKeys = currencyKeys.filter(key => key !== toBytes32('sUSD'));
	const additionalKeys = ['ETH'].map(toBytes32); // The Depot uses the key "ETH" as opposed to "sETH" for its ether price
	currencyKeys.push(...additionalKeys);

	const ExchangeRates = await connectContract({
		network,
		deploymentPath,
		contractName: 'ExchangeRates',
	});

	const { currentTime } = testUtils({ web3 });
	const now = await currentTime();

	await ExchangeRates.updateRates(
		currencyKeys,
		currencyKeys.map(() => toWei('1')),
		now
	);
}

async function takeDebtSnapshot() {
	const DebtCache = await connectContract({
		network,
		deploymentPath,
		contractName: 'DebtCache',
	});

	await DebtCache.takeDebtSnapshot();
}

async function mockBridge() {
	const AddressResolver = await connectContract({
		network,
		deploymentPath,
		contractName: 'AddressResolver',
	});

	const mockAddress = '0x0000000000000000000000000000000000000001';
	await AddressResolver.importAddresses(
		['ovm:SynthetixBridgeToBase', 'base:SynthetixBridgeToOptimism', 'ext:Messenger'].map(toBytes32),
		[mockAddress, mockAddress, mockAddress]
	);

	const SynthetixBridgeToBase = await connectContract({
		network,
		deploymentPath,
		contractName: 'SynthetixBridgeToBase',
	});

	await SynthetixBridgeToBase.setResolverAndSyncCache(AddressResolver.address);
}

async function bootstrapLocal({ deploymentPath: _deploymentPath }) {
	deploymentPath = _deploymentPath;

	await simulateExchangeRates();
	await takeDebtSnapshot();

	if (deploymentPath.includes('ovm')) {
		await mockBridge();
	}
}

module.exports = {
	bootstrapLocal,
};
