const { artifacts, contract, web3 } = require('hardhat');
const { toBN } = web3.utils;
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { updateAggregatorRates } = require('./helpers');
const { setupAllContracts } = require('./setup');
const { toUnit } = require('../utils')();
const { toBytes32 } = require('../..');
const {
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
	getDecodedLogs,
	decodedEventEqual,
} = require('./helpers');

const MockExchanger = artifacts.require('MockExchanger');

contract('PerpsManagerV2', accounts => {
	let perpsManager,
		futuresManager,
		// v2
		perpsSettings,
		perpsStorage,
		perpsEngine,
		perpsOrders,
		systemSettings,
		exchangeRates,
		exchangeCircuitBreaker,
		sUSD,
		debtCache,
		synthetix,
		addressResolver;
	const owner = accounts[1];
	const trader = accounts[2];
	const mockEngine = accounts[3];
	const initialMint = toUnit('100000');

	async function setPrice(asset, price, resetCircuitBreaker = true) {
		await updateAggregatorRates(exchangeRates, [asset], [price]);
		// reset the last price to the new price, so that we don't trip the breaker
		// on various tests that change prices beyond the allowed deviation
		if (resetCircuitBreaker) {
			// flag defaults to true because the circuit breaker is not tested in most tests
			await exchangeCircuitBreaker.resetLastExchangeRate([asset], { from: owner });
		}
	}

	before(async () => {
		({
			FuturesMarketManager: futuresManager,
			PerpsManagerV2: perpsManager,
			// FuturesMarketSettings: futuresMarketSettings,
			PerpsSettingsV2: perpsSettings,
			PerpsStorageV2: perpsStorage,
			PerpsEngineV2: perpsEngine,
			PerpsOrdersV2: perpsOrders,
			ExchangeRates: exchangeRates,
			ExchangeCircuitBreaker: exchangeCircuitBreaker,
			SynthsUSD: sUSD,
			DebtCache: debtCache,
			Synthetix: synthetix,
			AddressResolver: addressResolver,
			SystemSettings: systemSettings,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD'],
			feeds: ['BTC', 'ETH', 'LINK'],
			contracts: [
				'FuturesMarketManager',
				// 'FuturesMarketSettings',
				'PerpsManagerV2',
				'PerpsSettingsV2',
				// 'PerpsStorageV2',
				// 'PerpsEngineV2',
				// 'PerpsOrdersV2',
				'AddressResolver',
				'FeePool',
				'ExchangeRates',
				'ExchangeCircuitBreaker',
				'SystemStatus',
				'SystemSettings',
				'Synthetix',
				'Exchanger',
				'DebtCache',
				'CollateralManager',
			],
		}));

		await sUSD.issue(trader, initialMint, { from: owner });
	});

	addSnapshotBeforeRestoreAfterEach();

	// this makes the minimal configuration changes to allow margin operations
	async function configureMarket(marketKey) {
		await perpsSettings.setMaxFundingRate(marketKey, toUnit('0.1'), { from: owner });
	}

	describe('Basic parameters', () => {
		it('requires expected contracts', async () => {
			const actual = await perpsManager.resolverAddressesRequired();
			assert.deepEqual(
				actual,
				['PerpsEngineV2', 'PerpsOrdersV2', 'FuturesMarketManager'].map(toBytes32)
			);
		});

		it('only expected functions are mutable', () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: perpsManager.abi,
				ignoreParents: ['Owned', 'MixinResolver'],
				expected: ['addMarkets', 'removeMarkets', 'issueSUSD', 'burnSUSD', 'payFee'],
			});
		});

		it('contract has CONTRACT_NAME getter', async () => {
			assert.equal(await perpsManager.CONTRACT_NAME(), toBytes32('PerpsManagerV2'));
		});
	});

	describe('Market management', () => {
		const marketKeys = ['pBTC', 'pETH'].map(toBytes32);
		const baseAssets = ['BTC', 'ETH'].map(toBytes32);

		beforeEach(async () => {
			await perpsManager.addMarkets(marketKeys, baseAssets, { from: owner });
		});

		async function checkSingleMarketAdded(marketKey, baseAsset) {
			// check it's not known to storage
			assert.equal((await perpsStorage.marketScalars(marketKey)).baseAsset, toBytes32(''));
			// engine doesn't know about it
			await assert.revert(perpsEngine.marketSummary(marketKey), 'market not initialised');
			// not approved for trading
			assert.isFalse(await perpsManager.approvedRouterAndMarket(perpsOrders.address, marketKey));

			await perpsManager.addMarkets([marketKey], [baseAsset], { from: owner });
			assert.bnEqual(await perpsManager.numMarkets(), toBN(3));
			assert.equal((await perpsManager.markets(2, 1))[0], marketKey);

			// known to storage
			assert.equal((await perpsStorage.marketScalars(marketKey)).baseAsset, baseAsset);
			// known to engine but is misconfigured
			await assert.revert(perpsEngine.marketSummary(marketKey), 'max funding rate 0');
			// approved for trading
			assert.isTrue(await perpsManager.approvedRouterAndMarket(perpsOrders.address, marketKey));
		}

		it('Added the two initial markets', async () => {
			assert.isTrue(await perpsManager.isMarket(marketKeys[0]));
			assert.isTrue(await perpsManager.isMarket(marketKeys[1]));
			assert.isTrue(await perpsManager.approvedRouterAndMarket(perpsOrders.address, marketKeys[0]));
			assert.isTrue(await perpsManager.approvedRouterAndMarket(perpsOrders.address, marketKeys[1]));
		});

		it('Adding a single market', async () => {
			const markets = await perpsManager.allMarkets();
			assert.bnEqual(await perpsManager.numMarkets(), toBN(markets.length));
			assert.equal(markets.length, 2);
			assert.deepEqual(markets, marketKeys);

			await checkSingleMarketAdded(toBytes32('pLINK'), toBytes32('LINK'));
		});

		it('Adding multiple markets', async () => {
			const keys = ['pLINK', 'pSNX'].map(toBytes32);
			const assets = ['LINK', 'SNX'].map(toBytes32);
			const tx = await perpsManager.addMarkets(keys, assets, { from: owner });
			assert.bnEqual(await perpsManager.numMarkets(), toBN(4));
			assert.deepEqual(await perpsManager.markets(2, 2), keys);

			const decodedLogs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [perpsStorage, perpsManager],
			});
			assert.equal(decodedLogs.length, 4);
			decodedEventEqual({
				event: 'MarketInitialised',
				emittedFrom: perpsStorage.address,
				args: [keys[0], assets[0]],
				log: decodedLogs[0],
			});
			decodedEventEqual({
				event: 'MarketAdded',
				emittedFrom: perpsManager.address,
				args: [assets[0], keys[0]],
				log: decodedLogs[1],
			});
			decodedEventEqual({
				event: 'MarketAdded',
				emittedFrom: perpsManager.address,
				args: [assets[1], keys[1]],
				log: decodedLogs[3],
			});
		});

		it('Cannot add more than one market for the same key.', async () => {
			await assert.revert(
				perpsManager.addMarkets([marketKeys[0]], [baseAssets[0]], { from: owner }),
				'Market key exists'
			);
		});

		it('Can add more than one market for the same asset', async () => {
			// different market key
			await checkSingleMarketAdded(toBytes32('pETH-2'), baseAssets[1]);
		});

		it('Removing a single market', async () => {
			const marketKey = marketKeys[0];
			assert.isTrue(await perpsManager.approvedRouterAndMarket(perpsOrders.address, marketKey));
			await perpsManager.removeMarkets([marketKey], { from: owner });
			const markets = await perpsManager.allMarkets();
			assert.bnEqual(await perpsManager.numMarkets(), toBN(1));
			assert.deepEqual(markets, [marketKeys[1]]);
			assert.isFalse(await perpsManager.isMarket(marketKey));
			assert.isFalse(await perpsManager.approvedRouterAndMarket(perpsOrders.address, marketKey));
		});

		it('Removing multiple markets', async () => {
			const tx = await perpsManager.removeMarkets(marketKeys, { from: owner });
			const markets = await perpsManager.allMarkets();
			assert.bnEqual(await perpsManager.numMarkets(), toBN(0));
			assert.deepEqual(markets, []);
			assert.isFalse(await perpsManager.isMarket(marketKeys[0]));
			assert.isFalse(await perpsManager.isMarket(marketKeys[1]));
			assert.isFalse(
				await perpsManager.approvedRouterAndMarket(perpsOrders.address, marketKeys[0])
			);
			assert.isFalse(
				await perpsManager.approvedRouterAndMarket(perpsOrders.address, marketKeys[1])
			);

			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [perpsManager] });
			assert.equal(decodedLogs.length, 2);
			decodedEventEqual({
				event: 'MarketRemoved',
				emittedFrom: perpsManager.address,
				args: [baseAssets[0], marketKeys[0]],
				log: decodedLogs[0],
			});
			decodedEventEqual({
				event: 'MarketRemoved',
				emittedFrom: perpsManager.address,
				args: [baseAssets[1], marketKeys[1]],
				log: decodedLogs[1],
			});
		});

		it('Cannot remove a market which does not exist', async () => {
			await assert.revert(
				perpsManager.removeMarkets([toBytes32('pLINK')], { from: owner }),
				'Unknown market'
			);
		});

		it('Only the owner can add or remove markets', async () => {
			const revertReason = 'Only the contract owner may perform this action';

			await onlyGivenAddressCanInvoke({
				fnc: perpsManager.addMarkets,
				args: [[toBytes32('pLINK')], [toBytes32('LINK')]],
				accounts,
				address: owner,
				skipPassCheck: false,
				reason: revertReason,
			});

			await onlyGivenAddressCanInvoke({
				fnc: perpsManager.removeMarkets,
				args: [marketKeys],
				accounts,
				address: owner,
				skipPassCheck: false,
				reason: revertReason,
			});
		});
	});

	describe('sUSD issuance', () => {
		beforeEach(async () => {
			// grant mockEngine the permission to call sUSD methods
			await addressResolver.importAddresses(['PerpsEngineV2'].map(toBytes32), [mockEngine], {
				from: owner,
			});
			await perpsManager.rebuildCache();
		});

		it('issuing/burning sUSD', async () => {
			await perpsManager.issueSUSD(owner, toUnit('10'), { from: mockEngine });
			assert.bnEqual(await sUSD.balanceOf(owner), toUnit('10'));

			await perpsManager.burnSUSD(owner, toUnit('5'), { from: mockEngine });
			assert.bnEqual(await sUSD.balanceOf(owner), toUnit('5'));

			await perpsManager.issueSUSD(owner, toUnit('2'), { from: mockEngine });
			await perpsManager.burnSUSD(owner, toUnit('7'), { from: mockEngine });

			assert.bnEqual(await sUSD.balanceOf(owner), toUnit('0'));
			await assert.revert(
				perpsManager.burnSUSD(owner, toUnit('1'), { from: mockEngine }),
				'SafeMath: subtraction overflow'
			);
		});

		it('burning respects settlement', async () => {
			// Set up a mock exchanger
			const mockExchanger = await MockExchanger.new(synthetix.address);
			await addressResolver.importAddresses(['Exchanger'].map(toBytes32), [mockExchanger.address], {
				from: owner,
			});
			await synthetix.rebuildCache();
			await perpsManager.rebuildCache();
			// actual burning is handled by futures manager
			// so for reclamantion mock to work it needs to talk to the right exchanger
			await futuresManager.rebuildCache();

			await mockExchanger.setReclaim(toUnit('10'));
			await mockExchanger.setNumEntries('1');

			// Issuance works fine
			await perpsManager.issueSUSD(owner, toUnit('100'), { from: mockEngine });
			assert.bnEqual(await sUSD.balanceOf(owner), toUnit('100'));

			// But burning properly deducts the reclamation amount
			await perpsManager.burnSUSD(owner, toUnit('90'), { from: mockEngine });
			assert.bnEqual(await sUSD.balanceOf(owner), toUnit('0'));
		});

		it('only engine is permitted to issue or burn sUSD', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: perpsManager.issueSUSD,
				args: [owner, toUnit('1')],
				accounts,
				address: mockEngine,
				skipPassCheck: true,
				reason: 'Only engine',
			});
			await onlyGivenAddressCanInvoke({
				fnc: perpsManager.burnSUSD,
				args: [owner, toUnit('1')],
				accounts,
				address: mockEngine,
				skipPassCheck: true,
				reason: 'Only engine',
			});
		});
	});

	describe('Aggregated Debt', () => {
		it('perps debt is zero when no markets are deployed', async () => {
			// check initial debt
			const initialSystemDebt = (await debtCache.currentDebt())[0];
			// issue some sUSD
			sUSD.issue(trader, toUnit(100), { from: owner });
			await debtCache.takeDebtSnapshot();
			// check debt currentDebt() works as expected
			assert.bnEqual((await debtCache.currentDebt())[0], initialSystemDebt.add(toUnit(100)));
		});

		it('no debt initially', async () => {
			assert.bnEqual((await perpsManager.totalDebt())[0], 0);
			assert.bnEqual((await futuresManager.totalDebt())[0], 0);
		});

		describe('when there are multiple markets', () => {
			const individualDebt = toUnit('1000');
			const assetKeys = ['BTC', 'ETH', 'LINK'].map(toBytes32);
			const marketKeys = ['pBTC', 'pETH', 'pLINK'].map(toBytes32);

			async function modifyDebt(marketKey, amount) {
				await perpsOrders.transferMargin(marketKey, amount, { from: trader });
			}

			beforeEach(async () => {
				await perpsManager.addMarkets(marketKeys, assetKeys, { from: owner });
				for (const key of marketKeys) {
					await configureMarket(key);
					await modifyDebt(key, individualDebt);
				}
			});

			it('Aggregated debt updates properly as the debt values change', async () => {
				assert.bnEqual((await perpsManager.totalDebt())[0], individualDebt.mul(toBN(3)));
				// check futures manager is the same
				assert.bnEqual((await futuresManager.totalDebt())[0], individualDebt.mul(toBN(3)));

				const initialSystemDebt = (await debtCache.currentDebt())[0];
				assert.bnEqual(initialSystemDebt, initialMint); // no new debt because of the deposit
				await modifyDebt(marketKeys[0], toUnit('1500')); // should be 2500 now
				await modifyDebt(marketKeys[1], toUnit('-800')); // should be 200 now
				assert.bnEqual((await perpsManager.totalDebt())[0], toUnit('3700'));
				assert.bnEqual((await debtCache.currentDebt())[0], initialSystemDebt);

				// remove one of the markets
				await perpsManager.removeMarkets([marketKeys[2]], { from: owner });
				assert.bnEqual((await perpsManager.totalDebt())[0], toUnit('2700'));
				// global debt is lower because the $1000 margin in removed market is unaccounted for
				assert.bnEqual((await debtCache.currentDebt())[0], initialSystemDebt.sub(individualDebt));

				// add another market
				const marketKey = toBytes32('pLINK-2');
				await perpsManager.addMarkets([marketKey], [toBytes32('LINK')], { from: owner });
				await configureMarket(marketKey);
				await modifyDebt(marketKey, toUnit('4000'));

				assert.bnEqual((await perpsManager.totalDebt())[0], toUnit('6700'));
				assert.bnEqual((await debtCache.currentDebt())[0], initialSystemDebt.sub(individualDebt));
			});

			it('Aggregated debt validity updates with invalid rates', async () => {
				assert.isFalse((await perpsManager.totalDebt())[1]);
				assert.isFalse((await debtCache.currentDebt())[1]);

				// all rates are invlid!
				await systemSettings.setRateStalePeriod(0, { from: owner });
				assert.isTrue((await perpsManager.totalDebt())[1]);
				assert.isTrue((await debtCache.currentDebt())[1]);

				// TODO: invalidate a single rate, and check that validity tracks that
			});
		});
	});

	// helpful views
	describe('Market summaries', () => {
		const traderInitialBalance = toUnit(1000000);
		const assets = ['BTC', 'ETH', 'LINK'];
		const marketKeys = [];
		const assetKeys = [];

		beforeEach(async () => {
			for (const symbol of assets) {
				const assetKey = toBytes32(symbol);
				const marketKey = toBytes32('p' + symbol);

				marketKeys.push(marketKey);
				assetKeys.push(assetKey);
				await perpsManager.addMarkets([marketKey], [assetKey], { from: owner });

				await setPrice(assetKey, toUnit(1000));

				// Now that the market exists we can set the all its parameters
				await perpsSettings.setParameters(
					marketKey,
					toUnit('0.005'), // 0.5% base fee
					toUnit('0.0005'), // 0.05% base fee next price
					toBN('2'), // 2 rounds next price confirm window
					toUnit('5'), // 5x max leverage
					toUnit('1000000'), // 1000000 max total margin
					toUnit('0.2'), // 20% max funding rate
					toUnit('100000'), // 100000 USD skewScaleUSD
					{ from: owner }
				);
			}

			// disable dynamic fee for simpler testing
			await systemSettings.setExchangeDynamicFeeRounds('0', { from: owner });

			// Issue the traders some sUSD
			await sUSD.issue(trader, traderInitialBalance);

			// Update the rates to ensure they aren't stale
			await setPrice(assetKeys[0], toUnit(100));

			// The traders take positions on market
			await perpsOrders.transferMargin(marketKeys[0], toUnit('1000'), { from: trader });
			await perpsOrders.modifyPosition(marketKeys[0], toUnit('5'), { from: trader });

			await perpsOrders.transferMargin(marketKeys[1], toUnit('3000'), { from: trader });
			await perpsOrders.modifyPosition(marketKeys[1], toUnit('4'), { from: trader });
			await setPrice(assetKeys[1], toUnit('1000'));
		});

		it('For markets', async () => {
			const assetKey = assetKeys[1];
			const marketKey = marketKeys[1];
			const summary = (await perpsManager.marketSummaries([marketKey]))[0];
			const summaryEngine = await perpsEngine.marketSummary(marketKey);
			const { price } = await perpsEngine.assetPrice(marketKey);

			assert.deepEqual(summary, summaryEngine);

			assert.equal(summary.marketKey, marketKey);
			assert.equal(summary.baseAsset, assetKey);
			assert.equal(summary.price, price);
		});

		it('all summaries and by key summaries', async () => {
			const allSummaries = await perpsManager.allMarketSummaries();
			const summariesForKeys = await perpsManager.marketSummaries(marketKeys.slice(0, 2));
			assert.equal(JSON.stringify(allSummaries.slice(0, 2)), JSON.stringify(summariesForKeys));
		});

		it('All summaries', async () => {
			const summaries = await perpsManager.allMarketSummaries();

			const btcSummary = summaries.find(summary => summary.marketKey === toBytes32('pBTC'));
			const ethSummary = summaries.find(summary => summary.marketKey === toBytes32('pETH'));
			const linkSummary = summaries.find(summary => summary.marketKey === toBytes32('pLINK'));

			assert.equal(btcSummary.baseAsset, assetKeys[0]);
			let price = await perpsEngine.assetPrice(marketKeys[0]);
			assert.equal(btcSummary.price, price.price);
			assert.equal(btcSummary.marketSize, toUnit(5));
			assert.equal(btcSummary.marketSkew, toUnit(5));
			assert.bnClose(btcSummary.marketDebt, toUnit(1000), toUnit(50)); // due to fees
			assert.bnLt(btcSummary.currentFundingRate, 0);

			assert.equal(ethSummary.baseAsset, assetKeys[1]);
			price = await perpsEngine.assetPrice(marketKeys[1]);
			assert.equal(ethSummary.price, price.price);
			assert.equal(ethSummary.marketSize, toUnit(4));
			assert.equal(ethSummary.marketSkew, toUnit(4));
			assert.bnClose(ethSummary.marketDebt, toUnit(3000), toUnit(50)); // due to fees
			assert.bnLt(ethSummary.currentFundingRate, 0);

			assert.equal(linkSummary.baseAsset, toBytes32('LINK'));
			assert.equal(linkSummary.price, toUnit(1000));
			assert.equal(linkSummary.marketSize, toUnit(0));
			assert.equal(linkSummary.marketSkew, toUnit(0));
			assert.equal(linkSummary.currentFundingRate, toUnit(0));
			assert.equal(linkSummary.marketDebt, toUnit(0));
		});
	});
});
