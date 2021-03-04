const fs = require('fs');
const path = require('path');
const { wrap } = require('../..');
const { contract, config } = require('hardhat');
const { assert, addSnapshotBeforeRestoreAfter } = require('../contracts/common');
const { toUnit } = require('../utils')();
const {
	connectContracts,
	ensureAccountHasEther,
	ensureAccountHassUSD,
	exchangeSynths,
	skipWaitingPeriod,
	simulateExchangeRates,
	takeDebtSnapshot,
	mockOptimismBridge,
	writeSetting,
	avoidStaleRates,
	resumeSystem,
} = require('./utils');

contract('TradingRewards (prod tests) @ovm-skip', accounts => {
	const [, user] = accounts;

	let owner;

	let network, deploymentPath;

	let TradingRewards, ReadProxyAddressResolver, SystemSettings;

	let exchangeLogs;

	before('prepare', async function() {
		network = config.targetNetwork;
		const { getUsers, getPathToNetwork } = wrap({ network, fs, path });
		deploymentPath = config.deploymentPath || getPathToNetwork(network);
		owner = getUsers({ network, user: 'owner' }).address;

		if (config.useOvm) {
			return this.skip();
		}

		await avoidStaleRates({ network, deploymentPath });
		await takeDebtSnapshot({ network, deploymentPath });
		await resumeSystem({ owner, network, deploymentPath });

		if (config.patchFreshDeployment) {
			await simulateExchangeRates({ network, deploymentPath });
			await mockOptimismBridge({ network, deploymentPath });
		}

		({ TradingRewards, ReadProxyAddressResolver, SystemSettings } = await connectContracts({
			network,
			requests: [
				{ contractName: 'TradingRewards' },
				{ contractName: 'ReadProxyAddressResolver' },
				{ contractName: 'SystemSettings' },
				{ contractName: 'ProxyERC20', abiName: 'Synthetix' },
			],
		}));

		await skipWaitingPeriod({ network });

		await ensureAccountHasEther({
			amount: toUnit('1'),
			account: owner,
			fromAccount: accounts[7],
			network,
			deploymentPath,
		});
		await ensureAccountHassUSD({
			amount: toUnit('100'),
			account: user,
			fromAccount: owner,
			network,
			deploymentPath,
		});
	});

	beforeEach('check debt snapshot', async () => {
		await takeDebtSnapshot({ network, deploymentPath });
	});

	it('has the expected resolver set', async () => {
		assert.equal(await TradingRewards.resolver(), ReadProxyAddressResolver.address);
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
			await writeSetting({
				setting: 'setTradingRewardsEnabled',
				value: false,
				network,
				deploymentPath,
			});
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
			await writeSetting({
				setting: 'setTradingRewardsEnabled',
				value: true,
				network,
				deploymentPath,
			});
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
