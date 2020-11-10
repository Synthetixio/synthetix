const fs = require('fs');
const path = require('path');
const { contract, config } = require('@nomiclabs/buidler');
const { wrap } = require('../../index.js');
const { assert, addSnapshotBeforeRestoreAfter } = require('../contracts/common');
const { toUnit } = require('../utils')();
const {
	detectNetworkName,
	connectContracts,
	ensureAccountHasEther,
	ensureAccountHassUSD,
	exchangeSynths,
	skipWaitingPeriod,
	bootstrapLocal,
} = require('./utils');

contract('TradingRewards (prod tests)', accounts => {
	const [, user] = accounts;

	let owner;

	let network, deploymentPath;

	let TradingRewards, AddressResolver, SystemSettings;

	let exchangeLogs;

	before('prepare', async function() {
		network = await detectNetworkName();
		const { getUsers, getPathToNetwork } = wrap({ network, fs, path });

		deploymentPath = config.deploymentPath || getPathToNetwork(network);
		if (deploymentPath.includes('ovm')) {
			return this.skip();
		}

		if (network === 'local') {
			await bootstrapLocal({ deploymentPath });
		}

		({ TradingRewards, AddressResolver, SystemSettings } = await connectContracts({
			network,
			requests: [
				{ contractName: 'TradingRewards' },
				{ contractName: 'AddressResolver' },
				{ contractName: 'SystemSettings' },
				{ contractName: 'ProxyERC20', abiName: 'Synthetix' },
			],
		}));

		await skipWaitingPeriod({ network });

		[owner] = getUsers({ network }).map(user => user.address);

		await ensureAccountHasEther({
			amount: toUnit('1'),
			account: owner,
			fromAccount: accounts[7],
			network,
		});
		await ensureAccountHassUSD({
			amount: toUnit('100'),
			account: user,
			fromAccount: owner,
			network,
		});
	});

	it('has the expected resolver set', async () => {
		assert.equal(await TradingRewards.resolver(), AddressResolver.address);
	});

	it('has the expected owner set', async () => {
		assert.equal(await TradingRewards.owner(), owner);
	});

	it('has the expected setting for tradingRewardsEnabled (disabled)', async () => {
		assert.isFalse(await SystemSettings.tradingRewardsEnabled());
	});

	it('tradingRewardsEnabled should currently be disabled', async () => {
		assert.isFalse(await SystemSettings.tradingRewardsEnabled());
	});

	describe('when trading rewards are disabled', () => {
		addSnapshotBeforeRestoreAfter();

		before(async () => {
			await SystemSettings.setTradingRewardsEnabled(false, { from: owner });
		});

		it('shows trading rewards disabled', async () => {
			assert.isFalse(await SystemSettings.tradingRewardsEnabled());
		});

		describe('when an exchange is made', () => {
			before(async () => {
				({ exchangeLogs } = await exchangeSynths({
					network,
					account: user,
					fromCurrency: 'sUSD',
					toCurrency: 'sETH',
					amount: toUnit('1'),
				}));
			});

			it('did not emit an ExchangeFeeRecorded event', async () => {
				assert.isFalse(exchangeLogs.some(log => log.name === 'ExchangeFeeRecorded'));
			});

			it('did not record a fee in TradingRewards', async () => {
				assert.bnEqual(
					await TradingRewards.getUnaccountedFeesForAccountForPeriod(user, 0),
					toUnit(0)
				);
			});
		});
	});

	describe('when trading rewards are enabled', () => {
		addSnapshotBeforeRestoreAfter();

		before(async () => {
			await SystemSettings.setTradingRewardsEnabled(true, { from: owner });
		});

		it('shows trading rewards enabled', async () => {
			assert.isTrue(await SystemSettings.tradingRewardsEnabled());
		});

		describe('when an exchange is made', () => {
			before(async () => {
				({ exchangeLogs } = await exchangeSynths({
					network,
					withTradingRewards: true,
					account: user,
					fromCurrency: 'sUSD',
					toCurrency: 'sETH',
					amount: toUnit('1'),
				}));
			});

			it('emitted an ExchangeFeeRecorded event', async () => {
				assert.isTrue(exchangeLogs.some(log => log.name === 'ExchangeFeeRecorded'));
			});

			it('recorded a fee in TradingRewards', async () => {
				assert.bnGt(await TradingRewards.getUnaccountedFeesForAccountForPeriod(user, 0), toUnit(0));
			});
		});
	});
});
