const { artifacts, contract, web3 } = require('hardhat');
const { toBytes32 } = require('../..');
const { toBN } = web3.utils;
const { currentTime, fastForward, toUnit, multiplyDecimal, divideDecimal } = require('../utils')();

const { setupAllContracts } = require('./setup');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
const {
	getDecodedLogs,
	decodedEventEqual,
	ensureOnlyExpectedMutativeFunctions,
	updateAggregatorRates,
	onlyGivenAddressCanInvoke,
} = require('./helpers');

const MockExchanger = artifacts.require('MockExchanger');

const Status = {
	Ok: 0,
	InvalidPrice: 1,
	CanLiquidate: 2,
	CannotLiquidate: 3,
	MaxMarketSizeExceeded: 4,
	MaxLeverageExceeded: 5,
	InsufficientMargin: 6,
	NotPermitted: 7,
	NilOrder: 8,
	NoPositionOpen: 9,
};

const revertMsg = {
	InvalidPrice: 'Invalid price',
	CanLiquidate: 'Position can be liquidated',
	CannotLiquidate: 'Position cannot be liquidated',
	MaxMarketSizeExceeded: 'Max market size exceeded',
	MaxLeverageExceeded: 'Max leverage exceeded',
	InsufficientMargin: 'Insufficient margin',
	NotPermitted: 'Not permitted for this address',
	NilOrder: 'Cannot submit empty order',
	NoPositionOpen: 'No position open', // unused (NilOrder is triggered on empty orders)
};

