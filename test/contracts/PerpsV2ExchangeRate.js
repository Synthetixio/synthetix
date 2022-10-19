const { contract } = require('hardhat');
const { toBytes32 } = require('../..');
// const { toBN } = web3.utils;
// const { currentTime, fastForward, toUnit, multiplyDecimal, divideDecimal } = require('../utils')();

const { setupAllContracts, setupContract } = require('./setup');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const {
	getDecodedLogs,
	decodedEventEqual,
	ensureOnlyExpectedMutativeFunctions,
	onlyGivenAddressCanInvoke,
} = require('./helpers');
// const { inRange } = require('lodash');

contract('PerpsV2ExchangeRate', accounts => {
	let perpsV2ExchangeRate, mockPyth;

	const owner = accounts[1];
	const user1 = accounts[2];
	const user2 = accounts[3];
	const fakeAddress = accounts[4];

	before(async () => {
		({ PerpsV2ExchangeRate: perpsV2ExchangeRate } = await setupAllContracts({
			accounts,
			contracts: ['PerpsV2ExchangeRate', 'AddressResolver', 'SystemStatus', 'SystemSettings'],
		}));

		mockPyth = await setupContract({
			accounts,
			contract: 'MockPyth',
			args: [60, 1],
		});
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
				args: [fakeAddress],
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

	describe('Contract setup', () => {
		let tx;

		beforeEach('setup a mock oracle', async () => {
			tx = await perpsV2ExchangeRate.setOffchainOracle(mockPyth.address, { from: owner });
		});

		describe('gets configured', () => {
			it('emits a log', async () => {
				// The relevant events are properly emitted
				const decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [perpsV2ExchangeRate],
				});
				assert.equal(decodedLogs.length, 2);

				// Offchain oracle updated
				decodedEventEqual({
					event: 'OffchainOracleUpdated',
					emittedFrom: perpsV2ExchangeRate.address,
					args: [mockPyth.address],
					log: decodedLogs[1],
				});
			});

			it('has the right address', async () => {
				assert.equal(await perpsV2ExchangeRate.offchainOracle(), mockPyth.address);
			});
		});

		describe('when updating the offchain oracle address', () => {
			it('updates the address', async () => {
				const newMockPyth = await setupContract({
					accounts,
					contract: 'MockPyth',
					args: [60, 1],
				});

				const newAddress = newMockPyth.address;
				await perpsV2ExchangeRate.setOffchainOracle(newAddress, { from: owner });

				assert.equal(await perpsV2ExchangeRate.offchainOracle(), newAddress);
			});
		});

		describe('when setting up new feed ids', () => {
			const feeds = [
				{ assetId: toBytes32('sETH'), feedId: toBytes32('feed-sETH') },
				{ assetId: toBytes32('sBTC'), feedId: toBytes32('feed-sBTC') },
			];

			beforeEach('setup a couple of feeds', async () => {
				await perpsV2ExchangeRate.setOffchainPriceFeedId(feeds[0].assetId, feeds[0].feedId, {
					from: owner,
				});
				tx = await perpsV2ExchangeRate.setOffchainPriceFeedId(feeds[1].assetId, feeds[1].feedId, {
					from: owner,
				});
			});

			describe('gets configured', () => {
				it('emitted a log', async () => {
					// The relevant events are properly emitted
					const decodedLogs = await getDecodedLogs({
						hash: tx.tx,
						contracts: [perpsV2ExchangeRate],
					});
					assert.equal(decodedLogs.length, 2);

					// price feed id updated
					decodedEventEqual({
						event: 'OffchainPriceFeedIdUpdated',
						emittedFrom: perpsV2ExchangeRate.address,
						args: [feeds[1].assetId, feeds[1].feedId],
						log: decodedLogs[1],
					});
				});

				it('has the right information', async () => {
					assert.equal(
						await perpsV2ExchangeRate.offchainPriceFeedId(feeds[0].assetId),
						feeds[0].feedId
					);
					assert.equal(
						await perpsV2ExchangeRate.offchainPriceFeedId(feeds[1].assetId),
						feeds[1].feedId
					);
				});
			});

			describe('when retrieving a wrong assetId', () => {
				it('returns the 0x feedId', async () => {
					assert.equal(
						await perpsV2ExchangeRate.offchainPriceFeedId(toBytes32('not-this-one')),
						toBytes32('')
					);
				});
			});

			describe('when updating the feed ids', async () => {
				beforeEach('update a couple of feeds', async () => {
					await perpsV2ExchangeRate.setOffchainPriceFeedId(
						feeds[0].assetId,
						toBytes32('updatedFeedId'),
						{
							from: owner,
						}
					);
					await perpsV2ExchangeRate.setOffchainPriceFeedId(
						toBytes32('newAsset'),
						toBytes32('newFeedId'),
						{
							from: owner,
						}
					);
				});

				it('retrieves the updated value', async () => {
					assert.equal(
						await perpsV2ExchangeRate.offchainPriceFeedId(feeds[0].assetId),
						toBytes32('updatedFeedId')
					);
				});
				it('retrieves the new value', async () => {
					assert.equal(
						await perpsV2ExchangeRate.offchainPriceFeedId(toBytes32('newAsset')),
						toBytes32('newFeedId')
					);
				});
			});
		});
	});

	describe('Contract operations', () => {
		const feeds = [
			{ assetId: toBytes32('sETH'), feedId: toBytes32('feed-sETH') },
			{ assetId: toBytes32('sBTC'), feedId: toBytes32('feed-sBTC') },
		];

		const DEFAULT_FEED_ID = toBytes32('eth-price-feed');
		const DEFAULT_FEED_PRICE = 2000000000;
		const DEFAULT_FEED_CONF = 1000000;
		const DEFAULT_FEED_EXPO = 6;
		const DEFAULT_FEED_EMAPRICE = 2100000000;
		const DEFAULT_FEED_EMACONF = 1100000;

		async function getFeedUpdateData({
			id = DEFAULT_FEED_ID,
			price = DEFAULT_FEED_PRICE,
			conf = DEFAULT_FEED_CONF,
			expo = DEFAULT_FEED_EXPO,
			emaPrice = DEFAULT_FEED_EMAPRICE,
			emaConf = DEFAULT_FEED_EMACONF,
			publishTime,
		}) {
			const feedUpdateData = await mockPyth.createPriceFeedUpdateData(
				id,
				price,
				conf,
				expo,
				emaPrice,
				emaConf,
				publishTime || Math.floor(Date.now() / 1000)
			);

			return feedUpdateData;
		}

		beforeEach('setup a mock oracle and feeds', async () => {
			await perpsV2ExchangeRate.setOffchainOracle(mockPyth.address, { from: owner });
			await perpsV2ExchangeRate.setOffchainPriceFeedId(feeds[0].assetId, feeds[0].feedId, {
				from: owner,
			});
			await perpsV2ExchangeRate.setOffchainPriceFeedId(feeds[1].assetId, feeds[1].feedId, {
				from: owner,
			});
		});

		describe('when attempting to updatePythPrice without sending eth', () => {
			it('reverts if fee is > 0', async () => {
				// get updateFeedData
				const updateFeedData = await getFeedUpdateData({});

				await assert.revert(
					perpsV2ExchangeRate.updatePythPrice(user1, [updateFeedData], { from: user1 }),
					'Not enough eth for paying the fee'
				);

				// price feed doesn't exist
				assert.equal(await mockPyth.priceFeedExists(DEFAULT_FEED_ID), false);
			});

			it('allows it if fee is 0', async () => {
				// set fee to 0
				await mockPyth.mockUpdateFee(0, { from: user1 });

				// get updateFeedData
				const updateFeedData = await getFeedUpdateData({});
				await perpsV2ExchangeRate.updatePythPrice(user1, [updateFeedData], { from: user1 });

				// price feed exists
				assert.equal(await mockPyth.priceFeedExists(DEFAULT_FEED_ID), true);
			});
		});

		describe('when setting up new feed ids', () => {
			beforeEach('setup a couple of feeds', async () => {});
		});
	});
});
