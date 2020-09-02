const { contract } = require('@nomiclabs/buidler');
const { getUsers, toBytes32 } = require('../../index.js');
const { assert, addSnapshotBeforeRestoreAfter } = require('./common');
const { toUnit } = require('../utils')();
const { getDecodedLogs } = require('./helpers');
const { detectNetworkName, connectContracts } = require('./utils/prod');

contract('TradingRewards (prod tests)', () => {
	let network;

	let owner, deployer;

	const synths = ['sUSD', 'sETH'];
	const synthKeys = synths.map(toBytes32);
	const [sUSD, sETH] = synthKeys;

	let Synthetix, TradingRewards, AddressResolver, SystemSettings;

	let exchangeLogs;

	async function getExchangeLogs({ exchangeTx }) {
		const logs = await getDecodedLogs({
			hash: exchangeTx.tx,
			contracts: [Synthetix, TradingRewards],
		});

		return logs.filter(log => log !== undefined);
	}

	async function executeTrade() {
		const exchangeTx = await Synthetix.exchange(sUSD, toUnit('1'), sETH, {
			from: owner,
		});

		exchangeLogs = await getExchangeLogs({ exchangeTx });
	}

	before('prepare', async () => {
		network = await detectNetworkName();

		({ TradingRewards, Synthetix, AddressResolver, SystemSettings } = await connectContracts({
			network,
			requests: [
				{ contractName: 'TradingRewards' },
				{ contractName: 'AddressResolver' },
				{ contractName: 'SystemSettings' },
				{ contractName: 'ProxyERC20', abiName: 'Synthetix' },
			],
		}));

		[owner, deployer] = getUsers({ network }).map(user => user.address);

		// TODO: Remove this once owner is set.
		owner = deployer;
		console.log(
			'>>>> TODO: REMOVE!!!!! Owner is set to deployer until it is changed ot protocolDAO:',
			owner
		);

		// TODO: Also assuming that owner possesses sUSD.
		// Might be a good idea to use a utility function for
		// that, and even abstract it into a file that can be used by other prod tests.
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
				await executeTrade();
			});

			it('did not emit an ExchangeFeeRecorded event', async () => {
				assert.isFalse(exchangeLogs.some(log => log.name === 'ExchangeFeeRecorded'));
			});

			it('did not record a fee in TradingRewards', async () => {
				assert.bnEqual(
					await TradingRewards.getUnaccountedFeesForAccountForPeriod(owner, 0),
					toUnit(0)
				);
			}).timeout(60e3);
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
				await executeTrade();
			});

			it('emitted an ExchangeFeeRecorded event', async () => {
				assert.isTrue(exchangeLogs.some(log => log.name === 'ExchangeFeeRecorded'));
			});

			it('recorded a fee in TradingRewards', async () => {
				assert.bnGt(
					await TradingRewards.getUnaccountedFeesForAccountForPeriod(owner, 0),
					toUnit(0)
				);
			}).timeout(60e3);
		});
	});
});