contract('PerpsEngineV2', accounts => {
	let perpsManager,
		futuresMarketManager,
		// perpsOrders,
		instance,
		perpsStorage,
		exchangeRates,
		exchangeCircuitBreaker,
		addressResolver,
		sUSD,
		synthetix,
		feePool,
		debtCache,
		systemSettings,
		systemStatus;

	const owner = accounts[1];
	const trader = accounts[2];
	const trader2 = accounts[3];
	const trader3 = accounts[4];
	const noBalance = accounts[5];
	const liquidator = accounts[6];
	const mockOrders = accounts[7]; // orders router
	const mockManager = accounts[8];
	const traderInitialBalance = toUnit(1000000);

	const marketKey = toBytes32('pBTC');
	const baseAsset = toBytes32('BTC');
	const baseFee = toUnit('0.003');
	const baseFeeNextPrice = toUnit('0.0005');
	const maxLeverage = toUnit('10');
	const maxSingleSideValueUSD = toUnit('100000');
	const maxFundingRate = toUnit('0.1');
	const skewScaleUSD = toUnit('100000');
	const initialPrice = toUnit('100');
	const minKeeperFee = toUnit('20');
	const minInitialMargin = toUnit('100');
	const defaultExecOptions = [baseFee, toBN(0), toBytes32('')];

	async function setPrice(asset, price, resetCircuitBreaker = true) {
		await updateAggregatorRates(exchangeRates, [asset], [price]);
		// reset the last price to the new price, so that we don't trip the breaker
		// on various tests that change prices beyond the allowed deviation
		if (resetCircuitBreaker) {
			// flag defaults to true because the circuit breaker is not tested in most tests
			await exchangeCircuitBreaker.resetLastExchangeRate([asset], { from: owner });
		}
	}

	async function getPositionSummary(account) {
		return instance.positionSummary(marketKey, account);
	}

	async function getPosition(account) {
		return (await getPositionSummary(account)).position;
	}

	async function transfer(marginDelta, account) {
		return instance.transferMargin(marketKey, account, marginDelta, { from: mockOrders });
	}

	async function trade(
		sizeDelta,
		account,
		options = { feeRate: null, priceDelta: null, trackingCode: null }
	) {
		return instance.trade(
			marketKey,
			account,
			sizeDelta,
			[
				toBN(options.feeRate || baseFee),
				toBN(options.priceDelta || 0),
				options.trackingCode || toBytes32(''),
			],
			{
				from: mockOrders,
			}
		);
	}

	async function close(account) {
		const size = toBN((await getPosition(account)).size);
		return trade(size.neg(), account);
	}

	async function withdraw(account) {
		const withdrawable = await instance.withdrawableMargin(marketKey, account);
		return instance.transferMargin(marketKey, account, withdrawable.neg(), { from: mockOrders });
	}

	async function transferAndTrade({ account, fillPrice, marginDelta, sizeDelta }) {
		await transfer(marginDelta, account);
		await setPrice(baseAsset, fillPrice);
		await trade(sizeDelta, account);
	}

	async function closeAndWithdraw({ account, fillPrice }) {
		await setPrice(baseAsset, fillPrice);
		await close(account);
		await withdraw(account);
	}

	async function marketSummary() {
		return instance.marketSummary(marketKey);
	}

	async function assetPrice() {
		return instance.assetPrice(marketKey);
	}

	async function withdrawableMargin(account) {
		return instance.withdrawableMargin(marketKey, account);
	}

	before(async () => {
		({
			PerpsManagerV2: perpsManager,
			FuturesMarketManager: futuresMarketManager,
			// PerpsOrdersV2: perpsOrders,
			PerpsEngineV2: instance,
			PerpsStorageV2: perpsStorage,
			ExchangeRates: exchangeRates,
			ExchangeCircuitBreaker: exchangeCircuitBreaker,
			AddressResolver: addressResolver,
			SynthsUSD: sUSD,
			Synthetix: synthetix,
			FeePool: feePool,
			DebtCache: debtCache,
			SystemStatus: systemStatus,
			SystemSettings: systemSettings,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD'],
			feeds: ['BTC', 'ETH'],
			perps: [
				{ marketKey: 'pBTC', assetKey: 'BTC' },
				{ marketKey: 'pETH', assetKey: 'ETH' },
			],
			contracts: [
				'FuturesMarketManager',
				'PerpsManagerV2',
				'PerpsEngineV2',
				'AddressResolver',
				'FeePool',
				'ExchangeRates',
				'ExchangeCircuitBreaker',
				'SystemStatus',
				'SystemSettings',
				'Synthetix',
				'DebtCache',
			],
		}));

		// Update the rate so that it is not invalid
		await setPrice(baseAsset, initialPrice);

		// disable dynamic fee for most tests
		// it will be enabled for specific tests
		await systemSettings.setExchangeDynamicFeeRounds('0', { from: owner });

		// tests assume 100, but in actual deployment is different
		await perpsManager.setMinInitialMargin(minInitialMargin, { from: owner });

		// Issue the trader some sUSD
		for (const t of [trader, trader2, trader3]) {
			await sUSD.issue(t, traderInitialBalance);
		}

		// allow owner to suspend system or synths
		await systemStatus.updateAccessControls(
			[toBytes32('System'), toBytes32('Synth')],
			[owner, owner],
			[true, true],
			[true, true],
			{ from: owner }
		);

		// grant mockOrders the permission to make engine calls
		await addressResolver.importAddresses(['PerpsOrdersV2'].map(toBytes32), [mockOrders], {
			from: owner,
		});
		await perpsManager.rebuildCache();
	});

	addSnapshotBeforeRestoreAfterEach();

	describe('Basic parameters', () => {
		it('only expected functions are mutative', () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: instance.abi,
				ignoreParents: ['MixinResolver'],
				expected: [
					// only manager
					'ensureInitialized',
					'recomputeFunding',
					// only orders router
					'transferMargin',
					'modifyLockedMargin',
					'trade',
					'managerPayFee',
					'managerIssueSUSD',
					// anyone
					'liquidatePosition',
				],
			});
		});

		describe('access control & basic validation for mutative methods', () => {
			const revertReason = revertMsg.NotPermitted;

			it('only the manager can access ensureInitialized & recomputeFunding', async () => {
				await addressResolver.importAddresses(['PerpsManagerV2'].map(toBytes32), [mockManager], {
					from: owner,
				});
				await instance.rebuildCache();

				await onlyGivenAddressCanInvoke({
					fnc: instance.ensureInitialized,
					args: [marketKey, baseAsset],
					accounts,
					address: mockManager,
					reason: revertReason,
				});

				await onlyGivenAddressCanInvoke({
					fnc: instance.recomputeFunding,
					args: [marketKey],
					accounts,
					address: mockManager,
					reason: revertReason,
				});
			});

			it('only the orders router can access position modifying methods', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: instance.transferMargin,
					args: [marketKey, trader, toUnit('1000')],
					accounts,
					address: mockOrders,
					reason: revertReason,
				});

				await onlyGivenAddressCanInvoke({
					fnc: instance.modifyLockedMargin,
					args: [marketKey, trader, toUnit('1'), toUnit('0')],
					accounts,
					address: mockOrders,
					reason: revertReason,
				});

				await onlyGivenAddressCanInvoke({
					fnc: instance.trade,
					args: [marketKey, trader, toUnit('1'), defaultExecOptions],
					accounts,
					address: mockOrders,
					reason: revertReason,
				});
			});

			it('only the orders router can access manager sUSD methods', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: instance.managerPayFee,
					args: [marketKey, toUnit('1'), toBytes32('')],
					accounts,
					address: mockOrders,
					reason: revertReason,
				});

				await onlyGivenAddressCanInvoke({
					fnc: instance.managerIssueSUSD,
					args: [marketKey, trader, toUnit('1')],
					accounts,
					address: mockOrders,
					reason: revertReason,
				});
			});

			it('orders methods revert for markets not in manager', async () => {
				const badKey = toBytes32('nope');
				async function checkReverts() {
					await assert.revert(
						instance.transferMargin(badKey, trader, toUnit('1000'), { from: mockOrders }),
						revertReason
					);
					await assert.revert(
						instance.modifyLockedMargin(badKey, trader, toUnit('1'), toUnit('0'), {
							from: mockOrders,
						}),
						revertReason
					);
					await assert.revert(
						instance.trade(badKey, trader, toUnit('1'), defaultExecOptions, {
							from: mockOrders,
						}),
						revertReason
					);
					await assert.revert(
						instance.managerPayFee(badKey, toUnit('1'), toBytes32(''), { from: mockOrders }),
						revertReason
					);
					await assert.revert(
						instance.managerIssueSUSD(badKey, trader, toUnit('1'), { from: mockOrders }),
						revertReason
					);
				}

				// check before is added
				await checkReverts();

				await perpsManager.addMarkets([badKey], [baseAsset], { from: owner });
				await perpsManager.removeMarkets([badKey], { from: owner });
				// check after being removed
				await checkReverts();
			});

			it('unconfigured market for existing asset does not allow trading', async () => {
				const newKey = toBytes32('pNew');
				await perpsManager.addMarkets([newKey], [baseAsset], { from: owner });

				// can deposit margin
				await instance.transferMargin(newKey, trader, toUnit('1000'), { from: mockOrders });

				// can lock
				await instance.modifyLockedMargin(newKey, trader, toUnit('1'), toUnit('0'), {
					from: mockOrders,
				});
				// can unlock
				await instance.modifyLockedMargin(newKey, trader, toUnit('-1'), toUnit('0'), {
					from: mockOrders,
				});

				// fails on leverage check
				await assert.revert(
					instance.trade(newKey, trader, toUnit('1'), defaultExecOptions, {
						from: mockOrders,
					}),
					revertMsg.MaxLeverageExceeded
				);
				// after configuring leverage
				await perpsManager.setMaxLeverage(newKey, toUnit('10'), {
					from: owner,
				});
				// fails on market size check
				await assert.revert(
					instance.trade(newKey, trader, toUnit('1'), defaultExecOptions, {
						from: mockOrders,
					}),
					revertMsg.MaxMarketSizeExceeded
				);
				// can still withdraw deposit
				await instance.transferMargin(newKey, trader, toUnit('-1000'), { from: mockOrders });

				// after setting caps only
				await perpsManager.setMaxSingleSideValueUSD(newKey, toUnit('10000'), {
					from: owner,
				});
				// can trade once
				await instance.transferMargin(newKey, trader, toUnit('1000'), { from: mockOrders });
				await instance.trade(newKey, trader, toUnit('1'), defaultExecOptions, {
					from: mockOrders,
				});
				// but after that the market is still broken due to skewScale being 0
				await assert.revert(instance.proportionalSkew(newKey), 'Skew scale is zero');
				await assert.revert(
					instance.trade(newKey, trader, toUnit('1'), defaultExecOptions, { from: mockOrders }),
					'Skew scale is zero'
				);
			});

			it('unconfigured market for asset without price feed does not work', async () => {
				const newKey = toBytes32('pNew');
				await perpsManager.addMarkets([newKey], [toBytes32('nope')], { from: owner });

				await assert.revert(
					instance.transferMargin(newKey, trader, toUnit('1000'), { from: mockOrders }),
					revertMsg.InvalidPrice
				);
				await assert.revert(
					instance.modifyLockedMargin(newKey, trader, toUnit('1'), toUnit('0'), {
						from: mockOrders,
					}),
					revertMsg.InvalidPrice
				);
				await assert.revert(
					instance.trade(newKey, trader, toUnit('1'), defaultExecOptions, {
						from: mockOrders,
					}),
					revertMsg.InvalidPrice
				);
			});

			it('uninitialized market fails baseAsset check', async () => {
				await assert.revert(instance.assetPrice(toBytes32('pNew')), 'Market not initialised');
			});
		});

		it('contract has CONTRACT_NAME getter', async () => {
			assert.equal(await instance.CONTRACT_NAME(), toBytes32('PerpsEngineV2'));
		});

		it('state contract getter', async () => {
			assert.equal(await instance.stateContract(), perpsStorage.address);
		});

		it('static parameters are set properly after construction', async () => {
			const scalars = await perpsStorage.marketScalars(marketKey);
			assert.equal(scalars.baseAsset, baseAsset);
			// check settings
			const parameters = await perpsManager.marketConfig(marketKey);
			assert.bnEqual(parameters.baseFee, baseFee);
			assert.bnEqual(parameters.baseFeeNextPrice, baseFeeNextPrice);
			assert.bnEqual(parameters.maxLeverage, maxLeverage);
			assert.bnEqual(parameters.maxSingleSideValueUSD, maxSingleSideValueUSD);
			assert.bnEqual(parameters.maxFundingRate, maxFundingRate);
			assert.bnEqual(parameters.skewScaleUSD, skewScaleUSD);
		});

		it('prices are properly fetched', async () => {
			const price = toUnit(200);
			await setPrice(baseAsset, price);
			const res = await instance.assetPrice(marketKey);

			assert.bnEqual(res.price, price);
			assert.isFalse(res.invalid);
		});

		it('market size and skew', async () => {
			const minScale = (await perpsManager.marketConfig(marketKey)).skewScaleUSD;
			const price = 100;
			let sizes = await instance.marketSizes(marketKey);
			let summary = await marketSummary();

			assert.bnEqual(sizes[0], toUnit('0'));
			assert.bnEqual(sizes[1], toUnit('0'));
			assert.bnEqual(summary.marketSize, toUnit('0'));
			assert.bnEqual(summary.marketSkew, toUnit('0'));

			await transferAndTrade({
				account: trader,
				fillPrice: toUnit(price),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('50'),
			});

			sizes = await instance.marketSizes(marketKey);
			summary = await marketSummary();

			assert.bnEqual(sizes[0], toUnit('50'));
			assert.bnEqual(sizes[1], toUnit('0'));
			assert.bnEqual(summary.marketSize, toUnit('50'));
			assert.bnEqual(summary.marketSkew, toUnit('50'));
			assert.bnEqual(
				await instance.proportionalSkew(marketKey),
				divideDecimal(multiplyDecimal(summary.marketSkew, toUnit(price)), minScale)
			);

			await transferAndTrade({
				account: trader2,
				fillPrice: toUnit(price * 1.2),
				marginDelta: toUnit('600'),
				sizeDelta: toUnit('-35'),
			});

			sizes = await instance.marketSizes(marketKey);
			summary = await marketSummary();
			assert.bnEqual(sizes[0], toUnit('50'));
			assert.bnEqual(sizes[1], toUnit('35'));
			assert.bnEqual(summary.marketSize, toUnit('85'));
			assert.bnEqual(summary.marketSkew, toUnit('15'));
			assert.bnClose(
				await instance.proportionalSkew(marketKey),
				divideDecimal(multiplyDecimal(summary.marketSkew, toUnit(price * 1.2)), minScale)
			);

			await closeAndWithdraw({
				account: trader,
				fillPrice: toUnit(price * 1.1),
			});

			sizes = await instance.marketSizes(marketKey);
			summary = await marketSummary();

			assert.bnEqual(sizes[0], toUnit('0'));
			assert.bnEqual(sizes[1], toUnit('35'));
			assert.bnEqual(summary.marketSize, toUnit('35'));
			assert.bnEqual(summary.marketSkew, toUnit('-35'));
			assert.bnClose(
				await instance.proportionalSkew(marketKey),
				divideDecimal(multiplyDecimal(summary.marketSkew, toUnit(price * 1.1)), minScale)
			);

			await closeAndWithdraw({
				account: trader2,
				fillPrice: toUnit(price),
			});

			sizes = await instance.marketSizes(marketKey);
			summary = await marketSummary();
			assert.bnEqual(sizes[0], toUnit('0'));
			assert.bnEqual(sizes[1], toUnit('0'));
			assert.bnEqual(summary.marketSize, toUnit('0'));
			assert.bnEqual(summary.marketSkew, toUnit('0'));
			assert.bnEqual(await instance.proportionalSkew(marketKey), toUnit('0'));
		});
	});

	describe('ensureInitialized', () => {
		beforeEach(async () => {
			// switch to mock manager
			await addressResolver.importAddresses(['PerpsManagerV2'].map(toBytes32), [mockManager], {
				from: owner,
			});
			await instance.rebuildCache();
		});

		it('cam rerun if already initialized', async () => {
			await instance.ensureInitialized(marketKey, baseAsset, { from: mockManager });
		});

		it('reverts in expected cases', async () => {
			// cannot init to another asset
			await assert.revert(
				instance.ensureInitialized(marketKey, toBytes32('other asset'), { from: mockManager }),
				'Initialized with different asset'
			);

			// cannot init to empty marketKey
			await assert.revert(
				instance.ensureInitialized(toBytes32(''), toBytes32('new'), { from: mockManager }),
				'Market key cannot be empty'
			);

			// cannot init to empty asset
			await assert.revert(
				instance.ensureInitialized(toBytes32('pNew'), toBytes32(''), { from: mockManager }),
				'Asset key cannot be empty'
			);
		});
	});

	describe('recomputeFunding', () => {
		it('short circuits for no market size', async () => {
			// switch to mock manager
			await addressResolver.importAddresses(['PerpsManagerV2'].map(toBytes32), [mockManager], {
				from: owner,
			});
			await instance.rebuildCache();

			const lastFundingBefore = await perpsStorage.lastFundingEntry(marketKey);
			// doesn't revert
			await instance.recomputeFunding(marketKey, { from: mockManager });

			// has no effect
			const lastFundingEntry = await perpsStorage.lastFundingEntry(marketKey);
			assert.deepEqual(lastFundingBefore, lastFundingEntry);
		});

		describe('with existing market size', () => {
			beforeEach(async () => {
				// ensure market has OI
				await transferAndTrade({
					account: trader,
					fillPrice: initialPrice,
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('1'),
				});
				// switch to mock manager
				await addressResolver.importAddresses(['PerpsManagerV2'].map(toBytes32), [mockManager], {
					from: owner,
				});
				await instance.rebuildCache();
			});

			it('updates the latest funding entry', async () => {
				const lastFundingBefore = await perpsStorage.lastFundingEntry(marketKey);

				await instance.recomputeFunding(marketKey, { from: mockManager });

				const lastFundingEntry = await perpsStorage.lastFundingEntry(marketKey);
				// funding accrued is negative (and larger) due to skew being long
				assert.bnLt(toBN(lastFundingEntry.funding), toBN(0));
				assert.bnLt(toBN(lastFundingEntry.funding), toBN(lastFundingBefore.funding));
				assert.bnGt(toBN(lastFundingEntry.timestamp), toBN(lastFundingBefore.timestamp));
				assert.bnEqual(toBN(lastFundingEntry.timestamp), await currentTime());
			});

			it('reverts in for invalid price', async () => {
				// set invalid price
				await setPrice(baseAsset, toBN(0));
				// reverts on invalid price
				await assert.revert(
					instance.recomputeFunding(marketKey, { from: mockManager }),
					revertMsg.InvalidPrice
				);
			});
		});
	});

	describe('Transferring margin', () => {
		describe('sUSD balance', () => {
			it(`Can't deposit more sUSD than owned`, async () => {
				const preBalance = await sUSD.balanceOf(trader);
				await assert.revert(transfer(preBalance.add(toUnit('1')), trader), 'subtraction overflow');
			});

			it(`Can't withdraw more sUSD than is in the margin`, async () => {
				await transfer(toUnit('100'), trader);
				await assert.revert(transfer(toUnit('-101'), trader), revertMsg.InsufficientMargin);
			});

			it('Positive delta -> burn sUSD', async () => {
				const preBalance = await sUSD.balanceOf(trader);
				await transfer(toUnit('1000'), trader);
				assert.bnEqual(await sUSD.balanceOf(trader), preBalance.sub(toUnit('1000')));
			});

			it('Negative delta -> mint sUSD', async () => {
				await transfer(toUnit('1000'), trader);
				const preBalance = await sUSD.balanceOf(trader);
				await transfer(toUnit('-500'), trader);
				assert.bnEqual(await sUSD.balanceOf(trader), preBalance.add(toUnit('500')));
			});

			it('Zero delta -> NOP', async () => {
				const preBalance = await sUSD.balanceOf(trader);
				await transfer(toUnit('0'), trader);
				assert.bnEqual(await sUSD.balanceOf(trader), preBalance.sub(toUnit('0')));
			});

			it('fee reclamation is respected', async () => {
				// Set up a mock exchanger
				const mockExchanger = await MockExchanger.new(synthetix.address);
				await addressResolver.importAddresses(
					['Exchanger'].map(toBytes32),
					[mockExchanger.address],
					{
						from: owner,
					}
				);
				await synthetix.rebuildCache();
				await futuresMarketManager.rebuildCache();

				// Set up a starting balance
				const preBalance = await sUSD.balanceOf(trader);
				await transfer(toUnit('1000'), trader);

				// Now set a reclamation event
				await mockExchanger.setReclaim(toUnit('10'));
				await mockExchanger.setNumEntries('1');

				// Issuance works fine
				await transfer(toUnit('-900'), trader);
				assert.bnEqual(await sUSD.balanceOf(trader), preBalance.sub(toUnit('100')));

				assert.bnEqual((await getPositionSummary(trader)).remainingMargin, toUnit('100'));

				// But burning properly deducts the reclamation amount
				await transfer(preBalance.sub(toUnit('100')), trader);
				assert.bnEqual(await sUSD.balanceOf(owner), toUnit('0'));
				assert.bnEqual(
					(await getPositionSummary(trader)).remainingMargin,
					preBalance.sub(toUnit('10'))
				);
			});

			it('events are emitted properly upon margin transfers', async () => {
				// Deposit some balance
				let tx = await transfer(toUnit('1000'), trader3);
				let decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [sUSD, instance],
				});

				decodedEventEqual({
					event: 'Burned',
					emittedFrom: sUSD.address,
					args: [trader3, toUnit('1000')],
					log: decodedLogs[1],
				});

				decodedEventEqual({
					event: 'MarginModified',
					emittedFrom: instance.address,
					args: [marketKey, trader3, toUnit('1000'), toUnit('1000'), 0, 0],
					log: decodedLogs[3],
				});

				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: instance.address,
					args: [
						marketKey,
						toBN('1'),
						trader3,
						toUnit('1000'),
						toBN('0'),
						toBN('0'),
						(await assetPrice()).price,
						toBN('0'),
					],
					log: decodedLogs[4],
				});

				// Zero delta means no PositionModified, MarginModified, or sUSD events
				tx = await transfer(toUnit('0'), trader3);
				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [sUSD, instance, perpsStorage],
				});
				assert.equal(decodedLogs.length, 1);
				assert.equal(decodedLogs[0].name, 'FundingUpdated');

				// Now withdraw the margin back out
				tx = await transfer(toUnit('-1000'), trader3);
				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [sUSD, instance],
				});

				decodedEventEqual({
					event: 'Issued',
					emittedFrom: sUSD.address,
					args: [trader3, toUnit('1000')],
					log: decodedLogs[1],
				});

				decodedEventEqual({
					event: 'MarginModified',
					emittedFrom: instance.address,
					args: [marketKey, trader3, toUnit('-1000'), toUnit('-1000'), 0, 0],
					log: decodedLogs[2],
				});

				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: instance.address,
					args: [
						marketKey,
						toBN('1'),
						trader3,
						toUnit('0'),
						toBN('0'),
						toBN('0'),
						(await assetPrice()).price,
						toBN('0'),
					],
					log: decodedLogs[3],
				});
			});
		});

		it('Reverts if the price is invalid', async () => {
			await transfer(toUnit('1000'), trader);
			await fastForward(7 * 24 * 60 * 60);
			await assert.revert(transfer(toUnit('-1000'), trader), revertMsg.InvalidPrice);
		});

		it('Reverts if the system is suspended', async () => {
			await transfer(toUnit('1000'), trader);

			// suspend
			await systemStatus.suspendSystem('3', { from: owner });
			// should revert
			await assert.revert(transfer(toUnit('-1000'), trader), 'Synthetix is suspended');

			// resume
			await systemStatus.resumeSystem({ from: owner });
			// should work now
			await transfer(toUnit('-1000'), trader);
			assert.bnClose(await withdrawableMargin(trader), toBN('0'), toUnit('0.1'));
		});

		describe('No position', async () => {
			it('New margin', async () => {
				assert.bnEqual((await getPosition(trader)).margin, toBN(0));
				await transfer(toUnit('1000'), trader);
				assert.bnEqual((await getPosition(trader)).margin, toUnit('1000'));
			});

			it('Increase margin', async () => {
				await transfer(toUnit('1000'), trader);
				await transfer(toUnit('1000'), trader);
				assert.bnEqual((await getPosition(trader)).margin, toUnit('2000'));
			});

			it('Decrease margin', async () => {
				await transfer(toUnit('1000'), trader);
				await transfer(toUnit('-500'), trader);
				assert.bnEqual((await getPosition(trader)).margin, toUnit('500'));
			});

			it('Abolish margin', async () => {
				await transfer(toUnit('1000'), trader);
				await transfer(toUnit('-1000'), trader);
				assert.bnEqual((await getPosition(trader)).margin, toUnit('0'));
			});

			it('Cannot decrease margin past zero.', async () => {
				await assert.revert(transfer(toUnit('-1'), trader), revertMsg.InsufficientMargin);
				await transfer(toUnit('1000'), trader);
				await assert.revert(transfer(toUnit('-2000'), trader), revertMsg.InsufficientMargin);
			});
		});

		describe('Existing position', () => {
			it.skip('Transferring margin updates margin, last price, funding index, but not size', async () => {
				assert.isTrue(false);
			});

			it.skip('Increase margin', async () => {
				assert.isTrue(false);
			});

			it.skip('Decrease margin', async () => {
				assert.isTrue(false);
			});

			it.skip('Transferring margin realises profit and funding', async () => {
				assert.isTrue(false);
			});
		});

		describe('modifyLockedMargin', () => {
			it('events are emitted properly', async () => {
				const margin = toUnit('1000');
				await transfer(margin, trader3);

				const tx = await instance.modifyLockedMargin(marketKey, trader3, toUnit('100'), toBN(0), {
					from: mockOrders,
				});
				const decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [sUSD, instance, perpsStorage],
				});
				assert.equal(decodedLogs.length, 3);
				assert.equal(decodedLogs[0].name, 'FundingUpdated');

				decodedEventEqual({
					event: 'MarginModified',
					emittedFrom: instance.address,
					args: [marketKey, trader3, toUnit('-100'), 0, toUnit('100'), 0],
					log: decodedLogs[1],
				});

				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: instance.address,
					args: [
						marketKey,
						toBN('1'),
						trader3,
						toUnit('900'),
						toBN('0'),
						toBN('0'),
						(await assetPrice()).price,
						toBN('0'),
					],
					log: decodedLogs[2],
				});
			});

			it('reverts as for zero amounts', async () => {
				await assert.revert(
					instance.modifyLockedMargin(marketKey, trader, toBN(0), toBN(0), { from: mockOrders }),
					'Zero modification amounts'
				);
			});

			it('reverts for negative locked', async () => {
				const revertMsg = 'New locked margin negative';
				await assert.revert(
					instance.modifyLockedMargin(marketKey, trader, toBN(0), toBN('1'), {
						from: mockOrders,
					}),
					revertMsg
				);
				await assert.revert(
					instance.modifyLockedMargin(marketKey, trader, toBN('1'), toBN('2'), {
						from: mockOrders,
					}),
					revertMsg
				);
			});

			it('reverts for margin checks if position size is not zero', async () => {
				const margin = toUnit('1000');
				await transfer(margin, trader);
				await trade(toUnit('1'), trader);
				// min margin
				await assert.revert(
					instance.modifyLockedMargin(marketKey, trader, toUnit('900'), toBN(0), {
						from: mockOrders,
					}),
					revertMsg.InsufficientMargin
				);
				// leverage
				await trade(toUnit('99'), trader);
				await assert.revert(
					instance.modifyLockedMargin(marketKey, trader, toUnit('10'), toBN(0), {
						from: mockOrders,
					}),
					revertMsg.MaxLeverageExceeded
				);
				// liquidatable
				await setPrice(baseAsset, toUnit('90'));
				await assert.revert(
					instance.modifyLockedMargin(marketKey, trader, toUnit('10'), toBN(0), {
						from: mockOrders,
					}),
					revertMsg.CanLiquidate
				);
			});

			it('locking and burning', async () => {
				const margin = toBN('1000');
				// lock some
				await transfer(margin, trader);
				let position = await getPosition(trader);
				assert.bnEqual(toBN(position.margin), margin);
				assert.bnEqual(position.lockedMargin, 0);
				// lock
				const locked = toBN('10');
				await instance.modifyLockedMargin(marketKey, trader, locked, 0, { from: mockOrders });
				position = await getPosition(trader);
				assert.bnEqual(toBN(position.margin), margin.sub(locked));
				assert.bnEqual(toBN(position.lockedMargin), locked);
				// cannot burn more than locked
				await assert.revert(
					instance.modifyLockedMargin(marketKey, trader, 0, toBN('20'), { from: mockOrders }),
					'New locked margin negative'
				);
				// can burn locked
				await instance.modifyLockedMargin(marketKey, trader, 0, locked, { from: mockOrders });
				position = await getPosition(trader);
				assert.bnEqual(toBN(position.margin), margin.sub(locked));
				assert.bnEqual(toBN(position.lockedMargin), 0);
			});

			it('locking and unlocking', async () => {
				const margin = toBN('1000');
				// lock some
				await transfer(margin, trader);
				const locked = toBN('10');
				await instance.modifyLockedMargin(marketKey, trader, locked, 0, { from: mockOrders });
				// cannot unlock more than locked
				await assert.revert(
					instance.modifyLockedMargin(marketKey, trader, toBN('-11'), 0, { from: mockOrders }),
					'New locked margin negative'
				);
				// can burn locked
				await instance.modifyLockedMargin(marketKey, trader, locked.neg(), 0, { from: mockOrders });
				const position = await getPosition(trader);
				assert.bnEqual(toBN(position.margin), margin);
				assert.bnEqual(toBN(position.lockedMargin), 0);
			});

			it('debt accounting of locking and burning', async () => {
				const margin = toBN('1000');
				await transfer(margin, trader);
				const debtBefore = await instance.marketDebt(marketKey);
				// lock
				const locked = toBN('10');
				await instance.modifyLockedMargin(marketKey, trader, locked, 0, { from: mockOrders });
				// debt should stay the same
				assert.bnEqual(debtBefore.debt, (await instance.marketDebt(marketKey)).debt);
				// burn
				await instance.modifyLockedMargin(marketKey, trader, 0, locked, { from: mockOrders });
				// debt should have changed
				assert.bnEqual(debtBefore.debt.sub((await instance.marketDebt(marketKey)).debt), locked);
			});
		});
	});

	describe('Modifying positions', () => {
		it('modifying changes position state, market state, and emits event ', async () => {
			const margin = toUnit('1000');
			await transfer(margin, trader);
			const size = toUnit('50');
			const price = toUnit('200');
			await setPrice(baseAsset, price);
			const fee = (await instance.orderFee(marketKey, size, defaultExecOptions)).fee;
			const tx = await trade(size, trader);

			const pos = await getPosition(trader);
			assert.bnEqual(pos.margin, margin.sub(fee));
			assert.bnEqual(pos.size, size);
			assert.bnEqual(pos.lastPrice, price);

			// Skew, size, entry notional sum, pending order value are updated.

			const summary = await marketSummary();
			assert.bnEqual(summary.marketSkew, size);
			assert.bnEqual(summary.marketSize, size);
			assert.bnEqual(
				(await perpsStorage.marketScalars(marketKey)).entryDebtCorrection,
				margin.sub(fee).sub(multiplyDecimal(size, price))
			);

			// The relevant events are properly emitted
			const decodedLogs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [sUSD, instance, perpsStorage],
			});
			assert.equal(decodedLogs.length, 3);
			// funding, fee, position modified
			assert.equal(decodedLogs[0].name, 'FundingUpdated');
			decodedEventEqual({
				event: 'Issued',
				emittedFrom: sUSD.address,
				args: [await feePool.FEE_ADDRESS(), fee],
				log: decodedLogs[1],
			});
			decodedEventEqual({
				event: 'PositionModified',
				emittedFrom: instance.address,
				args: [marketKey, toBN('1'), trader, margin.sub(fee), size, size, price, fee],
				log: decodedLogs[2],
			});
		});

		it('custom execution options used: tracking code, price delta, fee rate', async () => {
			const margin = toUnit('1000');
			await transfer(margin, trader);
			const marketPrice = toUnit('200');
			await setPrice(baseAsset, marketPrice);
			const size = toUnit('50');

			// custom options
			const feeRate = toUnit('0.042');
			const priceDelta = toUnit('-1');
			const trackingCode = toBytes32('tracking');

			const tradePrice = marketPrice.add(priceDelta);
			const execOptions = [feeRate, priceDelta, trackingCode];
			const fee = (await instance.orderFee(marketKey, size, execOptions)).fee;
			// check fee from view as expected
			assert.bnEqual(fee, multiplyDecimal(multiplyDecimal(tradePrice, size), feeRate));

			const tx = await trade(size, trader, { feeRate, priceDelta, trackingCode });

			// The relevant events are properly emitted
			const decodedLogs = await getDecodedLogs({
				hash: tx.tx,
				contracts: [sUSD, instance, perpsStorage],
			});
			assert.equal(decodedLogs.length, 4);
			assert.equal(decodedLogs[0].name, 'FundingUpdated');
			decodedEventEqual({
				event: 'Issued',
				emittedFrom: sUSD.address,
				args: [await feePool.FEE_ADDRESS(), fee],
				log: decodedLogs[1],
			});
			decodedEventEqual({
				event: 'Tracking',
				emittedFrom: instance.address,
				args: [trackingCode, marketKey, trader, size, fee],
				log: decodedLogs[2],
			});
			decodedEventEqual({
				event: 'PositionModified',
				emittedFrom: instance.address,
				args: [marketKey, toBN('1'), trader, margin.sub(fee), size, size, tradePrice, fee],
				log: decodedLogs[3],
			});
		});

		it('Cannot modify a position if the price is invalid', async () => {
			const margin = toUnit('1000');
			await transfer(margin, trader);
			const size = toUnit('10');
			await trade(size, trader);

			await setPrice(baseAsset, toUnit('200'));

			await fastForward(4 * 7 * 24 * 60 * 60);

			const postDetails = await instance.postTradeDetails(
				marketKey,
				trader,
				size,
				defaultExecOptions
			);
			assert.equal(postDetails.status, Status.InvalidPrice);

			await assert.revert(trade(size, trader), revertMsg.InvalidPrice);
		});

		it('Cannot modify a position if the system is suspended', async () => {
			const margin = toUnit('1000');
			await transfer(margin, trader);
			const size = toUnit('10');
			const price = toUnit('200');
			await setPrice(baseAsset, price);

			// suspend
			await systemStatus.suspendSystem('3', { from: owner });
			// should revert modifying position
			await assert.revert(trade(size, trader), 'Synthetix is suspended');

			// resume
			await systemStatus.resumeSystem({ from: owner });
			// should work now
			await trade(size, trader);
			const pos = await getPosition(trader);
			assert.bnEqual(pos.size, size);
			assert.bnEqual(pos.lastPrice, price);
		});

		it('Empty orders fail', async () => {
			const margin = toUnit('1000');
			await transfer(margin, trader);
			await assert.revert(trade(toBN('0'), trader), revertMsg.NilOrder);
			const postDetails = await instance.postTradeDetails(
				marketKey,
				trader,
				toBN('0'),
				defaultExecOptions
			);
			assert.equal(postDetails.status, Status.NilOrder);
		});

		it('Cannot modify a position if it is liquidatable', async () => {
			await transferAndTrade({
				account: trader,
				fillPrice: toUnit('200'),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('50'),
			});

			await setPrice(baseAsset, toUnit('100'));
			// User realises the price has crashed and tries to outrun their liquidation, but it fails

			const sizeDelta = toUnit('-50');
			const postDetails = await instance.postTradeDetails(
				marketKey,
				trader,
				sizeDelta,
				defaultExecOptions
			);
			assert.equal(postDetails.status, Status.CanLiquidate);

			await assert.revert(trade(sizeDelta, trader), revertMsg.CanLiquidate);
		});

		it('Order modification properly records the exchange fee with the fee pool', async () => {
			const FEE_ADDRESS = await feePool.FEE_ADDRESS();
			const preBalance = await sUSD.balanceOf(FEE_ADDRESS);
			const preDistribution = (await feePool.recentFeePeriods(0))[3];
			await setPrice(baseAsset, toUnit('200'));
			const fee = (await instance.orderFee(marketKey, toUnit('50'), defaultExecOptions)).fee;
			await transferAndTrade({
				account: trader,
				fillPrice: toUnit('200'),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('50'),
			});

			assert.bnEqual(await sUSD.balanceOf(FEE_ADDRESS), preBalance.add(fee));
			assert.bnEqual((await feePool.recentFeePeriods(0))[3], preDistribution.add(fee));
		});

		it('Modifying a position without closing it should not change its id', async () => {
			await transferAndTrade({
				account: trader,
				fillPrice: toUnit('200'),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('50'),
			});
			const { id: oldPositionId } = await getPosition(trader);

			await transferAndTrade({
				account: trader,
				fillPrice: toUnit('200'),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('-25'),
			});
			const { id: newPositionId } = await getPosition(trader);
			assert.bnEqual(oldPositionId, newPositionId);
		});

		it('max leverage cannot be exceeded', async () => {
			await setPrice(baseAsset, toUnit('100'));
			await transfer(toUnit('1000'), trader);
			await transfer(toUnit('1000'), trader2);
			await assert.revert(trade(toUnit('101'), trader), revertMsg.MaxLeverageExceeded);
			let postDetails = await instance.postTradeDetails(
				marketKey,
				trader,
				toUnit('101'),
				defaultExecOptions
			);
			assert.equal(postDetails.status, Status.MaxLeverageExceeded);

			await assert.revert(trade(toUnit('-101'), trader2), revertMsg.MaxLeverageExceeded);
			postDetails = await instance.postTradeDetails(
				marketKey,
				trader,
				toUnit('-101'),
				defaultExecOptions
			);
			assert.equal(postDetails.status, Status.MaxLeverageExceeded);

			// But we actually allow up to 10.01x leverage to account for rounding issues.
			await trade(toUnit('100.09'), trader);
			await trade(toUnit('-100.09'), trader2);
		});

		it('old position is checked for after fee deduction', async () => {
			await setPrice(baseAsset, toUnit('100'));
			await transfer(toUnit('1000'), trader);
			// trade fee is so large that old position becomes liquidatable when fee is subtracted
			// and fails liquidation check (before reaching the leverage check)
			await assert.revert(trade(toUnit('10000'), trader), revertMsg.InsufficientMargin);
		});

		it('new position is checked to be not be under liquidation margin', async () => {
			await setPrice(baseAsset, toUnit('100'));
			await transfer(toUnit('1000'), trader);
			// trade size is so large that new margin (after fee) is already below liquidation margin
			// for the new trade size
			await assert.revert(trade(toUnit('2000'), trader), revertMsg.CanLiquidate);
		});

		it('can reduce leverage if goes above max', async () => {
			await setPrice(baseAsset, toUnit('100'));
			await transfer(toUnit('1000'), trader);
			await trade(toUnit('100'), trader);

			let postDetails = await instance.postTradeDetails(
				marketKey,
				trader,
				toUnit('1'),
				defaultExecOptions
			);
			assert.equal(postDetails.status, Status.MaxLeverageExceeded);

			await setPrice(baseAsset, toUnit('95')); // add a loss of half the margin, getting the leverage to 20x
			// cannot reduce a little - because will be over max leverage
			postDetails = await instance.postTradeDetails(
				marketKey,
				trader,
				toUnit('-1'),
				defaultExecOptions
			);
			assert.equal(postDetails.status, Status.MaxLeverageExceeded);

			// but can reduce by a lot into healthy leverage size
			postDetails = await instance.postTradeDetails(
				marketKey,
				trader,
				toUnit('-55'),
				defaultExecOptions
			);
			assert.equal(postDetails.status, Status.Ok);

			// can reduce leverage by an arbitrary amount if transferring more margin
			await transfer(toUnit('1'), trader);
		});

		it('min margin must be provided', async () => {
			await setPrice(baseAsset, toUnit('10'));
			await transfer(minInitialMargin.sub(toUnit('1')), trader);
			await assert.revert(trade(toUnit('10'), trader), revertMsg.InsufficientMargin);

			let postDetails = await instance.postTradeDetails(
				marketKey,
				trader,
				toUnit('10'),
				defaultExecOptions
			);
			assert.equal(postDetails.status, Status.InsufficientMargin);

			// But it works after transferring the remaining $1
			await transfer(toUnit('1'), trader);

			postDetails = await instance.postTradeDetails(
				marketKey,
				trader,
				toUnit('10'),
				defaultExecOptions
			);

			assert.bnEqual(postDetails.margin, minInitialMargin.sub(toUnit('0.3')));
			assert.bnEqual(postDetails.size, toUnit('10'));
			assert.bnEqual(postDetails.fee, toUnit('0.3'));
			assert.equal(postDetails.status, Status.Ok);

			await trade(toUnit('10'), trader);

			// liqMargin = max(20, 10*10*0.0035) + 10*10*0.0025 = 20.25
			// 10 + (20.25 − (100 - 0.3))÷10 = 2.055
			assert.bnEqual((await getPositionSummary(trader)).approxLiquidationPrice, toUnit('2.055'));
		});

		describe('Max market size constraints', () => {
			const maxOrderSizes = () => instance.maxOrderSizes(marketKey);

			it('properly reports the max order size on each side', async () => {
				let maxSizes = await maxOrderSizes();

				assert.bnEqual(maxSizes.long, divideDecimal(maxSingleSideValueUSD, initialPrice));
				assert.bnEqual(maxSizes.short, divideDecimal(maxSingleSideValueUSD, initialPrice));

				let newPrice = toUnit('193');
				await setPrice(baseAsset, newPrice);

				maxSizes = await maxOrderSizes();

				assert.bnEqual(maxSizes.long, divideDecimal(maxSingleSideValueUSD, newPrice));
				assert.bnEqual(maxSizes.short, divideDecimal(maxSingleSideValueUSD, newPrice));

				// Submit order on one side, leaving part of what's left.

				// 400 units submitted, out of 666.66.. available
				newPrice = toUnit('150');
				await transferAndTrade({
					account: trader,
					fillPrice: newPrice,
					marginDelta: toUnit('10000'),
					sizeDelta: toUnit('400'),
				});

				maxSizes = await maxOrderSizes();
				assert.bnEqual(
					maxSizes.long,
					divideDecimal(maxSingleSideValueUSD, newPrice).sub(toUnit('400'))
				);
				assert.bnEqual(maxSizes.short, divideDecimal(maxSingleSideValueUSD, newPrice));

				// Submit order on the other side, removing all available supply.
				await transferAndTrade({
					account: trader2,
					fillPrice: newPrice,
					marginDelta: toUnit('10001'),
					sizeDelta: toUnit('-666.733'),
				});

				maxSizes = await maxOrderSizes();
				assert.bnEqual(
					maxSizes.long,
					divideDecimal(maxSingleSideValueUSD, newPrice).sub(toUnit('400'))
				); // Long side is unaffected
				assert.bnEqual(maxSizes.short, toUnit('0'));

				// An additional few units on the long side by another trader
				await transferAndTrade({
					account: trader3,
					fillPrice: newPrice,
					marginDelta: toUnit('10000'),
					sizeDelta: toUnit('200'),
				});

				maxSizes = await maxOrderSizes();
				assert.bnEqual(
					maxSizes.long,
					divideDecimal(maxSingleSideValueUSD, newPrice).sub(toUnit('600'))
				);
				assert.bnEqual(maxSizes.short, toUnit('0'));

				// Price increases - no more supply allowed.
				await setPrice(baseAsset, newPrice.mul(toBN(2)));
				maxSizes = await maxOrderSizes();
				assert.bnEqual(maxSizes.long, toUnit('0')); // Long side is unaffected
				assert.bnEqual(maxSizes.short, toUnit('0'));

				// Price decreases - more supply allowed again.
				newPrice = newPrice.div(toBN(4));
				await setPrice(baseAsset, newPrice);
				maxSizes = await maxOrderSizes();
				assert.bnEqual(
					maxSizes.long,
					divideDecimal(maxSingleSideValueUSD, newPrice).sub(toUnit('600'))
				);
				assert.bnClose(
					maxSizes.short,
					divideDecimal(maxSingleSideValueUSD, newPrice).sub(toUnit('666.73333')),
					toUnit('0.001')
				);
			});

			for (const side of ['long', 'short']) {
				describe(`${side}`, () => {
					let maxSize, maxMargin, orderSize;
					const leverage = side === 'long' ? toUnit('10') : toUnit('-10');

					beforeEach(async () => {
						await perpsManager.setMaxSingleSideValueUSD(marketKey, toUnit('10000'), {
							from: owner,
						});
						await setPrice(baseAsset, toUnit('1'));

						const maxSizes = await maxOrderSizes();
						maxSize = maxSizes[side];
						maxMargin = maxSize;
						orderSize = side === 'long' ? maxSize : maxSize.neg();
					});

					it('Orders are blocked if they exceed max market size', async () => {
						await transfer(maxMargin.add(toUnit('11')), trader);
						const tooBig = orderSize.div(toBN('10')).mul(toBN('11'));

						const postDetails = await instance.postTradeDetails(
							marketKey,
							trader,
							tooBig,
							defaultExecOptions
						);
						assert.equal(postDetails.status, Status.MaxMarketSizeExceeded);

						await assert.revert(trade(tooBig, trader), revertMsg.MaxMarketSizeExceeded);

						// orders are allowed a bit over the formal limit to account for rounding etc.
						await trade(orderSize.add(toBN('1')), trader);
					});

					it('Orders are allowed a touch of extra size to account for price motion on confirmation', async () => {
						// Ensure there's some existing order size for prices to shunt around.
						await transfer(maxMargin, trader2);
						await trade(orderSize.div(toBN(10)).mul(toBN(7)), trader2);

						await transfer(maxMargin, trader);

						// The price moves, so the value of the already-confirmed order shunts out the pending one.
						await setPrice(baseAsset, toUnit('1.08'));

						const sizeDelta = orderSize.div(toBN(100)).mul(toBN(25));
						const postDetails = await instance.postTradeDetails(
							marketKey,
							trader,
							sizeDelta,
							defaultExecOptions
						);
						assert.equal(postDetails.status, Status.MaxMarketSizeExceeded);
						await assert.revert(trade(sizeDelta, trader), revertMsg.MaxMarketSizeExceeded);

						// Price moves back partially and allows the order to confirm
						await setPrice(baseAsset, toUnit('1.04'));
						await trade(orderSize.div(toBN(100)).mul(toBN(25)), trader);
					});

					it('Orders are allowed to reduce in size (or close) even if the result is still over the max', async () => {
						const sideVar = leverage.div(leverage.abs());
						const initialSize = orderSize.div(toBN('10')).mul(toBN('8'));

						await transfer(maxMargin.mul(toBN('10')), trader);
						await trade(initialSize, trader);

						// Now exceed max size (but price isn't so high that shorts would be liquidated)
						await setPrice(baseAsset, toUnit('1.9'));

						const sizes = await maxOrderSizes();
						assert.bnEqual(sizes[leverage.gt(toBN('0')) ? 0 : 1], toBN('0'));

						// Reduce the order size, even though we are above the maximum
						await trade(toUnit('-1').mul(sideVar), trader);
					});
				});
			}
		});

		describe('Closing positions', () => {
			it('can close an open position', async () => {
				const margin = toUnit('1000');
				await transfer(margin, trader);
				await setPrice(baseAsset, toUnit('200'));
				await trade(toUnit('50'), trader);

				await setPrice(baseAsset, toUnit('199'));
				await close(trader);
				const pos = await getPosition(trader);
				const remaining = (await getPositionSummary(trader)).remainingMargin;

				assert.bnEqual(pos.margin, remaining);
				assert.bnEqual(pos.size, toUnit(0));
				assert.bnEqual(pos.lastPrice, toUnit('199'));

				// Skew, size, entry notional sum, debt are updated.
				const summary = await marketSummary();
				assert.bnEqual(summary.marketSkew, toUnit(0));
				assert.bnEqual(summary.marketSize, toUnit(0));
				assert.bnEqual(summary.marketDebt, remaining);
				assert.bnEqual(
					(await perpsStorage.marketScalars(marketKey)).entryDebtCorrection,
					remaining
				);
			});

			it('Cannot close a position if it is liquidating', async () => {
				await transferAndTrade({
					account: trader,
					fillPrice: toUnit('200'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('50'),
				});

				await setPrice(baseAsset, toUnit('100'));

				await assert.revert(close(trader), revertMsg.CanLiquidate);
			});

			it('Cannot close an already-closed position', async () => {
				await transferAndTrade({
					account: trader,
					fillPrice: toUnit('200'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('50'),
				});

				await close(trader);
				const { size } = await getPosition(trader);
				assert.bnEqual(size, toUnit(0));

				await assert.revert(close(trader), revertMsg.NilOrder);
			});

			it('position closure emits the appropriate event', async () => {
				await transferAndTrade({
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('10'),
				});

				await setPrice(baseAsset, toUnit('200'));
				const tx = await close(trader);

				const decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [sUSD, instance],
				});

				assert.equal(decodedLogs.length, 3);
				const fee = multiplyDecimal(toUnit(1000), baseFee).add(
					multiplyDecimal(toUnit(2000), baseFee)
				);

				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: instance.address,
					args: [
						marketKey,
						toBN('1'),
						trader,
						toUnit('2000').sub(fee),
						toBN('0'),
						toUnit('-10'),
						(await assetPrice()).price,
						multiplyDecimal(toUnit(2000), baseFee),
					],
					log: decodedLogs[2],
					bnCloseVariance: toUnit('0.1'),
				});
			});

			it('transferring margin sets position id', async () => {
				await setPrice(baseAsset, toUnit('100'));

				// no positions
				assert.equal((await perpsStorage.marketScalars(marketKey)).lastPositionId, 0);

				// Trader 1 gets position id 1.
				let tx = await transfer(toUnit('1000'), trader);
				let decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [instance],
				});
				assert.equal(decodedLogs[4].name, 'PositionModified');
				assert.equal(decodedLogs[4].events[1].name, 'id');
				assert.bnEqual(decodedLogs[4].events[1].value, toBN('1'));
				assert.equal(await perpsStorage.positionIdToAccount(marketKey, 1), trader);

				// next is 2
				assert.equal((await perpsStorage.marketScalars(marketKey)).lastPositionId, 1);

				// trader 2 gets 2
				tx = await transfer(toUnit('1000'), trader2);
				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [instance],
				});
				assert.equal(decodedLogs[4].name, 'PositionModified');
				assert.equal(decodedLogs[4].events[1].name, 'id');
				assert.bnEqual(decodedLogs[4].events[1].value, toBN('2'));
				assert.equal(await perpsStorage.positionIdToAccount(marketKey, 2), trader2);

				// next is 3
				assert.equal((await perpsStorage.marketScalars(marketKey)).lastPositionId, 2);

				// And the ids have been modified
				let positionId = (await getPosition(trader)).id;
				assert.bnEqual(positionId, toBN('1'));
				positionId = (await getPosition(trader2)).id;
				assert.bnEqual(positionId, toBN('2'));
			});

			it('modifying a position retains the same id', async () => {
				await setPrice(baseAsset, toUnit('100'));
				await transfer(toUnit('1000'), trader);

				// Trader gets position id 1.
				let tx = await trade(toUnit('10'), trader);
				let decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [instance],
				});
				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[1].name, 'id');
				assert.bnEqual(decodedLogs[2].events[1].value, toBN('1'));

				let positionId = (await getPosition(trader)).id;
				assert.bnEqual(positionId, toBN('1'));

				// Modification (but not closure) does not alter the id
				tx = await trade(toUnit('-5'), trader);
				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [instance],
				});
				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[1].name, 'id');
				assert.bnEqual(decodedLogs[2].events[1].value, toBN('1'));

				// And the ids have been modified
				positionId = (await getPosition(trader)).id;
				assert.bnEqual(positionId, toBN('1'));
			});

			it('closing a position does not delete the id', async () => {
				await setPrice(baseAsset, toUnit('100'));
				await transfer(toUnit('1000'), trader);
				await transfer(toUnit('1000'), trader2);

				// close by closePosition
				let tx = await trade(toUnit('10'), trader);
				let decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [instance],
				});
				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[1].name, 'id');
				assert.bnEqual(decodedLogs[2].events[1].value, toBN('1'));

				let positionId = (await getPosition(trader)).id;
				assert.bnEqual(positionId, toBN('1'));

				tx = await close(trader);
				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [instance],
				});
				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[1].name, 'id');
				assert.bnEqual(decodedLogs[2].events[1].value, toBN('1'));

				positionId = (await getPosition(trader)).id;
				assert.bnEqual(positionId, toBN('1'));

				// Close by trade
				tx = await trade(toUnit('10'), trader2);
				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [instance],
				});
				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[1].name, 'id');
				assert.bnEqual(decodedLogs[2].events[1].value, toBN('2'));

				positionId = (await getPosition(trader2)).id;
				assert.bnEqual(positionId, toBN('2'));

				tx = await trade(toUnit('-10'), trader2);
				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [instance],
				});
				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[1].name, 'id');
				assert.bnEqual(decodedLogs[2].events[1].value, toBN('2'));
			});

			it('closing a position and opening one after should not increment the position id', async () => {
				await transferAndTrade({
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('10'),
				});

				const { id: oldPositionId } = await getPosition(trader);
				assert.bnEqual(oldPositionId, toBN('1'));

				await setPrice(baseAsset, toUnit('200'));
				let tx = await close(trader);

				let decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [instance],
				});

				// No fee => no fee minting log, so decodedLogs index == 1
				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[1].name, 'id');
				assert.bnEqual(decodedLogs[2].events[1].value, toBN('1'));

				tx = await trade(toUnit('10'), trader);

				decodedLogs = await getDecodedLogs({
					hash: tx.tx,
					contracts: [instance],
				});

				assert.equal(decodedLogs[2].name, 'PositionModified');
				assert.equal(decodedLogs[2].events[1].name, 'id');
				assert.bnEqual(decodedLogs[2].events[1].value, toBN('1'));

				const { id: newPositionId } = await getPosition(trader);
				assert.bnEqual(newPositionId, toBN('1'));

				assert.bnEqual(await perpsStorage.positionIdToAccount(marketKey, toBN('1')), trader);
			});
		});

		describe('post-trade position details', async () => {
			const getPositionDetails = async ({ account }) => {
				const newPosition = await getPosition(account);
				const summary = await getPositionSummary(account);
				return {
					...summary,
					...newPosition,
				};
			};
			const sizeDelta = toUnit('10');

			it('can get position details for new position', async () => {
				await transfer(toUnit('1000'), trader);
				await setPrice(baseAsset, toUnit('240'));

				const expectedDetails = await instance.postTradeDetails(
					marketKey,
					trader,
					sizeDelta,
					defaultExecOptions
				);

				// Now execute the trade.
				await trade(sizeDelta, trader);

				const details = await getPositionDetails({ account: trader });

				assert.bnClose(expectedDetails.margin, details.margin, toUnit(0.01)); // one block of funding rate has accrued
				assert.bnEqual(expectedDetails.size, details.size);
				assert.bnEqual(expectedDetails.fee, toUnit('7.2'));
				assert.bnEqual(expectedDetails.status, Status.Ok);
			});

			it('uses the margin of an existing position', async () => {
				await transferAndTrade({
					account: trader,
					fillPrice: toUnit('240'),
					marginDelta: toUnit('1000'),
					sizeDelta,
				});

				const expectedDetails = await instance.postTradeDetails(
					marketKey,
					trader,
					sizeDelta,
					defaultExecOptions
				);

				// Now execute the trade.
				await trade(sizeDelta, trader);

				const details = await getPositionDetails({ account: trader });

				assert.bnClose(expectedDetails.margin, details.margin, toUnit(0.01)); // one block of funding rate has accrued
				assert.bnEqual(expectedDetails.size, details.size);
				assert.bnEqual(expectedDetails.fee, toUnit('7.2'));
				assert.bnEqual(expectedDetails.status, Status.Ok);
			});
		});
	});

	describe('Position summary', () => {
		describe('PnL', () => {
			beforeEach(async () => {
				await setPrice(baseAsset, toUnit('100'));
				await transfer(toUnit('1000'), trader);
				await trade(toUnit('50'), trader);
				await transfer(toUnit('4000'), trader2);
				await trade(toUnit('-40'), trader2);
			});

			it('steady price', async () => {
				assert.bnEqual((await getPositionSummary(trader)).profitLoss, toBN(0));
				assert.bnEqual((await getPositionSummary(trader2)).profitLoss, toBN(0));
			});

			it('price increase', async () => {
				await setPrice(baseAsset, toUnit('150'));
				assert.bnEqual((await getPositionSummary(trader)).profitLoss, toUnit('2500'));
				assert.bnEqual((await getPositionSummary(trader2)).profitLoss, toUnit('-2000'));
			});

			it('price decrease', async () => {
				await setPrice(baseAsset, toUnit('90'));

				assert.bnEqual((await getPositionSummary(trader)).profitLoss, toUnit('-500'));
				assert.bnEqual((await getPositionSummary(trader2)).profitLoss, toUnit('400'));
			});

			it('Reports invalid prices properly', async () => {
				assert.isFalse((await getPositionSummary(trader)).priceInvalid);
				await fastForward(7 * 24 * 60 * 60); // Stale the prices
				assert.isTrue((await getPositionSummary(trader)).priceInvalid);
			});

			it.skip('Zero profit on a zero-size position', async () => {
				assert.isTrue(false);
			});
		});

		describe('Remaining margin', async () => {
			let fee, fee2;

			beforeEach(async () => {
				await setPrice(baseAsset, toUnit('100'));
				fee = (await instance.orderFee(marketKey, toUnit('50'), defaultExecOptions)).fee;
				await transfer(toUnit('1000'), trader);
				await trade(toUnit('50'), trader);
				fee2 = (await instance.orderFee(marketKey, toUnit('-50'), defaultExecOptions)).fee;
				await transfer(toUnit('5000'), trader2);
				await trade(toUnit('-50'), trader2);
			});

			it('Remaining margin unchanged with no funding or profit', async () => {
				await fastForward(24 * 60 * 60);
				// Note that the first guy paid a bit of funding as there was a delay between confirming
				// the first and second orders
				assert.bnClose(
					(await getPositionSummary(trader)).remainingMargin,
					toUnit('1000').sub(fee),
					toUnit('0.1')
				);
				assert.bnEqual(
					(await getPositionSummary(trader2)).remainingMargin,
					toUnit('5000').sub(fee2)
				);
			});

			describe.skip('profit and no funding', async () => {
				it('positive profit', async () => {
					assert.isTrue(false);
				});

				it('negative profit', async () => {
					assert.isTrue(false);
				});
			});

			describe.skip('funding and no profit', async () => {
				it('positive funding', async () => {
					assert.isTrue(false);
				});

				it('negative funding', async () => {
					assert.isTrue(false);
				});
			});

			describe.skip('funding and profit', async () => {
				it('positive sum', async () => {
					assert.isTrue(false);
				});

				it('negative sum', async () => {
					assert.isTrue(false);
				});
			});

			it.skip('Remaining margin is clamped to zero if losses exceed initial margin', async () => {
				assert.isTrue(false);
			});

			it('positionSummary reports invalid prices properly', async () => {
				assert.isFalse((await getPositionSummary(trader)).priceInvalid);
				await fastForward(7 * 24 * 60 * 60); // Stale the prices
				assert.isTrue((await getPositionSummary(trader)).priceInvalid);
			});
		});

		describe('Withdrawable margin', async () => {
			async function withdrawMaxAndValidate(account, msg) {
				let withdrawable = toBN(await withdrawableMargin(account));
				await transfer(withdrawable.neg(), account);
				withdrawable = await withdrawableMargin(account);
				assert.bnClose(withdrawable, toBN('0'), toUnit('1'));
				await assert.revert(transfer(toUnit('-1'), account), msg);
			}

			it('With no position, entire margin is withdrawable.', async () => {
				const margin = toUnit('1234.56789');
				await transfer(margin, trader3);
				assert.bnEqual(await withdrawableMargin(trader3), margin);
				await withdrawMaxAndValidate(trader3, revertMsg.InsufficientMargin);
			});

			it('With a tiny position, minimum margin requirement is enforced.', async () => {
				const margin = toUnit('1234.56789');
				const size = margin.div(toBN(10000));
				await transferAndTrade({
					account: trader3,
					fillPrice: toUnit('100'),
					marginDelta: margin,
					sizeDelta: size,
				});
				assert.bnClose(
					toBN(await withdrawableMargin(trader3)),
					margin.sub(minInitialMargin),
					toUnit('0.1')
				);
				await withdrawMaxAndValidate(trader3, revertMsg.InsufficientMargin);

				await transferAndTrade({
					account: trader2,
					fillPrice: toUnit('100'),
					marginDelta: margin,
					sizeDelta: size.neg(),
				});
				assert.bnClose(
					await withdrawableMargin(trader2),
					margin.sub(minInitialMargin),
					toUnit('0.1')
				);
				await withdrawMaxAndValidate(trader2, revertMsg.InsufficientMargin);
			});

			it('At max leverage, no margin is withdrawable.', async () => {
				await transferAndTrade({
					account: trader3,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1234'),
					sizeDelta: toUnit('123.4'),
				});
				assert.bnEqual(await withdrawableMargin(trader3), toUnit('0'));
				await withdrawMaxAndValidate(trader3, revertMsg.MaxLeverageExceeded);

				await transferAndTrade({
					account: trader2,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1234'),
					sizeDelta: toUnit('-123.4'),
				});
				assert.bnEqual(await withdrawableMargin(trader2), toUnit('0'));
				await withdrawMaxAndValidate(trader2, revertMsg.MaxLeverageExceeded);
			});

			it('At above max leverage, no margin is withdrawable.', async () => {
				await transferAndTrade({
					account: trader3,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1234'),
					sizeDelta: toUnit('12.34').mul(toBN('8')),
				});

				await setPrice(baseAsset, toUnit('90'));

				assert.bnGt((await getPositionSummary(trader3)).currentLeverage, maxLeverage);
				assert.bnEqual(await withdrawableMargin(trader3), toUnit('0'));
				await withdrawMaxAndValidate(trader3, revertMsg.MaxLeverageExceeded);

				await transferAndTrade({
					account: trader2,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1234'),
					sizeDelta: toUnit('-12.34').mul(toBN('8')),
					leverage: toUnit('-8'),
				});

				await setPrice(baseAsset, toUnit('110'));

				assert.bnGt(toBN((await getPositionSummary(trader2)).currentLeverage).neg(), maxLeverage);
				assert.bnEqual(await withdrawableMargin(trader2), toUnit('0'));
				await withdrawMaxAndValidate(trader2, revertMsg.MaxLeverageExceeded);
			});

			it('If a position is subject to liquidation, no margin is withdrawable.', async () => {
				// long
				await transferAndTrade({
					account: trader3,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1234'),
					sizeDelta: toUnit('12.34').mul(toBN('8')),
				});

				// 88 does not go into negative margin, but only into liquidation margin
				// this is needed to check that liquidation margin check is triggered correctly
				await setPrice(baseAsset, toUnit('88'));
				assert.isTrue((await getPositionSummary(trader3)).canLiquidate);
				assert.bnEqual(await withdrawableMargin(trader3), toUnit('0'));
				// check and trigger old position liquidatable check
				await assert.revert(transfer(toUnit('-1'), trader3), revertMsg.CanLiquidate);

				// this price causes the position to go into negative margin
				await setPrice(baseAsset, toUnit('80'));
				assert.isTrue((await getPositionSummary(trader3)).canLiquidate);
				assert.bnEqual(await withdrawableMargin(trader3), toUnit('0'));
				await withdrawMaxAndValidate(trader3, revertMsg.CanLiquidate); // margin is negative

				// short
				await transferAndTrade({
					account: trader2,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1234'),
					sizeDelta: toUnit('12.34').mul(toBN('-8')),
				});

				await setPrice(baseAsset, toUnit('120'));
				assert.isTrue((await getPositionSummary(trader2)).canLiquidate);
				assert.bnEqual(await withdrawableMargin(trader2), toUnit('0'));
				await withdrawMaxAndValidate(trader2, revertMsg.CanLiquidate); // margin is negative
			});

			it('If remaining margin is below minimum initial margin, no margin is withdrawable.', async () => {
				const size = toUnit('10.5');
				await transferAndTrade({
					account: trader3,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('105'),
					sizeDelta: size,
				});

				// The price moves down, eating into the margin, but the leverage is reduced to acceptable levels
				let price = toUnit('95');
				await setPrice(baseAsset, price);
				let remaining = toBN((await getPositionSummary(trader3)).remainingMargin);
				const sizeFor9x = divideDecimal(remaining.mul(toBN('9')), price);
				await trade(sizeFor9x.sub(size), trader3);

				assert.bnEqual(await withdrawableMargin(trader3), toUnit('0'));

				price = toUnit('100');
				await setPrice(baseAsset, price);
				remaining = toBN((await getPositionSummary(trader3)).remainingMargin);
				const sizeForNeg10x = divideDecimal(remaining.mul(toBN('-10')), price);

				await transferAndTrade({
					account: trader3,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('105'),
					sizeDelta: sizeForNeg10x.sub(sizeFor9x),
				});

				// The price moves up, eating into the margin, but the leverage is reduced to acceptable levels
				price = toUnit('111');
				await setPrice(baseAsset, price);
				remaining = toBN((await getPositionSummary(trader3)).remainingMargin);
				const sizeForNeg9x = divideDecimal(remaining.mul(toBN('-9')), price);
				await trade(sizeForNeg10x.sub(sizeForNeg9x), trader3);

				assert.bnEqual(await withdrawableMargin(trader3), toUnit('0'));
				await withdrawMaxAndValidate(trader3, revertMsg.InsufficientMargin);
			});

			it('With a fraction of max leverage position, a complementary fraction of margin is withdrawable', async () => {
				await transferAndTrade({
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('50'),
				});
				await transferAndTrade({
					account: trader2,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('-20'),
				});

				// Give fairly wide bands to account for fees
				assert.bnClose(await withdrawableMargin(trader), toUnit('500'), toUnit('20'));
				await withdrawMaxAndValidate(trader, revertMsg.MaxLeverageExceeded);
				assert.bnClose(await withdrawableMargin(trader2), toUnit('800'), toUnit('7'));
				await withdrawMaxAndValidate(trader2, revertMsg.MaxLeverageExceeded);
			});

			it('After some profit, more margin becomes withdrawable', async () => {
				await transferAndTrade({
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('100'),
				});
				await transferAndTrade({
					account: trader2,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('-50'),
				});

				// No margin is withdrawable at max leverage
				assert.bnEqual(await withdrawableMargin(trader), toUnit('0'));

				// The more conservative trader has about half margin withdrawable
				assert.bnClose(toBN(await withdrawableMargin(trader2)), toUnit('500'), toUnit('16'));

				// Price goes up 10%
				await setPrice(baseAsset, toUnit('110'));

				// At 10x, the trader makes 100% on their margin
				assert.bnClose(
					await withdrawableMargin(trader),
					toUnit('1000').sub(minInitialMargin),
					toUnit('40')
				);
				await withdrawMaxAndValidate(trader, revertMsg.MaxLeverageExceeded);

				// Price goes down 10% relative to the original price
				await setPrice(baseAsset, toUnit('90'));

				// The 5x short trader makes 50% on their margin
				assert.bnClose(
					await withdrawableMargin(trader2),
					toUnit('1000'), // no deduction of min initial margin because the trader would still be above the min at max leverage
					toUnit('50')
				);
				await withdrawMaxAndValidate(trader2, revertMsg.MaxLeverageExceeded);
			});

			it('After a loss, less margin is withdrawable', async () => {
				await transferAndTrade({
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('20'),
				});
				await transferAndTrade({
					account: trader2,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('-50'),
				});

				// The more conservative trader has about 80% margin withdrawable
				assert.bnClose(await withdrawableMargin(trader), toUnit('800'), toUnit('10'));

				// The other, about 50% margin withdrawable
				assert.bnClose(await withdrawableMargin(trader2), toUnit('500'), toUnit('16'));

				// Price goes falls 10%
				await setPrice(baseAsset, toUnit('90'));

				// At 2x, the trader loses 20% of their margin
				assert.bnClose(await withdrawableMargin(trader), toUnit('600'), toUnit('40'));
				await withdrawMaxAndValidate(trader, revertMsg.MaxLeverageExceeded);

				// Price goes up 5% relative to the original price
				await setPrice(baseAsset, toUnit('105'));

				// The 5x short trader loses 25% of their margin
				assert.bnClose(await withdrawableMargin(trader2), toUnit('250'), toUnit('50'));
				await withdrawMaxAndValidate(trader2, revertMsg.MaxLeverageExceeded);
			});

			it('Larger position', async () => {
				await transferAndTrade({
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('10000'),
					sizeDelta: toUnit('1000'),
				});

				// No margin is withdrawable at max leverage
				assert.bnEqual(await withdrawableMargin(trader), toUnit('0'));

				// Price goes up 10%
				await setPrice(baseAsset, toUnit('110'));

				// At 10x, the trader makes 100% on their margin
				assert.bnClose(
					await withdrawableMargin(trader),
					toUnit('10000')
						.sub(minInitialMargin)
						.sub(toUnit('1200')),
					toUnit('10')
				);
				await withdrawMaxAndValidate(trader, revertMsg.MaxLeverageExceeded);
			});

			it('withdrawable margin function properly reports invalid price', async () => {
				assert.isFalse((await getPositionSummary(trader)).priceInvalid);
				await fastForward(7 * 24 * 60 * 60);
				assert.isTrue((await getPositionSummary(trader)).priceInvalid);
			});

			describe('withdrawMaxMargin', () => {
				it('Reverts if the price is invalid', async () => {
					await transfer(toUnit('1000'), trader);
					await fastForward(7 * 24 * 60 * 60);
					await assert.revert(withdraw(trader), revertMsg.InvalidPrice);
				});

				it('Reverts if the system is suspended', async () => {
					await transfer(toUnit('1000'), trader);

					// suspend
					await systemStatus.suspendSystem('3', { from: owner });
					// should revert
					await assert.revert(withdraw(trader), 'Synthetix is suspended');

					// resume
					await systemStatus.resumeSystem({ from: owner });
					// should work now
					await withdraw(trader);
					assert.bnClose(await withdrawableMargin(trader), toBN('0'), toUnit('0.1'));
				});

				it('allows users to withdraw all their margin', async () => {
					await transfer(toUnit('1000'), trader);
					await transfer(toUnit('3000'), trader2);
					await transfer(toUnit('10000'), trader3);

					await setPrice(baseAsset, toUnit('10'));

					await trade(toUnit('500'), trader);
					await trade(toUnit('-1100'), trader2);
					await trade(toUnit('9000'), trader3);

					assert.bnGt(await withdrawableMargin(trader), toBN('0'));
					assert.bnGt(await withdrawableMargin(trader2), toBN('0'));
					assert.bnGt(await withdrawableMargin(trader3), toBN('0'));

					await withdraw(trader);

					await setPrice(baseAsset, toUnit('11.4847'));

					await withdraw(trader);
					await withdraw(trader2);
					await withdraw(trader3);

					assert.bnClose(await withdrawableMargin(trader), toBN('0'), toUnit('0.1'));
					assert.bnClose(await withdrawableMargin(trader2), toBN('0'), toUnit('0.1'));
					assert.bnClose(await withdrawableMargin(trader3), toBN('0'), toUnit('0.1'));
				});

				it('Does nothing with an empty margin', async () => {
					let margin = (await getPositionSummary(trader)).remainingMargin;
					assert.bnEqual(margin, toBN('0'));
					await withdraw(trader);
					margin = (await getPositionSummary(trader)).remainingMargin;
					assert.bnEqual(margin, toBN('0'));
				});

				it('Withdraws everything with no position', async () => {
					await transfer(toUnit('1000'), trader);

					let margin = (await getPositionSummary(trader)).remainingMargin;
					assert.bnEqual(margin, toUnit('1000'));

					await withdraw(trader);
					margin = (await getPositionSummary(trader)).remainingMargin;
					assert.bnEqual(margin, toBN('0'));
				});

				it('Profit allows more to be withdrawn', async () => {
					await transfer(toUnit('1239.2487'), trader);

					await setPrice(baseAsset, toUnit('15.53'));
					await trade(toUnit('-322'), trader);

					await withdraw(trader);
					assert.bnClose(await withdrawableMargin(trader), toBN('0'), toUnit('0.1'));
					await setPrice(baseAsset, toUnit('1.777'));
					assert.bnGt(await withdrawableMargin(trader), toBN('0'));

					await withdraw(trader);
					assert.bnClose(await withdrawableMargin(trader), toBN('0'), toUnit('0.1'));
				});
			});
		});

		describe('Leverage', async () => {
			it('current leverage', async () => {
				let price = toUnit(100);

				await setPrice(baseAsset, price);
				await transfer(toUnit('1000'), trader);
				await trade(toUnit('50'), trader); // 5x
				await transfer(toUnit('1000'), trader2);
				await trade(toUnit('-100'), trader2); // -10x

				const fee1 = multiplyDecimal(toUnit('5000'), baseFee);
				const fee2 = multiplyDecimal(toUnit('10000'), baseFee);

				const lev = (notional, margin, fee) => divideDecimal(notional, margin.sub(fee));

				// With no price motion and no funding rate, leverage should be unchanged.
				assert.bnClose(
					(await getPositionSummary(trader)).currentLeverage,
					lev(toUnit('5000'), toUnit('1000'), fee1),
					toUnit(0.1)
				);
				assert.bnClose(
					(await getPositionSummary(trader2)).currentLeverage,
					lev(toUnit('-10000'), toUnit('1000'), fee2),
					toUnit(0.1)
				);

				price = toUnit(105);
				await setPrice(baseAsset, price);

				// Price moves to 105:
				// long notional value 5000 -> 5250; long remaining margin 1000 -> 1250; leverage 5 -> 4.2
				// short notional value -10000 -> -10500; short remaining margin 1000 -> 500; leverage 10 -> 21;
				assert.bnClose(
					(await getPositionSummary(trader)).currentLeverage,
					lev(toUnit('5250'), toUnit('1250'), fee1),
					toUnit(0.1)
				);
				assert.bnClose(
					(await getPositionSummary(trader2)).currentLeverage,
					lev(toUnit('-10500'), toUnit('500'), fee2),
					toUnit(0.1)
				);
			});

			it('current leverage can be less than 1', async () => {
				await transferAndTrade({
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('5'),
				});

				assert.bnEqual((await getPosition(trader)).size, toUnit('5'));
				assert.bnClose(
					(await getPositionSummary(trader)).currentLeverage,
					toUnit(0.5),
					toUnit(0.001)
				);

				// The response of leverage to price with leverage < 1 is opposite to leverage > 1
				// When leverage is fractional, increasing the price increases leverage
				await setPrice(baseAsset, toUnit('300'));
				assert.bnClose(
					(await getPositionSummary(trader)).currentLeverage,
					toUnit(0.75),
					toUnit(0.001)
				);
				// ...while decreasing the price deleverages the position.
				await setPrice(baseAsset, toUnit('100').div(toBN(3)));
				assert.bnClose(
					(await getPositionSummary(trader)).currentLeverage,
					toUnit(0.25),
					toUnit(0.001)
				);
			});

			it('current leverage: no position', async () => {
				const currentLeverage = (await getPositionSummary(trader)).currentLeverage;
				assert.bnEqual(currentLeverage, toBN('0'));
			});
		});
	});

	describe('Funding', () => {
		it('An empty market induces zero funding rate', async () => {
			assert.bnEqual((await marketSummary()).currentFundingRate, toUnit(0));
		});

		it('A balanced market induces zero funding rate', async () => {
			for (const traderDetails of [
				['100', trader],
				['-100', trader2],
			]) {
				await transferAndTrade({
					account: traderDetails[1],
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit(traderDetails[0]),
				});
			}
			assert.bnEqual((await marketSummary()).currentFundingRate, toUnit(0));
		});

		it('A balanced market (with differing leverage) induces zero funding rate', async () => {
			for (const traderDetails of [
				['1000', '50', trader],
				['2000', '-50', trader2],
			]) {
				await transferAndTrade({
					account: traderDetails[2],
					fillPrice: toUnit('100'),
					marginDelta: toUnit(traderDetails[0]),
					sizeDelta: toUnit(traderDetails[1]),
				});
			}
			assert.bnEqual((await marketSummary()).currentFundingRate, toUnit(0));
		});

		it('Various skew rates', async () => {
			// Market is balanced
			assert.bnEqual((await marketSummary()).currentFundingRate, toUnit(0));

			const price = toUnit(250);

			await transferAndTrade({
				account: trader,
				fillPrice: price,
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('12'),
			});

			await transferAndTrade({
				account: trader2,
				fillPrice: price,
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('-12'),
			});

			assert.bnEqual((await marketSummary()).currentFundingRate, toUnit(0));

			const minScale = divideDecimal(
				(await perpsManager.marketConfig(marketKey)).skewScaleUSD,
				price
			);
			// Market is 24 units long skewed (24 / 100000)
			await trade(toUnit('24'), trader);
			let marketSkew = (await marketSummary()).marketSkew;
			assert.bnEqual(
				(await marketSummary()).currentFundingRate,
				multiplyDecimal(divideDecimal(marketSkew, minScale), maxFundingRate.neg())
			);

			// 50% the other way ()
			await trade(toUnit('-32'), trader);
			marketSkew = (await marketSummary()).marketSkew;
			assert.bnClose(
				(await marketSummary()).currentFundingRate,
				multiplyDecimal(divideDecimal(marketSkew, minScale), maxFundingRate.neg())
			);

			// Market is 100% skewed
			await close(trader);
			marketSkew = (await marketSummary()).marketSkew;
			assert.bnClose(
				(await marketSummary()).currentFundingRate,
				multiplyDecimal(divideDecimal(marketSkew, minScale), maxFundingRate.neg())
			);

			// 100% the other way
			await trade(toUnit('4'), trader);
			await close(trader2);
			marketSkew = (await marketSummary()).marketSkew;
			assert.bnClose(
				(await marketSummary()).currentFundingRate,
				multiplyDecimal(divideDecimal(marketSkew, minScale), maxFundingRate.neg())
			);
		});

		it('Altering the max funding has a proportional effect', async () => {
			// 0, +-50%, +-100%
			assert.bnEqual((await marketSummary()).currentFundingRate, toUnit(0));

			await transferAndTrade({
				account: trader,
				fillPrice: toUnit('250'),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('12'),
			});

			await transferAndTrade({
				account: trader2,
				fillPrice: toUnit('250'),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('-4'),
			});

			const expectedFunding = toUnit('-0.002'); // 8 * 250 / 100_000 skew * 0.1 max funding rate
			assert.bnEqual((await marketSummary()).currentFundingRate, expectedFunding);

			await perpsManager.setMaxFundingRate(marketKey, toUnit('0.2'), { from: owner });
			assert.bnEqual(
				(await marketSummary()).currentFundingRate,
				multiplyDecimal(expectedFunding, toUnit(2))
			);
			await perpsManager.setMaxFundingRate(marketKey, toUnit('0'), { from: owner });
			assert.bnEqual((await marketSummary()).currentFundingRate, toUnit('0'));
		});

		it('Altering the skewScaleUSD has a proportional effect', async () => {
			const initialPrice = 100;
			const price = 250;
			await transferAndTrade({
				account: trader,
				fillPrice: toUnit(price),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('-12'),
			});

			await transferAndTrade({
				account: trader2,
				fillPrice: toUnit(price),
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('4'),
			});

			const expectedFunding = toUnit('0.002'); // 8 * 250 / 100_000 skew * 0.1 max funding rate
			assert.bnEqual((await marketSummary()).currentFundingRate, expectedFunding);

			await perpsManager.setSkewScaleUSD(marketKey, toUnit(500 * initialPrice), {
				from: owner,
			});
			assert.bnEqual(
				(await marketSummary()).currentFundingRate,
				multiplyDecimal(expectedFunding, toUnit('2'))
			);

			await perpsManager.setSkewScaleUSD(marketKey, toUnit(250 * initialPrice), {
				from: owner,
			});
			assert.bnEqual(
				(await marketSummary()).currentFundingRate,
				multiplyDecimal(expectedFunding, toUnit('4'))
			);

			await perpsManager.setSkewScaleUSD(marketKey, toUnit(2000 * initialPrice), {
				from: owner,
			});
			assert.bnEqual(
				(await marketSummary()).currentFundingRate,
				multiplyDecimal(expectedFunding, toUnit('0.5'))
			);

			// skewScaleUSD is below market size
			await perpsManager.setSkewScaleUSD(marketKey, toUnit(4 * price), { from: owner });
			assert.bnEqual((await marketSummary()).currentFundingRate, toUnit('0.1')); // max funding rate
		});

		for (const leverage of ['1', '-1'].map(toUnit)) {
			const side = parseInt(leverage.toString()) > 0 ? 'long' : 'short';

			describe(`${side}`, () => {
				beforeEach(async () => {
					await perpsManager.setMaxSingleSideValueUSD(marketKey, toUnit('100000'), {
						from: owner,
					});
				});
				it('100% skew induces maximum funding rate', async () => {
					await transferAndTrade({
						account: trader,
						fillPrice: toUnit('1'),
						marginDelta: toUnit('1000000'),
						sizeDelta: divideDecimal(multiplyDecimal(leverage, toUnit('1000000')), toUnit('10')),
					});

					const expected = side === 'long' ? -maxFundingRate : maxFundingRate;

					assert.bnEqual((await marketSummary()).currentFundingRate, expected);
				});

				it('Different skew rates induce proportional funding levels', async () => {
					// skewScaleUSD is below actual skew
					const skewScaleUSD = toUnit(100 * 100);
					await perpsManager.setSkewScaleUSD(marketKey, skewScaleUSD, { from: owner });

					const traderPos = leverage.mul(toBN('10'));
					await transferAndTrade({
						account: trader,
						fillPrice: toUnit('100'),
						marginDelta: toUnit('1000'),
						sizeDelta: traderPos,
					});
					await transfer(toUnit('1000'), trader2);

					const points = 5;

					await setPrice(baseAsset, toUnit('100'));

					for (const maxFR of ['0.1', '0.2', '0.05'].map(toUnit)) {
						await perpsManager.setMaxFundingRate(marketKey, maxFR, { from: owner });

						for (let i = points; i >= 0; i--) {
							// now lerp from leverage*k to leverage
							const frac = leverage.mul(toBN(i)).div(toBN(points));
							const oppLev = frac.neg();
							const size = oppLev.mul(toBN('10'));
							if (size.abs().gt(toBN('0'))) {
								await trade(size, trader2);
							}

							const skewUSD = multiplyDecimal(traderPos.add(size), toUnit('100'));
							let expected = maxFR
								.mul(skewUSD)
								.div(skewScaleUSD)
								.neg();

							if (expected.gt(maxFR)) {
								expected = maxFR;
							}

							assert.bnClose((await marketSummary()).currentFundingRate, expected, toUnit('0.01'));

							if (size.abs().gt(toBN(0))) {
								await close(trader2);
							}
						}
					}
				});
			});
		}

		it('Funding can be paused when market is paused', async () => {
			assert.bnEqual((await marketSummary()).currentFundingRate, toUnit(0));

			const price = toUnit('250');
			await transferAndTrade({
				account: trader,
				fillPrice: price,
				marginDelta: toUnit('1000'),
				sizeDelta: toUnit('12'),
			});

			const fundingRate = toUnit('-0.003'); // 12 * 250 / 100_000 skew * 0.1 max funding rate
			assert.bnEqual((await marketSummary()).currentFundingRate, fundingRate);

			// 1 day
			await fastForward(24 * 60 * 60);
			await setPrice(baseAsset, price);

			// pause the market
			await systemStatus.suspendFuturesMarket(marketKey, '0', { from: owner });
			// set funding rate to 0
			await perpsManager.setMaxFundingRate(marketKey, toUnit('0'), { from: owner });

			// check accrued
			const accrued = toBN((await getPositionSummary(trader)).accruedFunding);
			assert.bnClose(accrued, fundingRate.mul(toBN(250 * 12)), toUnit('0.01'));

			// 2 days of pause
			await fastForward(2 * 24 * 60 * 60);
			await setPrice(baseAsset, price);

			// check no funding accrued
			assert.bnEqual((await getPositionSummary(trader)).accruedFunding, accrued);

			// set funding rate to 0.1 again
			await perpsManager.setMaxFundingRate(marketKey, toUnit('0.1'), { from: owner });
			// resume
			await systemStatus.resumeFuturesMarket(marketKey, { from: owner });

			// 1 day
			await fastForward(24 * 60 * 60);
			await setPrice(baseAsset, price);

			// check more funding accrued
			assert.bnGt(toBN((await getPositionSummary(trader)).accruedFunding).abs(), accrued.abs());
		});

		it('0 price reverts in proportional skew when there is non zero skew', async () => {
			await transferAndTrade({
				account: trader,
				fillPrice: toUnit(100),
				sizeDelta: toUnit(1),
				marginDelta: toUnit(1000),
			});
			await setPrice(baseAsset, toUnit('0'));
			await assert.revert(instance.proportionalSkew(marketKey), "Price can't be zero");
		});

		describe('last funding entry', () => {
			const price = toUnit('100');
			beforeEach(async () => {
				// Set up some market skew so that funding is being incurred.
				// Proportional Skew = 0.5, so funding rate is 0.05 per day.
				await transferAndTrade({
					account: trader,
					fillPrice: price,
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('90'),
				});

				await transferAndTrade({
					account: trader2,
					fillPrice: price,
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('-30'),
				});
			});

			it.skip('Funding entry is recomputed by order submission', async () => {
				assert.isTrue(false);
			});

			it.skip('Funding entry is recomputed by order confirmation', async () => {
				assert.isTrue(false);
			});

			it.skip('Funding entry is recomputed by order cancellation', async () => {
				assert.isTrue(false);
			});

			it.skip('Funding entry is recomputed by position closure', async () => {
				assert.isTrue(false);
			});

			it.skip('Funding entry is recomputed by liquidation', async () => {
				assert.isTrue(false);
			});

			it.skip('Funding entry is recomputed by margin transfers', async () => {
				assert.isTrue(false);
			});

			it('Funding entry is recomputed by setting funding rate parameters', async () => {
				// no skewScaleUSD
				await perpsManager.setSkewScaleUSD(marketKey, toUnit('10000'), { from: owner });

				await fastForward(24 * 60 * 60);
				await setPrice(baseAsset, toUnit('100'));
				assert.bnClose((await marketSummary()).unrecordedFunding, toUnit('-6'), toUnit('0.01'));

				await perpsManager.setMaxFundingRate(marketKey, toUnit('0.2'), { from: owner });
				const time = await currentTime();

				const lastFundingEntry = await perpsStorage.lastFundingEntry(marketKey);
				assert.bnEqual(lastFundingEntry.timestamp, time);
				assert.bnClose(lastFundingEntry.funding, toUnit('-6'), toUnit('0.01'));
				assert.bnClose((await marketSummary()).unrecordedFunding, toUnit('0'), toUnit('0.01'));

				await fastForward(24 * 60 * 60);
				await setPrice(baseAsset, toUnit('200'));
				assert.bnClose((await marketSummary()).unrecordedFunding, toUnit('-40'), toUnit('0.01'));

				await fastForward(24 * 60 * 60);
				await setPrice(baseAsset, toUnit('300'));
				assert.bnClose((await marketSummary()).unrecordedFunding, toUnit('-120'), toUnit('0.01'));
			});
		});

		it.skip('A zero-size position accrues no funding', async () => {
			assert.isTrue(false);
		});
	});

	describe('Market Debt', () => {
		it('Basic debt movements', async () => {
			assert.bnEqual(
				(await perpsStorage.marketScalars(marketKey)).entryDebtCorrection,
				toUnit('0')
			);
			assert.bnEqual((await marketSummary()).marketDebt, toUnit('0'));

			await setPrice(baseAsset, toUnit('100'));
			await transfer(toUnit('1000'), trader); // Debt correction: +1000
			const fee1 = (await instance.orderFee(marketKey, toUnit('50'), defaultExecOptions)).fee;
			await trade(toUnit('50'), trader); // Debt correction: -5000 - fee1

			assert.bnEqual(
				(await perpsStorage.marketScalars(marketKey)).entryDebtCorrection,
				toUnit('-4000').sub(fee1)
			);
			assert.bnEqual((await marketSummary()).marketDebt, toUnit('1000').sub(fee1));

			await setPrice(baseAsset, toUnit('120'));
			await transfer(toUnit('600'), trader2); // Debt correction: +600
			const fee2 = (await instance.orderFee(marketKey, toUnit('-35'), defaultExecOptions)).fee;
			await trade(toUnit('-35'), trader2); // Debt correction: +4200 - fee2

			assert.bnClose(
				(await perpsStorage.marketScalars(marketKey)).entryDebtCorrection,
				toUnit('800')
					.sub(fee1)
					.sub(fee2),
				toUnit('0.1')
			);

			// 1600 margin, plus 1000 profit by trader1
			assert.bnClose(
				(await marketSummary()).marketDebt,
				toUnit('2600')
					.sub(fee1)
					.sub(fee2),
				toUnit('0.1')
			);

			await closeAndWithdraw({
				account: trader,
				fillPrice: toUnit('110'),
			});

			assert.bnClose(
				(await perpsStorage.marketScalars(marketKey)).entryDebtCorrection,
				toUnit('4800'),
				toUnit('13')
			);
			assert.bnClose((await marketSummary()).marketDebt, toUnit('950'), toUnit('13'));

			await closeAndWithdraw({
				account: trader2,
				fillPrice: toUnit('100'),
			});

			assert.bnEqual(
				(await perpsStorage.marketScalars(marketKey)).entryDebtCorrection,
				toUnit('0')
			);
			assert.bnEqual((await marketSummary()).marketDebt, toUnit('0'));
		});

		it.skip('Market debt is the sum of remaining margins', async () => {
			assert.isTrue(false);
		});

		it.skip('Liquidations accurately update market debt and overall system debt', async () => {
			assert.isTrue(false);
		});

		describe('market debt incorporates funding flow', async () => {
			it.skip('funding profits increase debt', async () => {
				assert.isTrue(false);
			});

			it.skip('funding losses decrease debt', async () => {
				assert.isTrue(false);
			});
		});

		describe('market debt incorporates profits', async () => {
			it.skip('profits increase debt', async () => {
				assert.isTrue(false);
			});

			it.skip('losses decrease debt', async () => {
				assert.isTrue(false);
			});
		});

		it.skip('After many trades and liquidations, the market debt is still the sum of remaining margins', async () => {
			assert.isTrue(false);
		});

		it.skip('Enough pending liquidation value can cause market debt to fall to zero, corrected by liquidating', async () => {
			assert.isTrue(false);
		});

		it('Market price is reported as invalid when price is stale', async () => {
			assert.isFalse((await marketSummary()).priceInvalid);
			assert.isFalse((await assetPrice()).invalid);
			await fastForward(7 * 24 * 60 * 60);
			assert.isTrue((await marketSummary()).priceInvalid);
			assert.isTrue((await assetPrice()).invalid);
		});

		describe('Market debt is accurately reflected in total system debt', () => {
			it('Margin transfers do not alter total system debt', async () => {
				const debt = (await debtCache.currentDebt())[0];
				await transfer(toUnit('1000'), trader);
				assert.bnEqual((await debtCache.currentDebt())[0], debt);
				await transfer(toUnit('-500'), trader);
				assert.bnEqual((await debtCache.currentDebt())[0], debt);
			});

			it('Prices altering market debt are reflected in total system debt', async () => {
				await transferAndTrade({
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('100'),
				});

				await transferAndTrade({
					account: trader2,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('-50'),
				});

				// Price move of $5 upwards should produce long profit of $500,
				// Short losses of -$250. The debt should increase overall by $250.
				const debt = (await debtCache.currentDebt())[0];
				await setPrice(baseAsset, toUnit('105'));
				assert.bnClose((await debtCache.currentDebt())[0], debt.add(toUnit('250')), toUnit('0.01'));
				// Negate the signs for a downwards price movement.
				await setPrice(baseAsset, toUnit('95'));
				assert.bnClose((await debtCache.currentDebt())[0], debt.sub(toUnit('250')), toUnit('0.01'));
			});
		});
	});

	describe('Liquidations', () => {
		describe('Liquidation price', () => {
			it('Liquidation price is accurate without funding', async () => {
				await setPrice(baseAsset, toUnit('100'));
				await transfer(toUnit('1000'), trader);
				await trade(toUnit('100'), trader);
				await transfer(toUnit('1000'), trader2);
				await trade(toUnit('-100'), trader2);

				let summary = await getPositionSummary(trader);

				// fee = 100 * 100 * 0.003 = 30
				// liqMargin = max(20, 100*100*0.0035) + 100*100*0.0025 = 60
				// liqPrice = 100 + (60 − (1000 - 30))÷100 = 90.9
				assert.bnClose(summary.approxLiquidationPrice, toUnit('90.9'), toUnit('0.001'));
				assert.isFalse(summary.priceInvalid);

				summary = await getPositionSummary(trader2);

				// fee = 100 * 100 * 0.003 = 30
				// liqMargin = max(20, 100*100*0.0035) + 100*100*0.0025 = 60
				// liqPrice = 100 + (60 − (1000 - 30))÷(-100) = 109.1
				assert.bnEqual(summary.approxLiquidationPrice, toUnit('109.1'));
				assert.isFalse(summary.priceInvalid);
			});

			it('Liquidation price is accurate if the liquidation margin changes', async () => {
				await setPrice(baseAsset, toUnit('250'));
				await transfer(toUnit('1000'), trader);
				await trade(toUnit('20'), trader);
				await transfer(toUnit('1000'), trader2);
				await trade(toUnit('-20'), trader2);

				// fee = 250 * 20 * 0.003 = 15
				// liqMargin = max(20, 250 * 20 *0.0035) + 250 * 20*0.0025 = 20 + 12.5 = 32.5
				// liqPrice = 250 + (32.5 − (1000 - 15))÷(20) = 202.375
				assert.bnClose(
					(await getPositionSummary(trader)).approxLiquidationPrice,
					toUnit(202.375),
					toUnit('0.001')
				);
				// fee = 250 * 20 * 0.003 = 15
				// liqPrice = 250 + (32.5 − (1000 - 15))÷(-20) = 297.625
				assert.bnClose(
					(await getPositionSummary(trader2)).approxLiquidationPrice,
					toUnit(297.625),
					toUnit('0.001')
				);

				await perpsManager.setMinKeeperFee(toUnit('100'), { from: owner });

				// liqMargin = max(100, 250 * 20 *0.0035) + 250 * 20*0.0025 = 100 + 12.5 = 112.5
				// liqPrice = 250 + (112.5 − (1000 - 15))÷(20) = 206.375
				assert.bnClose(
					(await getPositionSummary(trader)).approxLiquidationPrice,
					toUnit(206.375),
					toUnit('0.001')
				);
				// liqPrice = 250 + (112.5 − (1000 - 15))÷(-20) = 293.625
				assert.bnClose(
					(await getPositionSummary(trader2)).approxLiquidationPrice,
					toUnit(293.625),
					toUnit('0.001')
				);

				await perpsManager.setLiquidationFeeRatio(toUnit('0.03'), { from: owner });
				// liqMargin = max(100, 250 * 20 *0.03) + 250 * 20*0.0025 = 150 + 12.5 = 162.5
				// liqPrice = 250 + (162.5 − (1000 - 15))÷(20) = 208.875
				assert.bnClose(
					(await getPositionSummary(trader)).approxLiquidationPrice,
					toUnit(208.875),
					toUnit('0.001')
				);
				// liqPrice = 250 + (162.5 − (1000 - 15))÷(-20) = 291.125
				assert.bnClose(
					(await getPositionSummary(trader2)).approxLiquidationPrice,
					toUnit(291.125),
					toUnit('0.001')
				);

				await perpsManager.setLiquidationBufferRatio(toUnit('0.03'), { from: owner });
				// liqMargin = max(100, 250 * 20 *0.03) + 250 * 20*0.0025 = 150 + 150 = 300
				// liqPrice = 250 + (300 − (1000 - 15))÷(20) = 215.75
				assert.bnClose(
					(await getPositionSummary(trader)).approxLiquidationPrice,
					toUnit(215.75),
					toUnit('0.001')
				);
				// liqPrice = 250 + (300 − (1000 - 15))÷(-20) = 284.25
				assert.bnClose(
					(await getPositionSummary(trader2)).approxLiquidationPrice,
					toUnit(284.25),
					toUnit('0.001')
				);

				await perpsManager.setMinKeeperFee(toUnit('0'), { from: owner });
				await perpsManager.setLiquidationFeeRatio(toUnit('0'), { from: owner });
				await perpsManager.setLiquidationBufferRatio(toUnit('0'), { from: owner });

				assert.bnClose(
					(await getPositionSummary(trader)).approxLiquidationPrice,
					toUnit(200.75),
					toUnit('0.001')
				);
				assert.bnClose(
					(await getPositionSummary(trader2)).approxLiquidationPrice,
					toUnit(299.25),
					toUnit('0.001')
				);
			});

			it('Liquidation price is accurate with funding', async () => {
				await perpsManager.setSkewScaleUSD(marketKey, toUnit('10000'), { from: owner });

				await setPrice(baseAsset, toUnit('250'));
				// Submit orders that induce -0.05 funding rate
				await transfer(toUnit('1500'), trader);
				await trade(toUnit('30'), trader);
				await transfer(toUnit('500'), trader2);
				await trade(toUnit('-10'), trader2);

				// One day of funding
				await fastForward(24 * 60 * 60);

				// liqMargin = max(20, 250 * 30 *0.0035) + 250 * 30*0.0025 = 45
				// trader 1 pays 30 * -0.05 = -1.5 base units of funding = -375 $, and a $22.5 trading fee
				// liquidation price = pLast + (mLiq - m) / s + fPerUnit
				// liquidation price = 250 + (45 - (1500 - 22.5)) / 30 + 0.05 * 250 = 214.75
				const summary = await getPositionSummary(trader);
				assert.bnClose(summary.approxLiquidationPrice, toUnit(214.75), toUnit(0.001));

				// liqMargin = max(20, 250 * 10 *0.0035) + 250 * 10*0.0025 = 26.25
				// trader2 receives -10 * -0.05 = 0.5 base units of funding, and a $7.5 trading fee
				// liquidation price = 250 + (26.25 - (500 - 7.5)) / (-10) + 0.05 * 250 = 309.125
				assert.bnClose(
					(await getPositionSummary(trader2)).approxLiquidationPrice,
					toUnit(309.125),
					toUnit(0.001)
				);
			});

			it.skip('Liquidation price is accurate with funding with intervening funding entry updates', async () => {
				// TODO: confirm order -> a bunch of trades from other traders happen over a time period -> check the liquidation price given that most of the accrued funding is not unrecorded
				assert.isTrue(false);
			});

			it('No liquidation price on an empty position', async () => {
				assert.bnEqual((await getPositionSummary(noBalance)).approxLiquidationPrice, toUnit(0));
			});
		});

		describe('canLiquidate', () => {
			it('Can liquidate an underwater position', async () => {
				let price = toUnit('250');
				await setPrice(baseAsset, price);
				await transfer(toUnit('1000'), trader);
				await trade(toUnit('20'), trader);

				price = toBN((await getPositionSummary(trader)).approxLiquidationPrice);
				await setPrice(baseAsset, price.sub(toUnit(1)));
				// The reason the price is imprecise is that the previously queried
				// liquidation price was calculated using:
				// 1. unrecorded funding assuming the previous price (depends on price)
				// 2. liquidation margin assuming the previous price (depends on price)
				// When price is changed artificially this results in a slightly different
				// undercorded funding, and slightly different liquidation margin which causes the actual
				// liquidation price to be slightly different.
				// A precise calculation would be a) incorrect and b) cumbersome.
				// It would be incorrect because it would rely on other assumptions:
				// 	1) of unrecorded funding not being recorded until liquidation due to
				//	another tx in the market
				// 	2) time passing until liquidation being 0 seconds.
				// It would be cumbersome because it would need to account for the
				// non-linear relationship of liquidation margin and
				// price (due to using max() in it). It would also require breaking the interface of
				// of _liquidationMargin() because now _liquidationPrice() would need to know
				// exactly how margin is calculated in order to reverse the calculation
				// and solve for price.
				//
				// This is not too bad, because this imprecision only happens when
				// not used in transactions and when current price is far from the actual liquidation price.
				// In actual liquidation scenario and transaction the current price is also the
				// price which liquidationPrice() uses. So it's exactly correct.
				// So a keeper relying on canLiquidate or simulating the liquidation
				// tx would have the correct liquidation price, and canLiquidate result.
				assert.isTrue((await getPositionSummary(trader)).canLiquidate);
				await instance.liquidatePosition(marketKey, trader, liquidator);
			});

			it('Empty positions cannot be liquidated', async () => {
				assert.isFalse((await getPositionSummary(trader)).canLiquidate);
			});

			it('No liquidations while prices are invalid', async () => {
				await setPrice(baseAsset, toUnit('250'));
				await transfer(toUnit('1000'), trader);
				await trade(toUnit('20'), trader);

				await setPrice(baseAsset, toUnit('25'));
				assert.isTrue((await getPositionSummary(trader)).canLiquidate);
				await fastForward(60 * 60 * 24 * 7); // Stale the price
				assert.isTrue((await getPositionSummary(trader)).canLiquidate);
				assert.isTrue((await getPositionSummary(trader)).priceInvalid);
				await assert.revert(
					instance.liquidatePosition(marketKey, trader, liquidator),
					revertMsg.InvalidPrice
				);
			});
		});

		describe('liquidatePosition', () => {
			beforeEach(async () => {
				await setPrice(baseAsset, toUnit('250'));
				await transfer(toUnit('1000'), trader);
				await transfer(toUnit('1000'), trader2);
				await transfer(toUnit('1000'), trader3);
				await trade(toUnit('40'), trader);
				await trade(toUnit('20'), trader2);
				await trade(toUnit('-20'), trader3);
				// Exchange fees total 60 * 250 * 0.003 + 20 * 250 * 0.003 = 60
			});

			it('Cannot liquidate position that does not exist or not underwater', async () => {
				await assert.revert(
					instance.liquidatePosition(marketKey, noBalance, liquidator),
					revertMsg.CannotLiquidate
				);
				await assert.revert(
					instance.liquidatePosition(marketKey, trader, liquidator),
					revertMsg.CannotLiquidate
				);
			});

			it('Liquidation properly affects the overall market parameters (long case)', async () => {
				await perpsManager.setSkewScaleUSD(marketKey, toUnit('20000'), { from: owner });

				await fastForward(24 * 60 * 60); // wait one day to accrue a bit of funding

				const size = toBN((await marketSummary()).marketSize);
				const sizes = await instance.marketSizes(marketKey);
				const skew = toBN((await marketSummary()).marketSkew);
				const positionSize = toBN((await getPosition(trader)).size);

				assert.isFalse((await getPositionSummary(trader)).canLiquidate);
				assert.isFalse((await getPositionSummary(trader2)).canLiquidate);

				await setPrice(baseAsset, toUnit('200'));

				assert.isTrue((await getPositionSummary(trader)).canLiquidate);
				assert.isTrue((await getPositionSummary(trader2)).canLiquidate);

				// Note at this point the true market debt should be $2000 ($1000 profit for the short trader, and two liquidated longs)
				// However, the long positions are actually underwater and the negative contribution is not removed until liquidation
				assert.bnClose((await marketSummary()).marketDebt, toUnit('620'), toUnit('0.1'));
				assert.bnClose((await marketSummary()).unrecordedFunding, toUnit('-8'), toUnit('0.01'));

				await instance.liquidatePosition(marketKey, trader, liquidator);

				assert.bnEqual((await marketSummary()).marketSize, size.sub(positionSize.abs()));
				let newSizes = await instance.marketSizes(marketKey);
				assert.bnEqual(newSizes[0], sizes[0].sub(positionSize.abs()));
				assert.bnEqual(newSizes[1], sizes[1]);
				assert.bnEqual((await marketSummary()).marketSkew, skew.sub(positionSize.abs()));
				assert.bnClose(
					(await marketSummary()).marketDebt,
					toUnit('1990').sub(toUnit('20')),
					toUnit('0.01')
				);

				// Funding has been recorded by the liquidation.
				assert.bnClose((await marketSummary()).unrecordedFunding, toUnit(0), toUnit('0.01'));

				await instance.liquidatePosition(marketKey, trader2, liquidator);

				assert.bnEqual((await marketSummary()).marketSize, toUnit('20'));
				newSizes = await instance.marketSizes(marketKey);
				assert.bnEqual(newSizes[0], toUnit('0'));
				assert.bnEqual(newSizes[1], toUnit('20'));
				assert.bnEqual((await marketSummary()).marketSkew, toUnit('-20'));
				// Market debt is now just the remaining position, plus the funding they've made.
				assert.bnClose((await marketSummary()).marketDebt, toUnit('2145'), toUnit('0.01'));
			});

			it('Liquidation properly affects the overall market parameters (short case)', async () => {
				await perpsManager.setSkewScaleUSD(marketKey, toUnit('20000'), { from: owner });

				await fastForward(24 * 60 * 60); // wait one day to accrue a bit of funding

				const size = toBN((await marketSummary()).marketSize);
				const sizes = await instance.marketSizes(marketKey);
				const positionSize = toBN((await getPosition(trader3)).size);

				await setPrice(baseAsset, toUnit('350'));

				assert.bnClose((await marketSummary()).marketDebt, toUnit('5960'), toUnit('0.1'));
				assert.bnClose((await marketSummary()).unrecordedFunding, toUnit('-24.5'), toUnit('0.01'));

				await instance.liquidatePosition(marketKey, trader3, liquidator);

				assert.bnEqual((await marketSummary()).marketSize, size.sub(positionSize.abs()));
				const newSizes = await instance.marketSizes(marketKey);
				assert.bnEqual(newSizes[0], sizes[0]);
				assert.bnEqual(newSizes[1], toUnit(0));
				assert.bnEqual((await marketSummary()).marketSkew, toUnit('60'));
				assert.bnClose((await marketSummary()).marketDebt, toUnit('6485'), toUnit('0.1'));

				// Funding has been recorded by the liquidation.
				assert.bnClose((await marketSummary()).unrecordedFunding, toUnit(0), toUnit('0.01'));
			});

			it('Can liquidate a position with less than the liquidation fee margin remaining (long case)', async () => {
				// liqMargin = max(20, 250 * 40 * 0.0035) + 250 * 40*0.0025 = 60
				// fee 40*250*0.003 = 30
				// Remaining margin = 250 + (60 - (1000 - 30)) / (40)= 227.25
				assert.isFalse((await getPositionSummary(trader)).canLiquidate);
				const liqPrice = toBN((await getPositionSummary(trader)).approxLiquidationPrice);
				assert.bnClose(liqPrice, toUnit('227.25'), toUnit('0.01'));

				const newPrice = liqPrice.sub(toUnit(1));
				await setPrice(baseAsset, newPrice);

				const { size: positionSize, id: positionId } = await getPosition(trader);

				assert.isTrue((await getPositionSummary(trader)).canLiquidate);

				const remainingMargin = (await getPositionSummary(trader)).remainingMargin;
				const tx = await instance.liquidatePosition(marketKey, trader, liquidator);

				assert.isFalse((await getPositionSummary(trader)).canLiquidate);
				const pos = await getPosition(trader);
				assert.bnEqual(pos.id, 1);
				assert.bnEqual(await perpsStorage.positionIdToAccount(marketKey, 1), trader);
				assert.bnEqual(pos.margin, toUnit(0));
				assert.bnEqual(pos.size, toUnit(0));

				const liquidationFee = multiplyDecimal(
					multiplyDecimal(await perpsManager.liquidationFeeRatio(), newPrice),
					toUnit(40) // position size
				);
				assert.bnClose(await sUSD.balanceOf(liquidator), liquidationFee, toUnit('0.001'));

				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, instance] });

				assert.equal(decodedLogs.length, 4);

				decodedEventEqual({
					event: 'Issued',
					emittedFrom: sUSD.address,
					args: [liquidator, liquidationFee],
					log: decodedLogs[1],
					bnCloseVariance: toUnit('0.001'),
				});
				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: instance.address,
					args: [
						marketKey,
						positionId,
						trader,
						toBN('0'),
						toBN('0'),
						toBN('0'),
						(await assetPrice()).price,
						toBN('0'),
					],
					log: decodedLogs[2],
				});
				decodedEventEqual({
					event: 'PositionLiquidated',
					emittedFrom: instance.address,
					args: [marketKey, trader, liquidator, positionSize, newPrice, liquidationFee],
					log: decodedLogs[3],
					bnCloseVariance: toUnit('0.001'),
				});

				assert.bnLt(remainingMargin, liquidationFee);
			});

			it('liquidations of positive margin position pays to fee pool, long case', async () => {
				// liqMargin = max(20, 250 * 40 * 0.0035) + 250 * 40*0.0025 = 60
				// fee 40*250*0.003 = 30
				// Remaining margin = 250 + (60 - (1000 - 30)) / (40)= 227.25
				const liqPrice = toBN((await getPositionSummary(trader)).approxLiquidationPrice);
				assert.bnClose(liqPrice, toUnit('227.25'), toUnit('0.01'));

				const newPrice = liqPrice.sub(toUnit(0.5));
				await setPrice(baseAsset, newPrice);
				assert.isTrue((await getPositionSummary(trader)).canLiquidate);

				const remainingMargin = toBN((await getPositionSummary(trader)).remainingMargin);
				const tx = await instance.liquidatePosition(marketKey, trader, liquidator);

				const liquidationFee = multiplyDecimal(
					multiplyDecimal(await perpsManager.liquidationFeeRatio(), newPrice),
					toUnit(40) // position size
				);
				assert.bnClose(await sUSD.balanceOf(liquidator), liquidationFee, toUnit('0.001'));

				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, instance] });

				assert.equal(decodedLogs.length, 5); // additional sUSD issue event

				const poolFee = remainingMargin.sub(liquidationFee);
				// the price needs to be set in a way that leaves positive margin after fee
				assert.isTrue(poolFee.gt(toBN(0)));

				decodedEventEqual({
					event: 'Issued',
					emittedFrom: sUSD.address,
					args: [await feePool.FEE_ADDRESS(), poolFee],
					log: decodedLogs[2],
					bnCloseVariance: toUnit('0.001'),
				});
			});

			it('Can liquidate a position with less than the liquidation fee margin remaining (short case)', async () => {
				// liqMargin = max(20, 250 * 20 * 0.0035) + 250 * 20*0.0025 = 32.5
				// fee 20*250*0.003 = 15
				// Remaining margin = 250 + (32.5 - (1000 - 15)) / (-20)= 297.625
				const liqPrice = toBN((await getPositionSummary(trader3)).approxLiquidationPrice);
				assert.bnClose(liqPrice, toUnit(297.625), toUnit('0.01'));

				const newPrice = liqPrice.add(toUnit(1));

				await setPrice(baseAsset, newPrice);

				const { size: positionSize, id: positionId } = await getPosition(trader3);

				const remainingMargin = (await getPositionSummary(trader3)).remainingMargin;
				const tx = await instance.liquidatePosition(marketKey, trader3, liquidator);

				const pos = await getPosition(trader3);
				assert.bnEqual(pos.id, 3);
				assert.bnEqual(await perpsStorage.positionIdToAccount(marketKey, 3), trader3);
				assert.bnEqual(pos.margin, toUnit(0));
				assert.bnEqual(pos.size, toUnit(0));

				// in this case, proportional fee is smaller than minimum fee
				const liquidationFee = multiplyDecimal(
					multiplyDecimal(await perpsManager.liquidationFeeRatio(), newPrice),
					toUnit(20) // position size
				);
				assert.bnClose(await sUSD.balanceOf(liquidator), liquidationFee, toUnit('0.001'));

				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, instance] });

				assert.equal(decodedLogs.length, 4);
				decodedEventEqual({
					event: 'Issued',
					emittedFrom: sUSD.address,
					args: [liquidator, liquidationFee],
					log: decodedLogs[1],
				});
				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: instance.address,
					args: [
						marketKey,
						positionId,
						trader3,
						toBN('0'),
						toBN('0'),
						toBN('0'),
						(await assetPrice()).price,
						toBN('0'),
					],
					log: decodedLogs[2],
				});
				decodedEventEqual({
					event: 'PositionLiquidated',
					emittedFrom: instance.address,
					args: [marketKey, trader3, liquidator, positionSize, newPrice, liquidationFee],
					log: decodedLogs[3],
					bnCloseVariance: toUnit('0.001'),
				});

				assert.bnLt(remainingMargin, liquidationFee);
			});

			it('liquidations of positive margin position pays to fee pool, short case', async () => {
				// liqMargin = max(20, 250 * 20 * 0.0035) + 250 * 20*0.0025 = 32.5
				// fee 20*250*0.001 = 15
				// Remaining margin = 250 + (32.5 - (1000 - 15)) / (-20)= 297.625
				const liqPrice = toBN((await getPositionSummary(trader3)).approxLiquidationPrice);
				assert.bnClose(liqPrice, toUnit(297.625), toUnit('0.01'));

				const newPrice = liqPrice.add(toUnit(0.5));
				await setPrice(baseAsset, newPrice);
				assert.isTrue((await getPositionSummary(trader3)).canLiquidate);

				const remainingMargin = toBN((await getPositionSummary(trader3)).remainingMargin);
				const tx = await instance.liquidatePosition(marketKey, trader3, liquidator);

				const liquidationFee = multiplyDecimal(
					multiplyDecimal(await perpsManager.liquidationFeeRatio(), newPrice),
					toUnit(20) // position size
				);
				assert.bnClose(await sUSD.balanceOf(liquidator), liquidationFee, toUnit('0.001'));

				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, instance] });

				assert.equal(decodedLogs.length, 5); // additional sUSD issue event

				const poolFee = remainingMargin.sub(liquidationFee);
				// the price needs to be set in a way that leaves positive margin after fee
				assert.isTrue(poolFee.gt(toBN(0)));

				decodedEventEqual({
					event: 'Issued',
					emittedFrom: sUSD.address,
					args: [await feePool.FEE_ADDRESS(), poolFee],
					log: decodedLogs[2],
					bnCloseVariance: toUnit('0.001'),
				});
			});

			it('Transfers an updated fee upon liquidation', async () => {
				const { size: positionSize, id: positionId } = await getPosition(trader);
				// Move the price to a non-liquidating point
				let price = toBN((await getPositionSummary(trader)).approxLiquidationPrice);
				const newPrice = price.add(toUnit('1'));

				await setPrice(baseAsset, newPrice);

				assert.isFalse((await getPositionSummary(trader)).canLiquidate);

				// raise the liquidation fee
				await perpsManager.setMinKeeperFee(toUnit('100'), { from: owner });

				assert.isTrue((await getPositionSummary(trader)).canLiquidate);
				price = (await getPositionSummary(trader)).approxLiquidationPrice;

				// liquidate the position
				const tx = await instance.liquidatePosition(marketKey, trader, liquidator);

				// check that the liquidation price was correct.
				// liqMargin = max(100, 250 * 40 * 0.0035) + 250 * 40*0.0025 = 125
				// fee 40*250*0.003 = 30
				// Remaining margin = 250 + (125 - (1000 - 30)) / (40)= 228.875
				assert.bnClose(price, toUnit(228.875), toUnit(0.1));

				const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [sUSD, instance] });
				decodedEventEqual({
					event: 'PositionModified',
					emittedFrom: instance.address,
					args: [
						marketKey,
						positionId,
						trader,
						toBN('0'),
						toBN('0'),
						toBN('0'),
						(await assetPrice()).price,
						toBN('0'),
					],
					log: decodedLogs[2],
				});
				decodedEventEqual({
					event: 'PositionLiquidated',
					emittedFrom: instance.address,
					args: [marketKey, trader, liquidator, positionSize, newPrice, toUnit('100')],
					log: decodedLogs[3],
					bnCloseVariance: toUnit('0.001'),
				});
			});

			it('Liquidating a position and opening one after should increment the position id', async () => {
				const { id: oldPositionId } = await getPosition(trader);
				assert.bnEqual(oldPositionId, toBN('1'));

				await setPrice(baseAsset, toUnit('200'));
				assert.isTrue((await getPositionSummary(trader)).canLiquidate);
				await instance.liquidatePosition(marketKey, trader, liquidator);

				await transferAndTrade({
					account: trader,
					fillPrice: toUnit('100'),
					marginDelta: toUnit('1000'),
					sizeDelta: toUnit('10'),
				});

				const { id: newPositionId } = await getPosition(trader);
				assert.bnGte(newPositionId, oldPositionId);
			});

			it('liquidation does not change locked margin', async () => {
				const locked = toBN('10');
				await setPrice(baseAsset, toUnit('260'));
				await instance.modifyLockedMargin(marketKey, trader, locked, 0, { from: mockOrders });
				await setPrice(baseAsset, toUnit('50'));
				await instance.liquidatePosition(marketKey, trader, liquidator);
				const position = await getPosition(trader);
				assert.bnEqual(toBN(position.margin), 0);
				assert.bnEqual(position.lockedMargin, locked);
			});
		});

		describe('liquidation fee', () => {
			it('accurate with position size and parameters', async () => {
				await setPrice(baseAsset, toUnit('1000'));
				await transfer(toUnit('1000'), trader);
				await trade(toUnit('2'), trader);
				await transfer(toUnit('1000'), trader2);
				await trade(toUnit('-2'), trader2);
				await transfer(toUnit('1000'), trader3);

				// cannot be liquidated and so no fee
				assert.bnEqual((await getPositionSummary(trader3)).approxLiquidationFee, 0);
				await trade(toUnit('0.02'), trader3);
				// still cannot be liquidated and so no fee (because not leveraged)
				assert.bnEqual((await getPositionSummary(trader3)).approxLiquidationFee, 0);

				// min keeper fee
				assert.bnEqual((await getPositionSummary(trader)).approxLiquidationFee, toUnit(20));
				assert.bnEqual((await getPositionSummary(trader2)).approxLiquidationFee, toUnit(20));

				// long
				await setPrice(baseAsset, toUnit('500'));
				// minimum liquidation fee < 20 , 0.0035 * 500 * 2 = 3.5
				assert.bnEqual((await getPositionSummary(trader)).approxLiquidationFee, minKeeperFee);

				// reduce minimum
				await perpsManager.setMinKeeperFee(toUnit(1), { from: owner });
				const res = await getPositionSummary(trader);
				assert.bnEqual(
					res.approxLiquidationFee,
					multiplyDecimal(res.approxLiquidationPrice, toUnit(2 * 0.0035))
				);

				// short
				await setPrice(baseAsset, toUnit('1500'));
				// minimum liquidation fee > 1, 0.0035 * 1500 * 2 = 10.5
				const res2 = await getPositionSummary(trader2);
				assert.bnEqual(
					res2.approxLiquidationFee,
					multiplyDecimal(res2.approxLiquidationPrice, toUnit(2 * 0.0035))
				);
				// increase minimum
				await perpsManager.setMinKeeperFee(toUnit(30), { from: owner });
				assert.bnEqual((await getPositionSummary(trader2)).approxLiquidationFee, toUnit(30));

				// increase BPs
				// minimum liquidation fee > 30, 0.02 * 1500 * 2 = 60
				await perpsManager.setLiquidationFeeRatio(toUnit(0.02), { from: owner });
				const res3 = await getPositionSummary(trader2);
				assert.bnEqual(
					res3.approxLiquidationFee,
					multiplyDecimal(res3.approxLiquidationPrice, toUnit(2 * 0.02))
				);
			});
		});

		describe('liquidationMargin', () => {
			it('accurate with position size, price, and parameters', async () => {
				await setPrice(baseAsset, toUnit('1000'));
				await transfer(toUnit('1000'), trader);
				await trade(toUnit('2'), trader);
				await transfer(toUnit('1000'), trader2);
				await trade(toUnit('-2'), trader2);

				// reverts for 0 position
				await assert.revert(instance.liquidationMargin(marketKey, trader3), '0 size position');

				// max(20, 2 * 1000 * 0.0035) + 2 * 1000 * 0.0025 = 25
				assert.bnEqual(await instance.liquidationMargin(marketKey, trader), toUnit('25'));
				assert.bnEqual(await instance.liquidationMargin(marketKey, trader2), toUnit('25'));

				// reduce minimum
				// max(1, 2 * 1000 * 0.0035) + 2 * 1000 * 0.0025 = 12
				await perpsManager.setMinKeeperFee(toUnit(1), { from: owner });
				assert.bnEqual(await instance.liquidationMargin(marketKey, trader), toUnit('12'));
				assert.bnEqual(await instance.liquidationMargin(marketKey, trader2), toUnit('12'));

				// change price
				await setPrice(baseAsset, toUnit('1500'));
				// max(1, 2 * 1500 * 0.0035) + 2 * 1000 * 0.0025 = 18
				assert.bnEqual(await instance.liquidationMargin(marketKey, trader), toUnit('18'));
				assert.bnEqual(await instance.liquidationMargin(marketKey, trader2), toUnit('18'));

				// change fee BPs
				// max(1, 2 * 1500 * 0.02) + 2 * 1500 * 0.0025 = 67.5
				await perpsManager.setLiquidationFeeRatio(toUnit(0.02), { from: owner });
				assert.bnEqual(await instance.liquidationMargin(marketKey, trader), toUnit('67.5'));
				assert.bnEqual(await instance.liquidationMargin(marketKey, trader2), toUnit('67.5'));

				// change buffer BPs
				// max(1, 2 * 1500 * 0.02) + 2 * 1500 * 0.03 = 150
				await perpsManager.setLiquidationBufferRatio(toUnit(0.03), { from: owner });
				assert.bnEqual(await instance.liquidationMargin(marketKey, trader), toUnit('150'));
				assert.bnEqual(await instance.liquidationMargin(marketKey, trader2), toUnit('150'));
			});
		});
	});

	describe('Price deviation scenarios', () => {
		const everythingReverts = async () => {
			it('then settings parameter changes revert', async () => {
				await assert.revert(
					perpsManager.setMaxFundingRate(marketKey, 0, { from: owner }),
					revertMsg.InvalidPrice
				);
				await assert.revert(
					perpsManager.setSkewScaleUSD(marketKey, toUnit('100'), { from: owner }),
					revertMsg.InvalidPrice
				);
				await assert.revert(
					perpsManager.setMarketConfig(marketKey, 0, 0, 0, 0, 0, 0, 0, {
						from: owner,
					}),
					revertMsg.InvalidPrice
				);
			});

			it('then mutative market actions revert', async () => {
				await assert.revert(transfer(toUnit('1000'), trader), revertMsg.InvalidPrice);
				await assert.revert(withdraw(trader), revertMsg.InvalidPrice);
				await assert.revert(trade(toUnit('1'), trader), revertMsg.InvalidPrice);
				await assert.revert(close(trader), revertMsg.InvalidPrice);
				await assert.revert(
					instance.liquidatePosition(marketKey, trader, liquidator, { from: trader }),
					revertMsg.InvalidPrice
				);
			});
		};

		describe('when price spikes over the allowed threshold', () => {
			beforeEach(async () => {
				await transfer(toUnit('1000'), trader);
				await trade(toUnit('1'), trader);
				// base rate of sETH is 100 from shared setup above
				await setPrice(baseAsset, toUnit('300'), false);
			});

			everythingReverts();
		});

		describe('when price drops over the allowed threshold', () => {
			beforeEach(async () => {
				await transfer(toUnit('1000'), trader);
				await trade(toUnit('1'), trader);
				// base rate of sETH is 100 from shared setup above
				await setPrice(baseAsset, toUnit('30'), false);
			});

			everythingReverts();
		});

		describe('exchangeCircuitBreaker.lastExchangeRate is updated after transactions', () => {
			const newPrice = toUnit('110');

			beforeEach(async () => {
				await transfer(toUnit('1000'), trader);
				await trade(toUnit('1'), trader);
				// base rate of sETH is 100 from shared setup above
				await setPrice(baseAsset, newPrice, false);
			});

			it('after transferMargin', async () => {
				await transfer(toUnit('1000'), trader);
				assert.bnEqual(await exchangeCircuitBreaker.lastExchangeRate(baseAsset), newPrice);
			});

			it('after withdrawMaxMargin', async () => {
				await withdraw(trader);
				assert.bnEqual(await exchangeCircuitBreaker.lastExchangeRate(baseAsset), newPrice);
			});

			it('after trade', async () => {
				await trade(toUnit('1'), trader);
				assert.bnEqual(await exchangeCircuitBreaker.lastExchangeRate(baseAsset), newPrice);
			});

			it('after closePosition', async () => {
				await close(trader);
				assert.bnEqual(await exchangeCircuitBreaker.lastExchangeRate(baseAsset), newPrice);
			});
		});
	});

	describe('Suspension scenarios', () => {
		function revertChecks(revertMessage) {
			it('then mutative market actions revert', async () => {
				await assert.revert(transfer(toUnit('-100'), trader), revertMessage);
				await assert.revert(withdraw(trader), revertMessage);
				await assert.revert(trade(toUnit('1'), trader), revertMessage);
				await assert.revert(close(trader), revertMessage);
				await assert.revert(
					instance.liquidatePosition(marketKey, trader, liquidator, { from: trader }),
					revertMessage
				);
			});

			it('then settings parameter changes do not revert', async () => {
				await perpsManager.setMaxFundingRate(marketKey, 0, { from: owner });
				await perpsManager.setSkewScaleUSD(marketKey, toUnit('100'), { from: owner });
				await perpsManager.setMarketConfig(marketKey, 0, 0, 0, 0, 0, 0, 1, {
					from: owner,
				});
			});

			it('settings parameter changes still revert if price is invalid', async () => {
				await setPrice(baseAsset, toUnit('1'), false); // circuit breaker will revert
				await assert.revert(
					perpsManager.setMarketConfig(marketKey, 0, 0, 0, 0, 0, 0, 1, {
						from: owner,
					}),
					revertMsg.InvalidPrice
				);
			});
		}

		describe('when markets are suspended', () => {
			beforeEach(async () => {
				// prepare a position
				await transfer(toUnit('1000'), trader);
				await trade(toUnit('1'), trader);
				// suspend
				await systemStatus.suspendFutures(toUnit(0), { from: owner });
			});

			// check reverts are as expecte
			revertChecks('Futures markets are suspended');

			it('Transfer margin fails for adding as well', async () => {
				await assert.revert(transfer(toUnit('100'), trader), 'Futures markets are suspended');
			});

			describe('when futures markets are resumed', () => {
				beforeEach(async () => {
					// suspend
					await systemStatus.resumeFutures({ from: owner });
				});

				it('then mutative market actions work', async () => {
					await withdraw(trader);
					await transfer(toUnit('100'), trader);
					await trade(toUnit('10'), trader);
					await close(trader);

					// set up for liquidation
					await trade(toUnit('10'), trader);
					await setPrice(baseAsset, toUnit('1'));
					await instance.liquidatePosition(marketKey, trader, liquidator, { from: trader2 });
				});
			});
		});

		describe('when specific market is suspended', () => {
			beforeEach(async () => {
				// prepare a position
				await transfer(toUnit('1000'), trader);
				await trade(toUnit('1'), trader);
				// suspend
				await systemStatus.suspendFuturesMarket(marketKey, toUnit(0), { from: owner });
			});

			// check reverts are as expecte
			revertChecks('Market suspended');

			it('can add margin, but cannot remove', async () => {
				await transfer(toUnit('100'), trader);
				await assert.revert(transfer(toUnit('-100'), trader), 'Market suspended');
			});

			describe('when market is resumed', () => {
				beforeEach(async () => {
					// suspend
					await systemStatus.resumeFuturesMarket(marketKey, { from: owner });
				});

				it('then mutative market actions work', async () => {
					await withdraw(trader);
					await transfer(toUnit('100'), trader);
					await trade(toUnit('10'), trader);
					await close(trader);

					// set up for liquidation
					await trade(toUnit('10'), trader);
					await setPrice(baseAsset, toUnit('1'));
					await instance.liquidatePosition(marketKey, trader, liquidator, { from: trader2 });
				});
			});
		});

		describe('when another market is suspended', () => {
			beforeEach(async () => {
				// prepare a position
				await transfer(toUnit('1000'), trader);
				await trade(toUnit('1'), trader);
				// suspend
				await systemStatus.suspendFuturesMarket(toBytes32('sOTHER'), toUnit(0), { from: owner });
			});

			it('then mutative market actions work', async () => {
				await withdraw(trader);
				await transfer(toUnit('100'), trader);
				await trade(toUnit('10'), trader);
				await close(trader);

				// set up for liquidation
				await trade(toUnit('10'), trader);
				await setPrice(baseAsset, toUnit('1'));
				await instance.liquidatePosition(marketKey, trader, liquidator, { from: trader2 });
			});
		});
	});
});
