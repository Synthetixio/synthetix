const { artifacts, contract, web3 } = require('hardhat');
const { toBN } = web3.utils;
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const { updateAggregatorRates } = require('./helpers');
const {
	setupAllContracts,
	setupContract,
	excludedFunctions,
	excludedTestableFunctions,
	getFunctionSignatures,
} = require('./setup');
const { toUnit } = require('../utils')();
const { toBytes32, constants } = require('../..');
const {
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
	getDecodedLogs,
	decodedEventEqual,
} = require('./helpers');
const ZERO_ADDRESS = constants.ZERO_ADDRESS;

const PerpsV2Market = artifacts.require('TestablePerpsV2Market');

const MockExchanger = artifacts.require('MockExchanger');

contract('FuturesMarketManager (PerpsV2)', accounts => {
	let futuresMarketManager,
		perpsV2MarketSettings,
		systemSettings,
		exchangeRates,
		circuitBreaker,
		sUSD,
		debtCache,
		feePool,
		synthetix,
		addressResolver;
	const owner = accounts[1];
	const trader = accounts[2];
	const otherAddress = accounts[3];
	const initialMint = toUnit('100000');
	const priceImpactDelta = toUnit('0.5'); // 500bps (high bps to avoid affecting unrelated tests)

	async function setPrice(asset, price, resetCircuitBreaker = true) {
		await updateAggregatorRates(
			exchangeRates,
			resetCircuitBreaker ? circuitBreaker : null,
			[asset],
			[price]
		);
	}

	async function putBehindProxy(market) {
		const proxy = await setupContract({
			accounts,
			contract: 'ProxyPerpsV2',
			args: [owner],
		});

		const filteredFunctions = getFunctionSignatures(market, excludedFunctions);

		await Promise.all(
			filteredFunctions.map(e =>
				proxy.addRoute(e.signature, market.address, e.isView, {
					from: owner,
				})
			)
		);

		return proxy;
	}

	before(async () => {
		({
			FuturesMarketManager: futuresMarketManager,
			PerpsV2MarketSettings: perpsV2MarketSettings,
			ExchangeRates: exchangeRates,
			CircuitBreaker: circuitBreaker,
			SynthsUSD: sUSD,
			DebtCache: debtCache,
			FeePool: feePool,
			Synthetix: synthetix,
			AddressResolver: addressResolver,
			SystemSettings: systemSettings,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD'],
			feeds: ['BTC', 'ETH', 'LINK'],
			contracts: [
				'FuturesMarketManager',
				'PerpsV2MarketSettings',
				'PerpsV2ExchangeRate',
				'AddressResolver',
				'FeePool',
				'ExchangeRates',
				'CircuitBreaker',
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
		it('Requires sUSD contract', async () => {
			const required = await futuresMarketManager.resolverAddressesRequired();
			assert.deepEqual(required, ['SynthsUSD', 'FeePool', 'Exchanger'].map(toBytes32));
		});

		it('only expected functions are mutable', () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: futuresMarketManager.abi,
				ignoreParents: ['Owned', 'MixinResolver'],
				expected: [
					'addMarkets',
					'addProxiedMarkets',
					'removeMarkets',
					'removeMarketsByKey',
					'issueSUSD',
					'burnSUSD',
					'payFee',
					'payFee',
					'updateMarketsImplementations',
				],
			});
		});

		it('contract has CONTRACT_NAME getter', async () => {
			assert.equal(await futuresMarketManager.CONTRACT_NAME(), toBytes32('FuturesMarketManager'));
		});
	});

	describe('Market management', () => {
		const currencyKeys = ['sBTC', 'sETH'].map(toBytes32);
		let markets, marketProxies, proxyAddresses;
		beforeEach(async () => {
			markets = await Promise.all(
				currencyKeys.map(k =>
					setupContract({
						accounts,
						contract: 'MockPerpsV2Market',
						args: [futuresMarketManager.address, k, k, toUnit('1000'), false],
						skipPostDeploy: true,
					})
				)
			);

			marketProxies = await Promise.all(markets.map(market => putBehindProxy(market)));

			proxyAddresses = marketProxies.map(m => m.address);
			await futuresMarketManager.addProxiedMarkets(proxyAddresses, { from: owner });
		});

		it('Adding a single market', async () => {
			const markets = await futuresMarketManager.allMarkets();
			assert.bnEqual(await futuresMarketManager.numMarkets(), toBN(markets.length));
			assert.bnEqual(
				await futuresMarketManager.methods['numMarkets(bool)'](true),
				toBN(markets.length)
			);
			assert.equal(markets.length, 2);
			assert.deepEqual(markets, proxyAddresses);

			const market = await setupContract({
				accounts,
				contract: 'MockPerpsV2Market',
				args: [
					futuresMarketManager.address,
					toBytes32('sLINK'),
					toBytes32('sLINK'),
					toUnit('1000'),
					false,
				],
				skipPostDeploy: true,
			});

			const proxy = await putBehindProxy(market);
			await futuresMarketManager.addProxiedMarkets([proxy.address], { from: owner });

			assert.bnEqual(await futuresMarketManager.numMarkets(), toBN(3));
			assert.bnEqual(await futuresMarketManager.methods['numMarkets(bool)'](true), toBN(3));
			assert.equal((await futuresMarketManager.markets(2, 1))[0], proxy.address);

			assert.equal(await futuresMarketManager.marketForKey(toBytes32('sLINK')), proxy.address);
		});

		it('Adding multiple markets', async () => {
			const keys = ['sLINK', 'sSNX'].map(toBytes32);
			const markets = await Promise.all(
				keys.map(k =>
					setupContract({
						accounts,
						contract: 'MockPerpsV2Market',
						args: [futuresMarketManager.address, k, k, toUnit('1000'), false],
						skipPostDeploy: true,
					})
				)
			);
			const proxies = await Promise.all(markets.map(market => putBehindProxy(market)));

			const proxiesAddress = proxies.map(m => m.address);

			const tx = await futuresMarketManager.addProxiedMarkets(proxiesAddress, { from: owner });
			assert.bnEqual(await futuresMarketManager.numMarkets(), toBN(4));
			assert.bnEqual(await futuresMarketManager.methods['numMarkets(bool)'](true), toBN(4));
			assert.deepEqual(await futuresMarketManager.markets(2, 2), proxiesAddress);
			assert.deepEqual(await futuresMarketManager.marketsForKeys(keys), proxiesAddress);

			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [futuresMarketManager] });
			assert.equal(decodedLogs.length, 2);
			decodedEventEqual({
				event: 'MarketAdded',
				emittedFrom: futuresMarketManager.address,
				args: [proxiesAddress[0], keys[0], keys[0]],
				log: decodedLogs[0],
			});
			decodedEventEqual({
				event: 'MarketAdded',
				emittedFrom: futuresMarketManager.address,
				args: [proxiesAddress[1], keys[1], keys[1]],
				log: decodedLogs[1],
			});
		});

		it('Cannot add more than one market for the same key.', async () => {
			const market = await setupContract({
				accounts,
				contract: 'MockPerpsV2Market',
				args: [
					futuresMarketManager.address,
					toBytes32('sETH'),
					toBytes32('sETH'),
					toUnit('1000'),
					false,
				],
				skipPostDeploy: true,
			});
			const proxy = await putBehindProxy(market);
			await assert.revert(
				futuresMarketManager.addProxiedMarkets([proxy.address], { from: owner }),
				'Market already exists'
			);
		});

		it('Can add more than one market for the same asset', async () => {
			const firstKey = currencyKeys[1];
			const market1 = markets[1];
			const proxy1 = marketProxies[1];

			const secondKey = toBytes32('sETH-2'); // different market key
			const market2 = await setupContract({
				accounts,
				contract: 'MockPerpsV2Market',
				args: [
					futuresMarketManager.address,
					await market1.baseAsset(),
					secondKey,
					toUnit('1000'),
					false,
				],
				skipPostDeploy: true,
			});
			const proxy2 = await putBehindProxy(market2);
			await futuresMarketManager.addProxiedMarkets([proxy2.address], { from: owner });

			// check correct addresses returned
			assert.equal(await futuresMarketManager.marketForKey(secondKey), proxy2.address);
			assert.equal(await futuresMarketManager.marketForKey(firstKey), proxy1.address);
		});

		it('Removing a single market', async () => {
			await futuresMarketManager.removeMarkets([proxyAddresses[0]], { from: owner });

			const markets = await futuresMarketManager.allMarkets();
			assert.bnEqual(await futuresMarketManager.numMarkets(), toBN(1));
			assert.bnEqual(await futuresMarketManager.methods['numMarkets(bool)'](true), toBN(1));
			assert.deepEqual(markets, [proxyAddresses[1]]);

			assert.equal(await futuresMarketManager.marketForKey(currencyKeys[0]), ZERO_ADDRESS);
		});

		it('Removing multiple markets', async () => {
			const tx = await futuresMarketManager.removeMarkets(proxyAddresses, { from: owner });
			const markets = await futuresMarketManager.allMarkets();
			assert.bnEqual(await futuresMarketManager.numMarkets(), toBN(0));
			assert.bnEqual(await futuresMarketManager.methods['numMarkets(bool)'](true), toBN(0));
			assert.deepEqual(markets, []);
			assert.deepEqual(await futuresMarketManager.marketsForKeys(currencyKeys), [
				ZERO_ADDRESS,
				ZERO_ADDRESS,
			]);

			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [futuresMarketManager] });
			assert.equal(decodedLogs.length, 2);
			decodedEventEqual({
				event: 'MarketRemoved',
				emittedFrom: futuresMarketManager.address,
				args: [proxyAddresses[0], currencyKeys[0]],
				log: decodedLogs[0],
			});
			decodedEventEqual({
				event: 'MarketRemoved',
				emittedFrom: futuresMarketManager.address,
				args: [proxyAddresses[1], currencyKeys[1]],
				log: decodedLogs[1],
			});
		});

		it('Removing markets by key', async () => {
			await futuresMarketManager.removeMarketsByKey([toBytes32('sETH')], { from: owner });

			let markets = await futuresMarketManager.allMarkets();
			assert.bnEqual(await futuresMarketManager.numMarkets(), toBN(1));
			assert.bnEqual(await futuresMarketManager.methods['numMarkets(bool)'](true), toBN(1));
			assert.deepEqual(markets, [proxyAddresses[0]]);

			const market = await setupContract({
				accounts,
				contract: 'MockPerpsV2Market',
				args: [
					futuresMarketManager.address,
					toBytes32('sLINK'),
					toBytes32('sLINK'),
					toUnit('1000'),
					false,
				],
				skipPostDeploy: true,
			});

			const proxy = await putBehindProxy(market);
			await futuresMarketManager.addProxiedMarkets([proxy.address], { from: owner });
			await futuresMarketManager.removeMarketsByKey(['sBTC', 'sLINK'].map(toBytes32), {
				from: owner,
			});

			markets = await futuresMarketManager.allMarkets();
			assert.bnEqual(await futuresMarketManager.numMarkets(), toBN(0));
			assert.bnEqual(await futuresMarketManager.methods['numMarkets(bool)'](true), toBN(0));
			assert.deepEqual(markets, []);
		});

		it('Cannot remove a market which does not exist', async () => {
			await assert.revert(
				futuresMarketManager.removeMarketsByKey([toBytes32('sLINK')], { from: owner }),
				'Unknown market'
			);

			const market = await setupContract({
				accounts,
				contract: 'MockPerpsV2Market',
				args: [
					futuresMarketManager.address,
					toBytes32('sLINK'),
					toBytes32('sLINK'),
					toUnit('1000'),
					false,
				],
				skipPostDeploy: true,
			});
			await assert.revert(
				futuresMarketManager.removeMarkets([market.address], { from: owner }),
				'Unknown market'
			);
		});

		it('Only the owner can add or remove markets', async () => {
			const market = await setupContract({
				accounts,
				contract: 'MockPerpsV2Market',
				args: [
					futuresMarketManager.address,
					toBytes32('sLINK'),
					toBytes32('sLINK'),
					toUnit('1000'),
					false,
				],
				skipPostDeploy: true,
			});
			const proxy = await putBehindProxy(market);

			const revertReason = 'Only the contract owner may perform this action';

			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketManager.addProxiedMarkets,
				args: [[proxy.address]],
				accounts,
				address: owner,
				skipPassCheck: false,
				reason: revertReason,
			});

			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketManager.removeMarkets,
				args: [[proxy.address]],
				accounts,
				address: owner,
				skipPassCheck: false,
				reason: revertReason,
			});

			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketManager.removeMarketsByKey,
				args: [['sETH', 'sBTC'].map(toBytes32)],
				accounts,
				address: owner,
				skipPassCheck: false,
				reason: revertReason,
			});

			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketManager.updateMarketsImplementations,
				args: [[marketProxies[0].address]],
				accounts,
				address: owner,
				skipPassCheck: true,
				reason: revertReason,
			});
		});

		describe('Update market implememtations', () => {
			it('reverts attempting to update the nil market', async () => {
				await assert.revert(
					futuresMarketManager.updateMarketsImplementations([ZERO_ADDRESS], { from: owner }),
					'Invalid market'
				);
			});

			it('reverts attempting to update an unknown market', async () => {
				await assert.revert(
					futuresMarketManager.updateMarketsImplementations([otherAddress], { from: owner }),
					'Unknown market'
				);
			});

			it('can update a market', async () => {
				const updatedMarketImplementation = await setupContract({
					accounts,
					contract: 'MockPerpsV2Market',
					args: [
						futuresMarketManager.address,
						toBytes32('sLINK'),
						toBytes32('sLINK'),
						toUnit('1000'),
						false,
					],
					skipPostDeploy: true,
				});

				const proxyToUpdate = marketProxies[0];

				// Remove old routes
				const originalFilteredFunctions = getFunctionSignatures(markets[0], excludedFunctions);
				await Promise.all(
					originalFilteredFunctions.map(e =>
						proxyToUpdate.removeRoute(e.signature, {
							from: owner,
						})
					)
				);

				// Add new routes
				const filteredFunctions = getFunctionSignatures(
					updatedMarketImplementation,
					excludedFunctions
				);

				await Promise.all(
					filteredFunctions.map(e =>
						proxyToUpdate.addRoute(e.signature, updatedMarketImplementation.address, e.isView, {
							from: owner,
						})
					)
				);

				await futuresMarketManager.updateMarketsImplementations([proxyToUpdate.address], {
					from: owner,
				});

				// check new implementation can issue
				await updatedMarketImplementation.issueSUSD(owner, toUnit('10'));
				assert.bnEqual(await sUSD.balanceOf(owner), toUnit('10'));
			});
		});
	});

	describe('sUSD issuance', () => {
		let market, proxy;
		beforeEach(async () => {
			market = await setupContract({
				accounts,
				contract: 'MockPerpsV2Market',
				args: [
					futuresMarketManager.address,
					toBytes32('sLINK'),
					toBytes32('sLINK'),
					toUnit('1000'),
					false,
				],
				skipPostDeploy: true,
			});

			proxy = await putBehindProxy(market);
			await futuresMarketManager.addProxiedMarkets([proxy.address], { from: owner });
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
			await futuresMarketManager.rebuildCache();

			await mockExchanger.setReclaim(toUnit('10'));
			await mockExchanger.setNumEntries('1');

			// Issuance works fine
			await market.issueSUSD(owner, toUnit('100'));
			assert.bnEqual(await sUSD.balanceOf(owner), toUnit('100'));

			// But burning properly deducts the reclamation amount
			await market.burnSUSD(owner, toUnit('90'));
			assert.bnEqual(await sUSD.balanceOf(owner), toUnit('0'));
		});

		it('only markets are permitted to issue or burn sUSD', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketManager.issueSUSD,
				args: [owner, toUnit('1')],
				accounts,
				skipPassCheck: true,
				reason: 'Permitted only for market implementations',
			});
			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketManager.burnSUSD,
				args: [owner, toUnit('1')],
				accounts,
				skipPassCheck: true,
				reason: 'Permitted only for market implementations',
			});
		});
	});

	describe('Pay fees', () => {
		let market, proxy;
		beforeEach(async () => {
			market = await setupContract({
				accounts,
				contract: 'MockPerpsV2Market',
				args: [
					futuresMarketManager.address,
					toBytes32('sLINK'),
					toBytes32('sLINK'),
					toUnit('1000'),
					false,
				],
				skipPostDeploy: true,
			});

			proxy = await putBehindProxy(market);
			await futuresMarketManager.addProxiedMarkets([proxy.address], { from: owner });
		});

		it('pays fees', async () => {
			const FEE_ADDRESS = await feePool.FEE_ADDRESS();
			const preBalance = await sUSD.balanceOf(FEE_ADDRESS);
			await market.payFee(toUnit('10'));
			assert.bnEqual(await sUSD.balanceOf(FEE_ADDRESS), preBalance.add(toUnit('10')));
		});

		it('pays fees (with tracking)', async () => {
			const FEE_ADDRESS = await feePool.FEE_ADDRESS();
			const preBalance = await sUSD.balanceOf(FEE_ADDRESS);
			await market.methods['payFee(uint256,bytes32)'](toUnit('10'), toBytes32('trackingCode'));
			assert.bnEqual(await sUSD.balanceOf(FEE_ADDRESS), preBalance.add(toUnit('10')));
		});

		it('only markets are permitted to pay fees', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketManager.methods['payFee(uint256)'],
				args: [toUnit('1')],
				accounts,
				skipPassCheck: true,
				reason: 'Permitted only for market implementations',
			});
		});

		it('only markets are permitted to pay fees (with tracking code)', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketManager.methods['payFee(uint256,bytes32)'],
				args: [toUnit('1'), toBytes32('code')],
				accounts,
				skipPassCheck: true,
				reason: 'Permitted only for market implementations',
			});
		});
	});

	describe('Aggregated Debt', () => {
		it('perpsV2 debt is zero when no markets are deployed', async () => {
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
			let markets, proxies;
			beforeEach(async () => {
				markets = await Promise.all(
					currencyKeys.map(k =>
						setupContract({
							accounts,
							contract: 'MockPerpsV2Market',
							args: [futuresMarketManager.address, k, k, individualDebt, false],
							skipPostDeploy: true,
						})
					)
				);

				proxies = await Promise.all(markets.map(market => putBehindProxy(market)));

				await futuresMarketManager.addProxiedMarkets(
					proxies.map(m => m.address),
					{ from: owner }
				);
			});

			it('Aggregated debt updates properly as the debt values change', async () => {
				const initialSystemDebt = (await debtCache.currentDebt())[0];

				assert.bnEqual((await futuresMarketManager.totalDebt())[0], individualDebt.mul(toBN(3)));
				assert.bnEqual(initialSystemDebt, individualDebt.mul(toBN(3)).add(initialMint));
				await markets[0].setMarketDebt(toUnit('2500'));
				await markets[1].setMarketDebt(toUnit('200'));
				assert.bnEqual((await futuresMarketManager.totalDebt())[0], toUnit('3700'));
				assert.bnEqual((await debtCache.currentDebt())[0], initialSystemDebt.add(toUnit('700')));

				await futuresMarketManager.removeMarkets([proxies[2].address], { from: owner });
				assert.bnEqual((await futuresMarketManager.totalDebt())[0], toUnit('2700'));
				assert.bnEqual((await debtCache.currentDebt())[0], initialSystemDebt.sub(toUnit('300')));
				const market = await setupContract({
					accounts,
					contract: 'MockPerpsV2Market',
					args: [
						futuresMarketManager.address,
						toBytes32('sLINK'),
						toBytes32('sLINK'),
						toUnit('4000'),
						false,
					],
					skipPostDeploy: true,
				});

				const proxy = await putBehindProxy(market);
				await futuresMarketManager.addProxiedMarkets([proxy.address], { from: owner });

				assert.bnEqual((await futuresMarketManager.totalDebt())[0], toUnit('6700'));
				assert.bnEqual((await debtCache.currentDebt())[0], initialSystemDebt.add(toUnit('3700')));
			});

			it('Aggregated debt validity updates properly with the individual markets', async () => {
				assert.isFalse((await futuresMarketManager.totalDebt())[1]);
				assert.isFalse((await debtCache.currentDebt())[1]);

				await markets[0].setInvalid(true);
				assert.isTrue((await futuresMarketManager.totalDebt())[1]);
				assert.isTrue((await debtCache.currentDebt())[1]);

				await markets[0].setInvalid(false);
				await markets[2].setInvalid(true);
				assert.isTrue((await futuresMarketManager.totalDebt())[1]);
				assert.isTrue((await debtCache.currentDebt())[1]);

				await futuresMarketManager.removeMarkets([proxies[2].address], { from: owner });
				assert.isFalse((await futuresMarketManager.totalDebt())[1]);
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
				let filteredFunctions;

				const assetKey = toBytes32(symbol);
				const marketKey = toBytes32('s' + symbol);
				const offchainMarketKey = toBytes32('oc' + symbol);

				const marketState = await setupContract({
					accounts,
					contract: 'PerpsV2MarketStateAdded' + symbol,
					source: 'PerpsV2MarketState',
					args: [
						owner,
						[owner],
						assetKey, // base asset
						marketKey,
					],
				});

				let market = await setupContract({
					accounts,
					contract: 'ProxyPerpsV2MarketAdded' + symbol,
					source: 'ProxyPerpsV2',
					args: [owner],
				});

				const marketImpl = await setupContract({
					accounts,
					contract: 'PerpsV2MarketAdded' + symbol,
					source: 'PerpsV2Market',
					args: [market.address, marketState.address, owner, addressResolver.address],
				});

				const marketViews = await setupContract({
					accounts,
					contract: 'PerpsV2MarketViewsAdded' + symbol,
					source: 'PerpsV2MarketViews',
					args: [marketState.address, owner, addressResolver.address],
				});

				filteredFunctions = getFunctionSignatures(marketImpl, [
					...excludedTestableFunctions,
					...excludedFunctions.filter(e => e !== 'marketState'),
				]);
				await Promise.all(
					filteredFunctions.map(e =>
						market.addRoute(e.signature, marketImpl.address, e.isView, {
							from: owner,
						})
					)
				);

				filteredFunctions = getFunctionSignatures(marketViews, excludedFunctions);
				await Promise.all(
					filteredFunctions.map(e =>
						market.addRoute(e.signature, marketViews.address, e.isView, {
							from: owner,
						})
					)
				);

				await marketState.addAssociatedContracts([marketImpl.address], { from: owner });
				await Promise.all(
					filteredFunctions.map(e =>
						market.addRoute(e.signature, marketViews.address, e.isView, {
							from: owner,
						})
					)
				);

				await futuresMarketManager.addProxiedMarkets([market.address], {
					from: owner,
				});

				// use implementation ABI on the proxy address to simplify calling
				market = await PerpsV2Market.at(market.address);

				markets.push(market);
				marketKeys.push(marketKey);

				await addressResolver.rebuildCaches([marketImpl.address, marketViews.address], {
					from: owner,
				});

				await setPrice(assetKey, toUnit(1000));

				// Now that the market exists we can set the all its parameters
				await perpsV2MarketSettings.setParameters(
					marketKey,
					[
						toUnit('0.005'), // 0.5% taker fee
						toUnit('0.001'), // 0.1% maker fee
						toUnit('0'), // 0% override commit fee for delayed/offchain order
						toUnit('0.0005'), // 0.05% taker fee delayed order
						toUnit('0'), // 0% maker fee delayed order
						toUnit('0.00005'), // 0.005% taker fee offchain delayed order
						toUnit('0'), // 0% maker fee offchain delayed order

						toUnit('5'), // 5x max leverage
						toUnit('1000'), // 1000 max market value
						toUnit('0.2'), // 20% max funding velocity
						toUnit('100000'), // 100k native units skewScale

						toBN('2'), // 2 rounds next price confirm window
						30, // 30s delay confirm window
						60, // 60s minimum delay time in seconds
						120, // 120s maximum delay time in seconds
						15, // offchainDelayedOrderMinAge
						60, // offchainDelayedOrderMaxAge

						offchainMarketKey,
						toUnit('0.05'),

						toUnit('1'), // 1 liquidation premium multiplier
					],
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
			await markets[0].modifyPosition(toUnit('5'), priceImpactDelta, { from: trader });

			await markets[1].transferMargin(toUnit('3000'), { from: trader });
			await markets[1].modifyPosition(toUnit('4'), priceImpactDelta, { from: trader });
			await setPrice(await markets[1].baseAsset(), toUnit('999'));
		});

		it('For markets', async () => {
			const market = markets[1];
			const assetKey = toBytes32(assets[1]);
			const marketKey = marketKeys[1];
			const summary = (await futuresMarketManager.marketSummariesForKeys([marketKey]))[0];

			const { price } = await market.assetPrice();

			assert.equal(summary.market, market.address);
			assert.equal(summary.marketKey, marketKey);
			assert.equal(summary.asset, assetKey);
			assert.equal(summary.price, price);
			assert.equal(summary.marketSize, await market.marketSize());
			assert.equal(summary.marketSkew, await market.marketSkew());
			assert.equal(summary.currentFundingRate, await market.currentFundingRate());
			assert.equal(summary.currentFundingVelocity, await market.currentFundingVelocity());
		});

		it('For market keys', async () => {
			const summaries = await futuresMarketManager.marketSummaries([
				markets[0].address,
				markets[1].address,
			]);
			const summariesForKeys = await futuresMarketManager.marketSummariesForKeys(
				marketKeys.slice(0, 2)
			);
			assert.equal(JSON.stringify(summaries), JSON.stringify(summariesForKeys));
		});

		it('All summaries', async () => {
			const summaries = await futuresMarketManager.allMarketSummaries();

			const btcSummary = summaries.find(summary => summary.marketKey === toBytes32('sBTC'));
			const ethSummary = summaries.find(summary => summary.marketKey === toBytes32('sETH'));
			const linkSummary = summaries.find(summary => summary.marketKey === toBytes32('sLINK'));

			assert.equal(btcSummary.market, markets[0].address);
			assert.equal(btcSummary.asset, toBytes32(assets[0]));
			let price = await markets[0].assetPrice();
			assert.equal(btcSummary.price, price.price);
			assert.equal(btcSummary.marketSize, await markets[0].marketSize());
			assert.equal(btcSummary.marketSkew, await markets[0].marketSkew());
			assert.equal(btcSummary.currentFundingRate, await markets[0].currentFundingRate());
			assert.equal(btcSummary.currentFundingVelocity, await markets[0].currentFundingVelocity());

			assert.equal(ethSummary.market, markets[1].address);
			assert.equal(ethSummary.asset, toBytes32(assets[1]));
			price = await markets[1].assetPrice();
			assert.equal(ethSummary.price, price.price);
			assert.equal(ethSummary.marketSize, await markets[1].marketSize());
			assert.equal(ethSummary.marketSkew, await markets[1].marketSkew());
			assert.equal(ethSummary.currentFundingRate, await markets[1].currentFundingRate());
			assert.equal(ethSummary.currentFundingVelocity, await markets[1].currentFundingVelocity());

			assert.equal(linkSummary.market, await futuresMarketManager.marketForKey(toBytes32('sLINK')));
			assert.equal(linkSummary.asset, toBytes32('LINK'));
			assert.equal(linkSummary.price, toUnit(1000));
			assert.equal(linkSummary.marketSize, toUnit(0));
			assert.equal(linkSummary.marketSkew, toUnit(0));
			assert.equal(linkSummary.currentFundingRate, toUnit(0));
			assert.equal(linkSummary.currentFundingVelocity, toUnit(0));
		});
	});

	describe('Legacy Markets management', () => {
		const currencies = ['sBTC', 'sETH'];
		const currencyKeys = currencies.map(toBytes32);
		let legacyMarkets, legacyMarketsAddress, markets, marketProxies, proxyAddresses;
		beforeEach(async () => {
			legacyMarkets = await Promise.all(
				[...currencies, 'sLINK'].map(k =>
					setupContract({
						accounts,
						contract: 'MockFuturesMarket',
						args: [
							futuresMarketManager.address,
							toBytes32(k),
							toBytes32(k + 'legacy'),
							toUnit('1000'),
							false,
						],
						skipPostDeploy: true,
					})
				)
			);

			legacyMarketsAddress = legacyMarkets.map(m => m.address);
			await futuresMarketManager.addMarkets(legacyMarketsAddress, { from: owner });

			markets = await Promise.all(
				currencyKeys.map(k =>
					setupContract({
						accounts,
						contract: 'MockPerpsV2Market',
						args: [futuresMarketManager.address, k, k, toUnit('1000'), false],
						skipPostDeploy: true,
					})
				)
			);

			marketProxies = await Promise.all(markets.map(market => putBehindProxy(market)));

			proxyAddresses = marketProxies.map(m => m.address);
			await futuresMarketManager.addProxiedMarkets(proxyAddresses, { from: owner });
		});

		describe('Combined Markets', () => {
			it('gets the right number of markets', async () => {
				assert.bnEqual(await futuresMarketManager.numMarkets(), 5);
			});
			it('gets the right markets', async () => {
				assert.deepEqual(await futuresMarketManager.allMarkets(), [
					...legacyMarketsAddress,
					...proxyAddresses,
				]);
			});
			it('gets the paginated markets', async () => {
				assert.deepEqual(await futuresMarketManager.markets(0, 5), [
					...legacyMarketsAddress,
					...proxyAddresses,
				]);
			});
		});

		describe('Only Legacy Markets', () => {
			it('gets the right number of markets', async () => {
				assert.bnEqual(await futuresMarketManager.methods['numMarkets(bool)'](false), 3);
			});
			it('gets the right markets', async () => {
				assert.deepEqual(
					await futuresMarketManager.methods['allMarkets(bool)'](false),
					legacyMarketsAddress
				);
			});
			it('gets the paginated markets', async () => {
				assert.deepEqual(
					await futuresMarketManager.methods['markets(uint256,uint256,bool)'](0, 3, false),
					legacyMarketsAddress
				);
			});
		});

		describe('Only PerpsV2 Markets', () => {
			it('gets the right number of markets', async () => {
				assert.bnEqual(await futuresMarketManager.methods['numMarkets(bool)'](true), 2);
			});
			it('gets the right markets', async () => {
				assert.deepEqual(
					await futuresMarketManager.methods['allMarkets(bool)'](true),
					proxyAddresses
				);
			});
			it('gets the paginated markets', async () => {
				assert.deepEqual(
					await futuresMarketManager.methods['markets(uint256,uint256,bool)'](0, 2, true),
					proxyAddresses
				);
			});
		});
	});
});
