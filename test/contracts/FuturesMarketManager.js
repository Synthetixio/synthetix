const { artifacts, contract, web3 } = require('hardhat');
const { toBN } = web3.utils;
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { updateAggregatorRates } = require('./helpers');
const { setupAllContracts, setupContract } = require('./setup');
const { toUnit } = require('../utils')();
const { toBytes32, constants } = require('../..');
const {
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
	getDecodedLogs,
	decodedEventEqual,
} = require('./helpers');
const ZERO_ADDRESS = constants.ZERO_ADDRESS;

const MockExchanger = artifacts.require('MockExchanger');

contract('FuturesMarketManager', accounts => {
	let instance,
		// v1
		futuresMarketSettings,
		// v2
		// perpsSettings,
		// perpsStorage,
		// perpsEngine,
		// perpsOrders,
		systemSettings,
		exchangeRates,
		exchangeCircuitBreaker,
		sUSD,
		feePool,
		debtCache,
		synthetix,
		addressResolver;
	const owner = accounts[1];
	const trader = accounts[2];
	const mockPerpsManager = accounts[3];
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
			FuturesMarketManager: instance,
			FuturesMarketSettings: futuresMarketSettings,
			// PerpsManagerV2: perpsManager,
			// PerpsSettingsV2: perpsSettings,
			// PerpsStorageV2: perpsStorage,
			// PerpsEngineV2: perpsEngine,
			// PerpsOrdersV2: perpsOrders,
			ExchangeRates: exchangeRates,
			ExchangeCircuitBreaker: exchangeCircuitBreaker,
			SynthsUSD: sUSD,
			FeePool: feePool,
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
				'FuturesMarketSettings',
				// 'PerpsManagerV2',
				// 'PerpsSettingsV2',
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

	describe('Basic parameters', () => {
		it('requires expected contracts', async () => {
			const actual = await instance.resolverAddressesRequired();
			assert.deepEqual(
				actual,
				['SynthsUSD', 'FeePool', 'Exchanger', 'PerpsManagerV2'].map(toBytes32)
			);
		});

		it('only expected functions are mutable', () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: instance.abi,
				ignoreParents: ['Owned', 'MixinResolver'],
				expected: [
					'addMarkets',
					'removeMarkets',
					'removeMarketsByKey',
					'issueSUSD',
					'burnSUSD',
					'payFee',
				],
			});
		});

		it('contract has CONTRACT_NAME getter', async () => {
			assert.equal(await instance.CONTRACT_NAME(), toBytes32('FuturesMarketManager'));
		});
	});

	describe('Market management V1', () => {
		const currencyKeys = ['sBTC', 'sETH'].map(toBytes32);
		let markets, addresses;
		beforeEach(async () => {
			markets = await Promise.all(
				currencyKeys.map(k =>
					setupContract({
						accounts,
						contract: 'MockFuturesMarket',
						args: [instance.address, k, k, toUnit('1000'), false],
						skipPostDeploy: true,
					})
				)
			);

			addresses = markets.map(m => m.address);
			await instance.addMarkets(addresses, { from: owner });
		});

		it('Adding a single market', async () => {
			const markets = await instance.allMarketsV1();
			assert.bnEqual(await instance.numMarkets(), toBN(markets.length));
			assert.equal(markets.length, 2);
			assert.deepEqual(markets, addresses);

			const market = await setupContract({
				accounts,
				contract: 'MockFuturesMarket',
				args: [instance.address, toBytes32('sLINK'), toBytes32('sLINK'), toUnit('1000'), false],
				skipPostDeploy: true,
			});
			await instance.addMarkets([market.address], { from: owner });
			assert.bnEqual(await instance.numMarkets(), toBN(3));
			assert.equal((await instance.markets(2, 1))[0], market.address);

			assert.equal(await instance.marketForKey(toBytes32('sLINK')), market.address);
		});

		it('Adding multiple markets', async () => {
			const keys = ['sLINK', 'sSNX'].map(toBytes32);
			const markets = await Promise.all(
				keys.map(k =>
					setupContract({
						accounts,
						contract: 'MockFuturesMarket',
						args: [instance.address, k, k, toUnit('1000'), false],
						skipPostDeploy: true,
					})
				)
			);
			const addresses = markets.map(m => m.address);
			const tx = await instance.addMarkets(addresses, { from: owner });
			assert.bnEqual(await instance.numMarkets(), toBN(4));
			assert.deepEqual(await instance.markets(2, 2), addresses);
			assert.deepEqual(await instance.marketsForKeys(keys), addresses);

			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [instance] });
			assert.equal(decodedLogs.length, 2);
			decodedEventEqual({
				event: 'MarketAdded',
				emittedFrom: instance.address,
				args: [addresses[0], keys[0], keys[0]],
				log: decodedLogs[0],
			});
			decodedEventEqual({
				event: 'MarketAdded',
				emittedFrom: instance.address,
				args: [addresses[1], keys[1], keys[1]],
				log: decodedLogs[1],
			});
		});

		it('Cannot add more than one market for the same key.', async () => {
			const market = await setupContract({
				accounts,
				contract: 'MockFuturesMarket',
				args: [instance.address, toBytes32('sETH'), toBytes32('sETH'), toUnit('1000'), false],
				skipPostDeploy: true,
			});
			await assert.revert(
				instance.addMarkets([market.address], { from: owner }),
				'Market already exists'
			);
		});

		it('Can add more than one market for the same asset', async () => {
			const firstKey = currencyKeys[1];
			const market1 = markets[1];

			const secondKey = toBytes32('sETH-2'); // different market key
			const market2 = await setupContract({
				accounts,
				contract: 'MockFuturesMarket',
				args: [instance.address, await market1.baseAsset(), secondKey, toUnit('1000'), false],
				skipPostDeploy: true,
			});
			await instance.addMarkets([market2.address], { from: owner });

			// check correcr addresses returned
			assert.equal(await instance.marketForKey(secondKey), market2.address);
			assert.equal(await instance.marketForKey(firstKey), market1.address);
		});

		it('Removing a single market', async () => {
			await instance.removeMarkets([addresses[0]], { from: owner });

			const markets = await instance.allMarketsV1();
			assert.bnEqual(await instance.numMarkets(), toBN(1));
			assert.deepEqual(markets, [addresses[1]]);

			assert.equal(await instance.marketForKey(currencyKeys[0]), ZERO_ADDRESS);
		});

		it('Removing multiple markets', async () => {
			const tx = await instance.removeMarkets(addresses, { from: owner });
			const markets = await instance.allMarketsV1();
			assert.bnEqual(await instance.numMarkets(), toBN(0));
			assert.deepEqual(markets, []);
			assert.deepEqual(await instance.marketsForKeys(currencyKeys), [ZERO_ADDRESS, ZERO_ADDRESS]);

			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [instance] });
			assert.equal(decodedLogs.length, 2);
			decodedEventEqual({
				event: 'MarketRemoved',
				emittedFrom: instance.address,
				args: [addresses[0], currencyKeys[0]],
				log: decodedLogs[0],
			});
			decodedEventEqual({
				event: 'MarketRemoved',
				emittedFrom: instance.address,
				args: [addresses[1], currencyKeys[1]],
				log: decodedLogs[1],
			});
		});

		it('Removing markets by key', async () => {
			await instance.removeMarketsByKey([toBytes32('sETH')], { from: owner });

			let markets = await instance.allMarketsV1();
			assert.bnEqual(await instance.numMarkets(), toBN(1));
			assert.deepEqual(markets, [addresses[0]]);

			const market = await setupContract({
				accounts,
				contract: 'MockFuturesMarket',
				args: [instance.address, toBytes32('sLINK'), toBytes32('sLINK'), toUnit('1000'), false],
				skipPostDeploy: true,
			});
			await instance.addMarkets([market.address], { from: owner });
			await instance.removeMarketsByKey(['sBTC', 'sLINK'].map(toBytes32), {
				from: owner,
			});

			markets = await instance.allMarketsV1();
			assert.bnEqual(await instance.numMarkets(), toBN(0));
			assert.deepEqual(markets, []);
		});

		it('Cannot remove a market which does not exist', async () => {
			await assert.revert(
				instance.removeMarketsByKey([toBytes32('sLINK')], { from: owner }),
				'Unknown market'
			);

			const market = await setupContract({
				accounts,
				contract: 'MockFuturesMarket',
				args: [instance.address, toBytes32('sLINK'), toBytes32('sLINK'), toUnit('1000'), false],
				skipPostDeploy: true,
			});
			await assert.revert(
				instance.removeMarkets([market.address], { from: owner }),
				'Unknown market'
			);
		});

		it('Only the owner can add or remove markets', async () => {
			const market = await setupContract({
				accounts,
				contract: 'MockFuturesMarket',
				args: [instance.address, toBytes32('sLINK'), toBytes32('sLINK'), toUnit('1000'), false],
				skipPostDeploy: true,
			});

			const revertReason = 'Only the contract owner may perform this action';

			await onlyGivenAddressCanInvoke({
				fnc: instance.addMarkets,
				args: [[market.address]],
				accounts,
				address: owner,
				skipPassCheck: false,
				reason: revertReason,
			});

			await onlyGivenAddressCanInvoke({
				fnc: instance.removeMarkets,
				args: [[market.address]],
				accounts,
				address: owner,
				skipPassCheck: false,
				reason: revertReason,
			});

			await onlyGivenAddressCanInvoke({
				fnc: instance.removeMarketsByKey,
				args: [['sETH', 'sBTC'].map(toBytes32)],
				accounts,
				address: owner,
				skipPassCheck: false,
				reason: revertReason,
			});
		});
	});

	describe('sUSD issuance', () => {
		let market;
		beforeEach(async () => {
			market = await setupContract({
				accounts,
				contract: 'MockFuturesMarket',
				args: [instance.address, toBytes32('sLINK'), toBytes32('sLINK'), toUnit('1000'), false],
				skipPostDeploy: true,
			});
			await instance.addMarkets([market.address], { from: owner });
		});

		it('issuing/burning sUSD', async () => {
			await market.issueSUSD(owner, toUnit('10'));
			assert.bnEqual(await sUSD.balanceOf(owner), toUnit('10'));

			await market.burnSUSD(owner, toUnit('5'));
			assert.bnEqual(await sUSD.balanceOf(owner), toUnit('5'));

			await market.issueSUSD(owner, toUnit('2'));
			await market.burnSUSD(owner, toUnit('7'));

			assert.bnEqual(await sUSD.balanceOf(owner), toUnit('0'));
			await assert.revert(market.burnSUSD(owner, toUnit('1')), 'SafeMath: subtraction overflow');
		});

		it('burning respects settlement', async () => {
			// Set up a mock exchanger
			const mockExchanger = await MockExchanger.new(synthetix.address);
			await addressResolver.importAddresses(['Exchanger'].map(toBytes32), [mockExchanger.address], {
				from: owner,
			});
			await synthetix.rebuildCache();
			await instance.rebuildCache();

			await mockExchanger.setReclaim(toUnit('10'));
			await mockExchanger.setNumEntries('1');

			// Issuance works fine
			await market.issueSUSD(owner, toUnit('100'));
			assert.bnEqual(await sUSD.balanceOf(owner), toUnit('100'));

			// But burning properly deducts the reclamation amount
			await market.burnSUSD(owner, toUnit('90'));
			assert.bnEqual(await sUSD.balanceOf(owner), toUnit('0'));
		});

		it('payFee from market', async () => {
			await market.payFee(toUnit('10'));
			assert.bnEqual(await sUSD.balanceOf(await feePool.FEE_ADDRESS()), toUnit('10'));
			assert.bnEqual((await feePool.recentFeePeriods(0)).feesToDistribute, toUnit('10'));
		});

		it('only markets are permitted to issue or burn sUSD', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: instance.issueSUSD,
				args: [owner, toUnit('1')],
				accounts,
				skipPassCheck: true,
				reason: 'Only markets or perps',
			});
			await onlyGivenAddressCanInvoke({
				fnc: instance.burnSUSD,
				args: [owner, toUnit('1')],
				accounts,
				skipPassCheck: true,
				reason: 'Only markets or perps',
			});
			await onlyGivenAddressCanInvoke({
				fnc: instance.payFee,
				args: [toUnit('1')],
				accounts,
				skipPassCheck: true,
				reason: 'Only markets or perps',
			});
		});

		describe('with mock perps manager', () => {
			beforeEach(async () => {
				// replace with EOA
				await addressResolver.importAddresses(
					['PerpsManagerV2'].map(toBytes32),
					[mockPerpsManager],
					{
						from: owner,
					}
				);
				await instance.rebuildCache();
			});

			it('issuing/burning sUSD', async () => {
				await instance.issueSUSD(owner, toUnit('10'), { from: mockPerpsManager });
				assert.bnEqual(await sUSD.balanceOf(owner), toUnit('10'));

				await instance.burnSUSD(owner, toUnit('5'), { from: mockPerpsManager });
				assert.bnEqual(await sUSD.balanceOf(owner), toUnit('5'));

				await instance.issueSUSD(owner, toUnit('2'), { from: mockPerpsManager });
				await instance.burnSUSD(owner, toUnit('7'), { from: mockPerpsManager });

				assert.bnEqual(await sUSD.balanceOf(owner), toUnit('0'));
				await assert.revert(
					instance.burnSUSD(owner, toUnit('1'), { from: mockPerpsManager }),
					'SafeMath: subtraction overflow'
				);
			});

			it('payFee', async () => {
				await instance.payFee(toUnit('10'), { from: mockPerpsManager });
				assert.bnEqual(await sUSD.balanceOf(await feePool.FEE_ADDRESS()), toUnit('10'));
				assert.bnEqual((await feePool.recentFeePeriods(0)).feesToDistribute, toUnit('10'));
			});
		});
	});

	describe('Aggregated Debt', () => {
		it('futures debt is zero when no markets are deployed', async () => {
			// check initial debt
			const initialSystemDebt = (await debtCache.currentDebt())[0];
			// issue some sUSD
			sUSD.issue(trader, toUnit(100), { from: owner });
			await debtCache.takeDebtSnapshot();
			// check debt currentDebt() works as expected
			assert.bnEqual((await debtCache.currentDebt())[0], initialSystemDebt.add(toUnit(100)));
		});

		describe('when there are multiple markets', () => {
			const individualDebt = toUnit('1000');
			const currencyKeys = ['sBTC', 'sETH', 'sLINK'].map(toBytes32);
			let markets;
			beforeEach(async () => {
				markets = await Promise.all(
					currencyKeys.map(k =>
						setupContract({
							accounts,
							contract: 'MockFuturesMarket',
							args: [instance.address, k, k, individualDebt, false],
							skipPostDeploy: true,
						})
					)
				);
				await instance.addMarkets(
					markets.map(m => m.address),
					{ from: owner }
				);
			});

			it('Aggregated debt updates properly as the debt values change', async () => {
				const initialSystemDebt = (await debtCache.currentDebt())[0];

				assert.bnEqual((await instance.totalDebt())[0], individualDebt.mul(toBN(3)));
				assert.bnEqual(initialSystemDebt, individualDebt.mul(toBN(3)).add(initialMint));
				await markets[0].setMarketDebt(toUnit('2500'));
				await markets[1].setMarketDebt(toUnit('200'));
				assert.bnEqual((await instance.totalDebt())[0], toUnit('3700'));
				assert.bnEqual((await debtCache.currentDebt())[0], initialSystemDebt.add(toUnit('700')));

				await instance.removeMarkets([markets[2].address], { from: owner });
				assert.bnEqual((await instance.totalDebt())[0], toUnit('2700'));
				assert.bnEqual((await debtCache.currentDebt())[0], initialSystemDebt.sub(toUnit('300')));
				const market = await setupContract({
					accounts,
					contract: 'MockFuturesMarket',
					args: [instance.address, toBytes32('sLINK'), toBytes32('sLINK'), toUnit('4000'), false],
					skipPostDeploy: true,
				});
				await instance.addMarkets([market.address], { from: owner });

				assert.bnEqual((await instance.totalDebt())[0], toUnit('6700'));
				assert.bnEqual((await debtCache.currentDebt())[0], initialSystemDebt.add(toUnit('3700')));
			});

			it('Aggregated debt validity updates properly with the individual markets', async () => {
				assert.isFalse((await instance.totalDebt())[1]);
				assert.isFalse((await debtCache.currentDebt())[1]);

				await markets[0].setInvalid(true);
				assert.isTrue((await instance.totalDebt())[1]);
				assert.isTrue((await debtCache.currentDebt())[1]);

				await markets[0].setInvalid(false);
				await markets[2].setInvalid(true);
				assert.isTrue((await instance.totalDebt())[1]);
				assert.isTrue((await debtCache.currentDebt())[1]);

				await instance.removeMarkets([markets[2].address], { from: owner });
				assert.isFalse((await instance.totalDebt())[1]);
				assert.isFalse((await debtCache.currentDebt())[1]);
			});
		});
	});

	// helpful views
	describe('Market summaries', () => {
		const traderInitialBalance = toUnit(1000000);
		const assets = ['BTC', 'ETH', 'LINK'];
		const marketKeys = [];
		const markets = [];

		beforeEach(async () => {
			// Add v1 markets
			for (const symbol of assets) {
				const assetKey = toBytes32(symbol);
				const marketKey = toBytes32('s' + symbol);

				const market = await setupContract({
					accounts,
					contract: 'FuturesMarket',
					args: [
						addressResolver.address,
						assetKey, // base asset
						marketKey,
					],
				});

				markets.push(market);
				marketKeys.push(marketKey);

				await addressResolver.rebuildCaches([market.address], { from: owner });

				await instance.addMarkets([market.address], { from: owner });

				await setPrice(assetKey, toUnit(1000));

				// Now that the market exists we can set the all its parameters
				await futuresMarketSettings.setParameters(
					marketKey,
					toUnit('0.005'), // 0.5% taker fee
					toUnit('0.001'), // 0.1% maker fee
					toUnit('0.0005'), // 0.05% taker fee next price
					toUnit('0'), // 0% maker fee next price
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
			await setPrice(await markets[0].baseAsset(), toUnit(100));

			// The traders take positions on market
			await markets[0].transferMargin(toUnit('1000'), { from: trader });
			await markets[0].modifyPosition(toUnit('5'), { from: trader });

			await markets[1].transferMargin(toUnit('3000'), { from: trader });
			await markets[1].modifyPosition(toUnit('4'), { from: trader });
			await setPrice(await markets[1].baseAsset(), toUnit('999'));
		});

		it('For markets', async () => {
			const market = markets[1];
			const assetKey = toBytes32(assets[1]);
			const marketKey = marketKeys[1];
			const summary = (await instance.marketSummariesForKeysV1([marketKey]))[0];

			const { price } = await market.assetPrice();

			assert.equal(summary.market, market.address);
			assert.equal(summary.marketKey, marketKey);
			assert.equal(summary.baseAsset, assetKey);
			assert.equal(summary.price, price);
			assert.equal(summary.marketSize, await market.marketSize());
			assert.equal(summary.marketSkew, await market.marketSkew());
			assert.equal(summary.currentFundingRate, await market.currentFundingRate());
		});

		it('For market keys', async () => {
			const allSummaries = await instance.allMarketSummaries();
			const summariesForKeys = await instance.marketSummariesForKeysV1(marketKeys.slice(0, 2));
			assert.equal(JSON.stringify(allSummaries.slice(0, 2)), JSON.stringify(summariesForKeys));
		});

		it('All summaries', async () => {
			const summaries = await instance.allMarketSummaries();

			const btcSummary = summaries.find(summary => summary.marketKey === toBytes32('sBTC'));
			const ethSummary = summaries.find(summary => summary.marketKey === toBytes32('sETH'));
			const linkSummary = summaries.find(summary => summary.marketKey === toBytes32('sLINK'));

			assert.equal(btcSummary.market, markets[0].address);
			assert.equal(btcSummary.baseAsset, toBytes32(assets[0]));
			let price = await markets[0].assetPrice();
			assert.equal(btcSummary.price, price.price);
			assert.equal(btcSummary.marketSize, await markets[0].marketSize());
			assert.equal(btcSummary.marketSkew, await markets[0].marketSkew());
			assert.equal(btcSummary.currentFundingRate, await markets[0].currentFundingRate());

			assert.equal(ethSummary.market, markets[1].address);
			assert.equal(ethSummary.baseAsset, toBytes32(assets[1]));
			price = await markets[1].assetPrice();
			assert.equal(ethSummary.price, price.price);
			assert.equal(ethSummary.marketSize, await markets[1].marketSize());
			assert.equal(ethSummary.marketSkew, await markets[1].marketSkew());
			assert.equal(ethSummary.currentFundingRate, await markets[1].currentFundingRate());

			assert.equal(linkSummary.market, await instance.marketForKey(toBytes32('sLINK')));
			assert.equal(linkSummary.baseAsset, toBytes32('LINK'));
			assert.equal(linkSummary.price, toUnit(1000));
			assert.equal(linkSummary.marketSize, toUnit(0));
			assert.equal(linkSummary.marketSkew, toUnit(0));
			assert.equal(linkSummary.currentFundingRate, toUnit(0));
		});
	});
});
