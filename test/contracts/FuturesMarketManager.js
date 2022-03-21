const { artifacts, contract, web3 } = require('hardhat');
const { toBN } = web3.utils;
const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');
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
	let futuresMarketManager, sUSD, debtCache, synthetix, addressResolver;
	const owner = accounts[1];
	const trader = accounts[2];
	const initialMint = toUnit('100000');

	before(async () => {
		({
			FuturesMarketManager: futuresMarketManager,
			SynthsUSD: sUSD,
			DebtCache: debtCache,
			Synthetix: synthetix,
			AddressResolver: addressResolver,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD'],
			contracts: [
				'FuturesMarketManager',
				'AddressResolver',
				'FeePool',
				'ExchangeRates',
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
			assert.deepEqual(required, [toBytes32('SynthsUSD')]);
		});

		it('only expected functions are mutable', () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: futuresMarketManager.abi,
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
	});

	describe('Market management', () => {
		const currencyKeys = ['sBTC', 'sETH'].map(toBytes32);
		let markets, addresses;
		beforeEach(async () => {
			markets = await Promise.all(
				currencyKeys.map(k =>
					setupContract({
						accounts,
						contract: 'MockFuturesMarket',
						args: [futuresMarketManager.address, k, k, toUnit('1000'), false],
						skipPostDeploy: true,
					})
				)
			);

			addresses = markets.map(m => m.address);
			await futuresMarketManager.addMarkets(addresses, { from: owner });
		});

		it('Adding a single market', async () => {
			const markets = await futuresMarketManager.allMarkets();
			assert.bnEqual(await futuresMarketManager.numMarkets(), toBN(markets.length));
			assert.equal(markets.length, 2);
			assert.deepEqual(markets, addresses);

			const market = await setupContract({
				accounts,
				contract: 'MockFuturesMarket',
				args: [
					futuresMarketManager.address,
					toBytes32('sLINK'),
					toBytes32('sLINK'),
					toUnit('1000'),
					false,
				],
				skipPostDeploy: true,
			});
			await futuresMarketManager.addMarkets([market.address], { from: owner });
			assert.bnEqual(await futuresMarketManager.numMarkets(), toBN(3));
			assert.equal((await futuresMarketManager.markets(2, 1))[0], market.address);

			assert.equal(await futuresMarketManager.marketForKey(toBytes32('sLINK')), market.address);
		});

		it('Adding multiple markets', async () => {
			const keys = ['sLINK', 'sSNX'].map(toBytes32);
			const markets = await Promise.all(
				keys.map(k =>
					setupContract({
						accounts,
						contract: 'MockFuturesMarket',
						args: [futuresMarketManager.address, k, k, toUnit('1000'), false],
						skipPostDeploy: true,
					})
				)
			);
			const addresses = markets.map(m => m.address);
			const tx = await futuresMarketManager.addMarkets(addresses, { from: owner });
			assert.bnEqual(await futuresMarketManager.numMarkets(), toBN(4));
			assert.deepEqual(await futuresMarketManager.markets(2, 2), addresses);
			assert.deepEqual(await futuresMarketManager.marketsForKeys(keys), addresses);

			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [futuresMarketManager] });
			assert.equal(decodedLogs.length, 2);
			decodedEventEqual({
				event: 'MarketAdded',
				emittedFrom: futuresMarketManager.address,
				args: [addresses[0], keys[0], keys[0]],
				log: decodedLogs[0],
			});
			decodedEventEqual({
				event: 'MarketAdded',
				emittedFrom: futuresMarketManager.address,
				args: [addresses[1], keys[1], keys[1]],
				log: decodedLogs[1],
			});
		});

		it('Cannot add more than one market for the same key.', async () => {
			const market = await setupContract({
				accounts,
				contract: 'MockFuturesMarket',
				args: [
					futuresMarketManager.address,
					toBytes32('sETH'),
					toBytes32('sETH'),
					toUnit('1000'),
					false,
				],
				skipPostDeploy: true,
			});
			await assert.revert(
				futuresMarketManager.addMarkets([market.address], { from: owner }),
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
				args: [
					futuresMarketManager.address,
					await market1.baseAsset(),
					secondKey,
					toUnit('1000'),
					false,
				],
				skipPostDeploy: true,
			});
			await futuresMarketManager.addMarkets([market2.address], { from: owner });

			// check correcr addresses returned
			assert.equal(await futuresMarketManager.marketForKey(secondKey), market2.address);
			assert.equal(await futuresMarketManager.marketForKey(firstKey), market1.address);
		});

		it('Removing a single market', async () => {
			await futuresMarketManager.removeMarkets([addresses[0]], { from: owner });

			const markets = await futuresMarketManager.allMarkets();
			assert.bnEqual(await futuresMarketManager.numMarkets(), toBN(1));
			assert.deepEqual(markets, [addresses[1]]);

			assert.equal(await futuresMarketManager.marketForKey(currencyKeys[0]), ZERO_ADDRESS);
		});

		it('Removing multiple markets', async () => {
			const tx = await futuresMarketManager.removeMarkets(addresses, { from: owner });
			const markets = await futuresMarketManager.allMarkets();
			assert.bnEqual(await futuresMarketManager.numMarkets(), toBN(0));
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
				args: [addresses[0], currencyKeys[0]],
				log: decodedLogs[0],
			});
			decodedEventEqual({
				event: 'MarketRemoved',
				emittedFrom: futuresMarketManager.address,
				args: [addresses[1], currencyKeys[1]],
				log: decodedLogs[1],
			});
		});

		it('Removing markets by key', async () => {
			await futuresMarketManager.removeMarketsByKey([toBytes32('sETH')], { from: owner });

			let markets = await futuresMarketManager.allMarkets();
			assert.bnEqual(await futuresMarketManager.numMarkets(), toBN(1));
			assert.deepEqual(markets, [addresses[0]]);

			const market = await setupContract({
				accounts,
				contract: 'MockFuturesMarket',
				args: [
					futuresMarketManager.address,
					toBytes32('sLINK'),
					toBytes32('sLINK'),
					toUnit('1000'),
					false,
				],
				skipPostDeploy: true,
			});
			await futuresMarketManager.addMarkets([market.address], { from: owner });
			await futuresMarketManager.removeMarketsByKey(['sBTC', 'sLINK'].map(toBytes32), {
				from: owner,
			});

			markets = await futuresMarketManager.allMarkets();
			assert.bnEqual(await futuresMarketManager.numMarkets(), toBN(0));
			assert.deepEqual(markets, []);
		});

		it('Cannot remove a market which does not exist', async () => {
			await assert.revert(
				futuresMarketManager.removeMarketsByKey([toBytes32('sLINK')], { from: owner }),
				'Unknown market'
			);

			const market = await setupContract({
				accounts,
				contract: 'MockFuturesMarket',
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
				contract: 'MockFuturesMarket',
				args: [
					futuresMarketManager.address,
					toBytes32('sLINK'),
					toBytes32('sLINK'),
					toUnit('1000'),
					false,
				],
				skipPostDeploy: true,
			});

			const revertReason = 'Only the contract owner may perform this action';

			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketManager.addMarkets,
				args: [[market.address]],
				accounts,
				address: owner,
				skipPassCheck: false,
				reason: revertReason,
			});

			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketManager.removeMarkets,
				args: [[market.address]],
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
		});
	});

	describe('sUSD issuance', () => {
		let market;
		beforeEach(async () => {
			market = await setupContract({
				accounts,
				contract: 'MockFuturesMarket',
				args: [
					futuresMarketManager.address,
					toBytes32('sLINK'),
					toBytes32('sLINK'),
					toUnit('1000'),
					false,
				],
				skipPostDeploy: true,
			});
			await futuresMarketManager.addMarkets([market.address], { from: owner });
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
				reason: 'Permitted only for markets',
			});
			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketManager.burnSUSD,
				args: [owner, toUnit('1')],
				accounts,
				skipPassCheck: true,
				reason: 'Permitted only for markets',
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
							args: [futuresMarketManager.address, k, k, individualDebt, false],
							skipPostDeploy: true,
						})
					)
				);
				await futuresMarketManager.addMarkets(
					markets.map(m => m.address),
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

				await futuresMarketManager.removeMarkets([markets[2].address], { from: owner });
				assert.bnEqual((await futuresMarketManager.totalDebt())[0], toUnit('2700'));
				assert.bnEqual((await debtCache.currentDebt())[0], initialSystemDebt.sub(toUnit('300')));
				const market = await setupContract({
					accounts,
					contract: 'MockFuturesMarket',
					args: [
						futuresMarketManager.address,
						toBytes32('sLINK'),
						toBytes32('sLINK'),
						toUnit('4000'),
						false,
					],
					skipPostDeploy: true,
				});
				await futuresMarketManager.addMarkets([market.address], { from: owner });

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

				await futuresMarketManager.removeMarkets([markets[2].address], { from: owner });
				assert.isFalse((await futuresMarketManager.totalDebt())[1]);
				assert.isFalse((await debtCache.currentDebt())[1]);
			});
		});
	});
});
