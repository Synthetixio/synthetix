const { contract, ethers, web3 } = require('hardhat');
const { toBytes32 } = require('../..');
const { currentTime, fastForward } = require('../utils')();
const { toBN } = web3.utils;

const { setupAllContracts, setupContract } = require('./setup');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const {
	getDecodedLogs,
	decodedEventEqual,
	ensureOnlyExpectedMutativeFunctions,
	onlyGivenAddressCanInvoke,
} = require('./helpers');

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
				expected: [
					'setOffchainOracle',
					'setOffchainPriceFeedId',
					'updatePythPrice',
					'addAssociatedContracts',
					'removeAssociatedContracts',
				],
			});
		});
	});

	describe('Contract access', () => {
		it('Only owner functions - oracle and priceFeeds', async () => {
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

		it('Only owner functions - access control', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: perpsV2ExchangeRate.addAssociatedContracts,
				args: [[fakeAddress]],
				accounts: [user1, user2],
				address: owner,
				skipPassCheck: true,
				reason: 'Only the contract owner may perform this action',
			});

			// Add one associated contract to remove
			await perpsV2ExchangeRate.addAssociatedContracts([fakeAddress], { from: owner });
			await onlyGivenAddressCanInvoke({
				fnc: perpsV2ExchangeRate.removeAssociatedContracts,
				args: [[fakeAddress]],
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

		describe('associated contract management', () => {
			beforeEach('setup a mock oracle', async () => {
				tx = await perpsV2ExchangeRate.addAssociatedContracts([user1], { from: owner });
			});

			it('emits a log', async () => {
				// The relevant events are properly emitted
				const decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [perpsV2ExchangeRate],
				});
				assert.equal(decodedLogs.length, 1);

				// Associated contract added
				decodedEventEqual({
					event: 'AssociatedContractAdded',
					emittedFrom: perpsV2ExchangeRate.address,
					args: [user1],
					log: decodedLogs[0],
				});
			});

			it('gets the list of associated contracts', async () => {
				const associatedContracts = await perpsV2ExchangeRate.associatedContracts();
				assert.isArray(associatedContracts);
				assert.equal(associatedContracts.length, 1);
				assert.equal(associatedContracts[0], user1);
			});

			it('adds new associated contracts', async () => {
				tx = await perpsV2ExchangeRate.addAssociatedContracts([fakeAddress], { from: owner });

				const associatedContracts = await perpsV2ExchangeRate.associatedContracts();
				assert.equal(associatedContracts.length, 2);
				assert.equal(associatedContracts[1], fakeAddress);
			});

			it('removes an associated contract', async () => {
				tx = await perpsV2ExchangeRate.removeAssociatedContracts([user1], { from: owner });

				const associatedContracts = await perpsV2ExchangeRate.associatedContracts();
				assert.equal(associatedContracts.length, 0);
			});
		});
	});

	describe('Contract operations', () => {
		const feeds = [
			{ assetId: toBytes32('sETH'), feedId: toBytes32('feed-sETH') },
			{ assetId: toBytes32('sBTC'), feedId: toBytes32('feed-sBTC') },
		];

		const defaultFeedId = toBytes32('eth-price-feed');
		const defaultFeedPrice = 1000000000;
		const defaultFeedConfidence = 1000000;
		const defaultFeedExpo = -6;
		const defaultFeedEMAPrice = 2100000000;
		const defaultFeedEMAConfidence = 1100000;

		async function getFeedUpdateData({
			id = defaultFeedId,
			price = defaultFeedPrice,
			conf = defaultFeedConfidence,
			expo = defaultFeedExpo,
			emaPrice = defaultFeedEMAPrice,
			emaConf = defaultFeedEMAConfidence,
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

		function feedPriceToBase18(price, feedExpo = defaultFeedExpo) {
			return toBN(price).mul(toBN(10 ** (18 + feedExpo)));
		}

		beforeEach('setup a mock oracle and feeds', async () => {
			await perpsV2ExchangeRate.addAssociatedContracts([user1], { from: owner });
			await perpsV2ExchangeRate.setOffchainOracle(mockPyth.address, { from: owner });
			await perpsV2ExchangeRate.setOffchainPriceFeedId(feeds[0].assetId, feeds[0].feedId, {
				from: owner,
			});
			await perpsV2ExchangeRate.setOffchainPriceFeedId(feeds[1].assetId, feeds[1].feedId, {
				from: owner,
			});
		});

		describe('when attempting to updatePythPrice with and without payment', () => {
			it('reverts if fee is > 0 and value = 0', async () => {
				// get updateFeedData
				const updateFeedData = await getFeedUpdateData({});

				await assert.revert(
					perpsV2ExchangeRate.updatePythPrice(user1, [updateFeedData], { from: user1 }),
					'Not enough eth for paying the fee'
				);

				// price feed doesn't exist
				assert.equal(await mockPyth.priceFeedExists(defaultFeedId), false);
			});

			it('allows it if fee is > 0 and sent value is enough', async () => {
				// price feed didn't exist before
				assert.equal(await mockPyth.priceFeedExists(defaultFeedId), false);

				// get updateFeedData
				const updateFeedData = await getFeedUpdateData({});

				await perpsV2ExchangeRate.updatePythPrice(user1, [updateFeedData], {
					from: user1,
					value: 1,
				});

				// price feed exists
				assert.equal(await mockPyth.priceFeedExists(defaultFeedId), true);
			});

			it('charges the right amount, even if sending more', async () => {
				// price feed didn't exist before
				assert.equal(await mockPyth.priceFeedExists(defaultFeedId), false);

				// get updateFeedData
				const updateFeedData = await getFeedUpdateData({});

				const beforeUserBalance = await ethers.provider.getBalance(user1);
				const beforePythBalance = await ethers.provider.getBalance(mockPyth.address);
				const beforePerpsBalance = await ethers.provider.getBalance(perpsV2ExchangeRate.address);

				const tx = await perpsV2ExchangeRate.updatePythPrice(user1, [updateFeedData], {
					from: user1,
					value: 100,
				});

				const afterUserBalance = await ethers.provider.getBalance(user1);
				const afterPythBalance = await ethers.provider.getBalance(mockPyth.address);
				const afterPerpsBalance = await ethers.provider.getBalance(perpsV2ExchangeRate.address);

				const weiUsedInTx = tx.receipt.effectiveGasPrice * tx.receipt.gasUsed;

				// price feed exists
				assert.equal(await mockPyth.priceFeedExists(defaultFeedId), true);

				assert.equal(afterPythBalance.toString(), beforePythBalance.add(1).toString());
				assert.equal(afterPerpsBalance.toString(), beforePerpsBalance.toString());
				assert.equal(
					afterUserBalance.toString(),
					beforeUserBalance
						.sub(weiUsedInTx)
						.sub(1)
						.toString()
				);
			});

			it('allows it if fee is 0', async () => {
				// price feed didn't exist before
				assert.equal(await mockPyth.priceFeedExists(defaultFeedId), false);

				// set fee to 0
				await mockPyth.mockUpdateFee(0, { from: user1 });

				// get updateFeedData
				const updateFeedData = await getFeedUpdateData({});

				await perpsV2ExchangeRate.updatePythPrice(user1, [updateFeedData], { from: user1 });

				// price feed exists
				assert.equal(await mockPyth.priceFeedExists(defaultFeedId), true);
			});
		});

		describe('when getting price updates', () => {
			const feed1Asset = feeds[0].assetId;
			const feed1Id = feeds[0].feedId;
			const feed1Price = defaultFeedPrice;
			const feed2Asset = feeds[1].assetId;
			let feedPublishTimesamp;

			beforeEach('add initial feed data for feeds', async () => {
				feedPublishTimesamp = await currentTime();
				// set fee to 0
				await mockPyth.mockUpdateFee(0, { from: user1 });
				const updateFeedData = await getFeedUpdateData({
					id: feed1Id,
					price: feed1Price,
					publishTime: feedPublishTimesamp,
				});
				await perpsV2ExchangeRate.updatePythPrice(user1, [updateFeedData], { from: user1 });
			});

			describe('resolveAndGetLatestPrice', () => {
				beforeEach('move in time', async () => {
					await fastForward(100); // fast forward by 100 seconds
				});

				describe('get a valid price feed', () => {
					it('gets the right values', async () => {
						const price = await perpsV2ExchangeRate.resolveAndGetLatestPrice(feed1Asset);

						assert.bnEqual(price.price, feedPriceToBase18(feed1Price));

						assert.bnEqual(price.publishTime, feedPublishTimesamp);
					});
				});

				describe('attempt to get an invalid price feed', () => {
					it('reverts', async () => {
						await assert.revert(
							perpsV2ExchangeRate.resolveAndGetLatestPrice(toBytes32('wrongAsset')),
							'No price feed found for asset'
						);
					});
				});

				describe('attempt to get an uninitalized price feed', () => {
					it('reverts', async () => {
						await assert.revert(
							perpsV2ExchangeRate.resolveAndGetLatestPrice(feed2Asset),
							'no price feed found for the given price id'
						);
					});
				});
			});

			describe('resolveAndGetPrice', () => {
				beforeEach('move in time', async () => {
					await fastForward(100); // fast forward by 100 seconds
				});

				describe('get a valid price feed in time', () => {
					it('gets the right values', async () => {
						// Add some secs in the valid age
						const price = await perpsV2ExchangeRate.resolveAndGetPrice(feed1Asset, 105);

						assert.bnEqual(price.price, feedPriceToBase18(feed1Price));

						assert.bnEqual(price.publishTime, feedPublishTimesamp);
					});
				});

				describe('attempt to get a valid price feed too old', () => {
					it('reverts', async () => {
						await assert.revert(
							perpsV2ExchangeRate.resolveAndGetPrice(feed1Asset, 99),
							'no price available which is recent enough'
						);
					});
				});

				describe('attempt to get an in valid price feed', () => {
					it('reverts', async () => {
						await assert.revert(
							perpsV2ExchangeRate.resolveAndGetPrice(toBytes32('wrongAsset'), 1000),
							'No price feed found for asset'
						);
					});
				});

				describe('attempt to get an uninitalized price feed', () => {
					it('reverts', async () => {
						await assert.revert(
							perpsV2ExchangeRate.resolveAndGetPrice(feed2Asset, 1000),
							'no price feed found for the given price id'
						);
					});
				});
			});
		});
	});
});
