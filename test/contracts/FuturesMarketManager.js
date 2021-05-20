const { contract, web3 } = require('hardhat');
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

contract('FuturesMarketManager', accounts => {
	let proxyFuturesMarketManager;
	let futuresMarketManager;
	let sUSD;
	const owner = accounts[1];
	const trader = accounts[2];

	before(async () => {
		({
			ProxyFuturesMarketManager: proxyFuturesMarketManager,
			FuturesMarketManager: futuresMarketManager,
			SynthsUSD: sUSD,
		} = await setupAllContracts({
			accounts,
			synths: ['sUSD'],
			contracts: [
				'FuturesMarketManager',
				'ProxyFuturesMarketManager',
				'AddressResolver',
				'FeePool',
				'ExchangeRates',
				'SystemStatus',
				'SystemSettings',
				'Synthetix',
			],
		}));

		await sUSD.issue(trader, toUnit('100000'), { from: owner });
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
				ignoreParents: ['Owned', 'MixinResolver', 'Proxyable'],
				expected: ['addMarkets', 'removeMarkets', 'removeMarketsByAsset', 'issueSUSD', 'burnSUSD'],
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
						args: [futuresMarketManager.address, k, toUnit('1000'), false],
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
				args: [futuresMarketManager.address, toBytes32('sLINK'), toUnit('1000'), false],
				skipPostDeploy: true,
			});
			await futuresMarketManager.addMarkets([market.address], { from: owner });
			assert.bnEqual(await futuresMarketManager.numMarkets(), toBN(3));
			assert.equal((await futuresMarketManager.markets(2, 1))[0], market.address);

			assert.equal(await futuresMarketManager.marketForAsset(toBytes32('sLINK')), market.address);
		});

		it('Adding multiple markets', async () => {
			const keys = ['sLINK', 'sSNX'].map(toBytes32);
			const markets = await Promise.all(
				keys.map(k =>
					setupContract({
						accounts,
						contract: 'MockFuturesMarket',
						args: [futuresMarketManager.address, k, toUnit('1000'), false],
						skipPostDeploy: true,
					})
				)
			);
			const addresses = markets.map(m => m.address);
			const tx = await futuresMarketManager.addMarkets(addresses, { from: owner });
			assert.bnEqual(await futuresMarketManager.numMarkets(), toBN(4));
			assert.deepEqual(await futuresMarketManager.markets(2, 2), addresses);
			assert.deepEqual(await futuresMarketManager.marketsForAssets(keys), addresses);

			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [futuresMarketManager] });
			assert.equal(decodedLogs.length, 2);
			decodedEventEqual({
				event: 'MarketAdded',
				emittedFrom: proxyFuturesMarketManager.address,
				args: [addresses[0], keys[0]],
				log: decodedLogs[0],
			});
			decodedEventEqual({
				event: 'MarketAdded',
				emittedFrom: proxyFuturesMarketManager.address,
				args: [addresses[1], keys[1]],
				log: decodedLogs[1],
			});
		});

		it('Cannot add more than one market for the same asset.', async () => {
			const market = await setupContract({
				accounts,
				contract: 'MockFuturesMarket',
				args: [futuresMarketManager.address, toBytes32('sETH'), toUnit('1000'), false],
				skipPostDeploy: true,
			});
			await assert.revert(
				futuresMarketManager.addMarkets([market.address], { from: owner }),
				'Market already exists'
			);
		});

		it('Removing a single market', async () => {
			await futuresMarketManager.removeMarkets([addresses[0]], { from: owner });

			const markets = await futuresMarketManager.allMarkets();
			assert.bnEqual(await futuresMarketManager.numMarkets(), toBN(1));
			assert.deepEqual(markets, [addresses[1]]);

			assert.equal(await futuresMarketManager.marketForAsset(currencyKeys[0]), ZERO_ADDRESS);
		});

		it('Removing multiple markets', async () => {
			const tx = await futuresMarketManager.removeMarkets(addresses, { from: owner });
			const markets = await futuresMarketManager.allMarkets();
			assert.bnEqual(await futuresMarketManager.numMarkets(), toBN(0));
			assert.deepEqual(markets, []);
			assert.deepEqual(await futuresMarketManager.marketsForAssets(currencyKeys), [
				ZERO_ADDRESS,
				ZERO_ADDRESS,
			]);

			const decodedLogs = await getDecodedLogs({ hash: tx.tx, contracts: [futuresMarketManager] });
			assert.equal(decodedLogs.length, 2);
			decodedEventEqual({
				event: 'MarketRemoved',
				emittedFrom: proxyFuturesMarketManager.address,
				args: [addresses[0], currencyKeys[0]],
				log: decodedLogs[0],
			});
			decodedEventEqual({
				event: 'MarketRemoved',
				emittedFrom: proxyFuturesMarketManager.address,
				args: [addresses[1], currencyKeys[1]],
				log: decodedLogs[1],
			});
		});

		it('Removing markets by asset', async () => {
			await futuresMarketManager.removeMarketsByAsset([toBytes32('sETH')], { from: owner });

			let markets = await futuresMarketManager.allMarkets();
			assert.bnEqual(await futuresMarketManager.numMarkets(), toBN(1));
			assert.deepEqual(markets, [addresses[0]]);

			const market = await setupContract({
				accounts,
				contract: 'MockFuturesMarket',
				args: [futuresMarketManager.address, toBytes32('sLINK'), toUnit('1000'), false],
				skipPostDeploy: true,
			});
			await futuresMarketManager.addMarkets([market.address], { from: owner });
			await futuresMarketManager.removeMarketsByAsset(['sBTC', 'sLINK'].map(toBytes32), {
				from: owner,
			});

			markets = await futuresMarketManager.allMarkets();
			assert.bnEqual(await futuresMarketManager.numMarkets(), toBN(0));
			assert.deepEqual(markets, []);
		});

		it('Cannot remove a market which does not exist', async () => {
			await assert.revert(
				futuresMarketManager.removeMarketsByAsset([toBytes32('sLINK')], { from: owner }),
				'Unknown market'
			);

			const market = await setupContract({
				accounts,
				contract: 'MockFuturesMarket',
				args: [futuresMarketManager.address, toBytes32('sLINK'), toUnit('1000'), false],
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
				args: [futuresMarketManager.address, toBytes32('sLINK'), toUnit('1000'), false],
				skipPostDeploy: true,
			});

			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketManager.addMarkets,
				args: [[market.address]],
				accounts,
				address: owner,
				skipPassCheck: false,
				reason: 'Owner only function',
			});

			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketManager.removeMarkets,
				args: [[market.address]],
				accounts,
				address: owner,
				skipPassCheck: false,
				reason: 'Owner only function',
			});

			await onlyGivenAddressCanInvoke({
				fnc: futuresMarketManager.removeMarketsByAsset,
				args: [['sETH', 'sBTC'].map(toBytes32)],
				accounts,
				address: owner,
				skipPassCheck: false,
				reason: 'Owner only function',
			});
		});
	});

	describe('sUSD issuance', () => {
		let market;
		beforeEach(async () => {
			market = await setupContract({
				accounts,
				contract: 'MockFuturesMarket',
				args: [futuresMarketManager.address, toBytes32('sLINK'), toUnit('1000'), false],
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
		const individualDebt = toUnit('1000');
		const currencyKeys = ['sBTC', 'sETH', 'sLINK'].map(toBytes32);
		let markets;
		beforeEach(async () => {
			markets = await Promise.all(
				currencyKeys.map(k =>
					setupContract({
						accounts,
						contract: 'MockFuturesMarket',
						args: [futuresMarketManager.address, k, individualDebt, false],
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
			assert.bnEqual((await futuresMarketManager.totalDebt())[0], individualDebt.mul(toBN(3)));
			await markets[0].setMarketDebt(toUnit('2500'));
			await markets[1].setMarketDebt(toUnit('200'));
			assert.bnEqual(
				(await futuresMarketManager.totalDebt())[0],
				individualDebt.div(toBN(10)).mul(toBN(37))
			);
			await futuresMarketManager.removeMarkets([markets[2].address], { from: owner });
			assert.bnEqual(
				(await futuresMarketManager.totalDebt())[0],
				individualDebt.div(toBN(10)).mul(toBN(27))
			);
			const market = await setupContract({
				accounts,
				contract: 'MockFuturesMarket',
				args: [futuresMarketManager.address, toBytes32('sLINK'), toUnit('4000'), false],
				skipPostDeploy: true,
			});
			await futuresMarketManager.addMarkets([market.address], { from: owner });

			assert.bnEqual(
				(await futuresMarketManager.totalDebt())[0],
				individualDebt.div(toBN(10)).mul(toBN(67))
			);
		});

		it('Aggregated debt validity updates properly with the individual markets', async () => {
			assert.isFalse((await futuresMarketManager.totalDebt())[1]);

			await markets[0].setInvalid(true);
			assert.isTrue((await futuresMarketManager.totalDebt())[1]);

			await markets[0].setInvalid(false);
			await markets[2].setInvalid(true);
			assert.isTrue((await futuresMarketManager.totalDebt())[1]);

			await futuresMarketManager.removeMarkets([markets[2].address], { from: owner });
			assert.isFalse((await futuresMarketManager.totalDebt())[1]);
		});
	});
});
