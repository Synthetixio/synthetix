const { contract } = require('hardhat');
const { toBytes32 } = require('../..');
// const { toBN } = web3.utils;
// const { currentTime, fastForward, toUnit, multiplyDecimal, divideDecimal } = require('../utils')();

const { setupAllContracts } = require('./setup');
const {
	// assert,
	addSnapshotBeforeRestoreAfterEach,
} = require('./common');
const {
	// getDecodedLogs,
	// decodedEventEqual,
	ensureOnlyExpectedMutativeFunctions,
	// updateAggregatorRates,
	onlyGivenAddressCanInvoke,
} = require('./helpers');

contract('PerpsV2ExchangeRate', accounts => {
	let perpsV2ExchangeRate;

	const owner = accounts[1];
	const user1 = accounts[2];
	const user2 = accounts[3];

	before(async () => {
		({ PerpsV2ExchangeRate: perpsV2ExchangeRate } = await setupAllContracts({
			accounts,
			contracts: ['PerpsV2ExchangeRate', 'AddressResolver', 'SystemStatus', 'SystemSettings'],
		}));
	});

	addSnapshotBeforeRestoreAfterEach();

	describe('Basic parameters', () => {
		it('Only expected functions are mutative', () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: perpsV2ExchangeRate.abi,
				ignoreParents: ['MixinSystemSettings', 'Owned'],
				expected: ['setOffchainOracle', 'setOffchainPriceFeedId', 'updatePythPrice'],
			});
		});
	});

	describe('Contract access', () => {
		it('Only owner functions', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: perpsV2ExchangeRate.setOffchainOracle,
				args: [user2],
				accounts: [user1, user2],
				address: owner,
				reason: 'Only the contract owner may perform this action',
			});

			await onlyGivenAddressCanInvoke({
				fnc: perpsV2ExchangeRate.setOffchainPriceFeedId,
				args: [toBytes32('key'), toBytes32('feedId')],
				accounts: [user1, user2],
				address: owner,
				reason: 'Only the contract owner may perform this action',
			});
		});
	});
});
