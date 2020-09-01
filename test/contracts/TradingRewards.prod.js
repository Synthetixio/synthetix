const { contract, web3, artifacts } = require('@nomiclabs/buidler');
const { chainIdToNetwork, getTarget, getUsers, toBytes32 } = require('../../index.js');
const { assert, addSnapshotBeforeRestoreAfter } = require('./common');
const { toUnit } = require('../utils')();
const { getDecodedLogs } = require('./helpers');

contract('TradingRewards (prod tests)', () => {
	let network;

	let owner, deployer;

	const synths = ['sUSD', 'sETH'];
	const synthKeys = synths.map(toBytes32);
	const [sUSD, sETH] = synthKeys;

	let synthetix, rewards, resolver, systemSettings;

	let exchangeLogs;

	const LONG_TIMEOUT = 60e3;

	async function connectWithContract({ contractName, abiName = contractName }) {
		const { address } = getTarget({ network, contract: contractName });
		const Contract = artifacts.require(abiName);

		return Contract.at(address);
	}

	async function getExchangeLogs({ exchangeTx }) {
		const logs = await getDecodedLogs({
			hash: exchangeTx.tx,
			contracts: [synthetix, rewards],
		});

		return logs.filter(log => log !== undefined);
	}

	async function executeTrade() {
		const exchangeTx = await synthetix.exchange(sUSD, toUnit('1'), sETH, {
			from: owner,
		});

		exchangeLogs = await getExchangeLogs({ exchangeTx });
	}

	before('detect network', async () => {
		const networkId = await web3.eth.net.getId();
		network = chainIdToNetwork[`${networkId}`];
	});

	before('connect to contracts', async () => {
		rewards = await connectWithContract({ contractName: 'TradingRewards' });
		resolver = await connectWithContract({ contractName: 'AddressResolver' });
		systemSettings = await connectWithContract({ contractName: 'SystemSettings' });
		synthetix = await connectWithContract({
			contractName: 'ProxyERC20',
			abiName: 'Synthetix',
		});
	});

	before('get users', async () => {
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
		assert.equal(await rewards.resolver(), resolver.address);
	});

	it('has the expected owner set', async () => {
		assert.equal(await rewards.owner(), owner);
	});

	it('has the expected setting for tradingRewardsEnabled (disabled)', async () => {
		assert.isFalse(await systemSettings.tradingRewardsEnabled());
	});

	it('tradingRewardsEnabled should currently be disabled', async () => {
		assert.isFalse(await systemSettings.tradingRewardsEnabled());
	});

	describe('when trading rewards are disabled', () => {
		addSnapshotBeforeRestoreAfter();

		before(async () => {
			await systemSettings.setTradingRewardsEnabled(false, { from: owner });
		});

		it('shows trading rewards disabled', async () => {
			assert.isFalse(await systemSettings.tradingRewardsEnabled());
		});

		describe('when an exchange is made', () => {
			before(async () => {
				await executeTrade();
			});

			it('did not emit an ExchangeFeeRecorded event', async () => {
				assert.isFalse(exchangeLogs.some(log => log.name === 'ExchangeFeeRecorded'));
			});

			it('did not record a fee in TradingRewards', async () => {
				assert.bnEqual(await rewards.getUnaccountedFeesForAccountForPeriod(owner, 0), toUnit(0));
			}).timeout(LONG_TIMEOUT);
		});
	});

	describe('when trading rewards are enabled', () => {
		addSnapshotBeforeRestoreAfter();

		before(async () => {
			await systemSettings.setTradingRewardsEnabled(true, { from: owner });
		});

		it('shows trading rewards enabled', async () => {
			assert.isTrue(await systemSettings.tradingRewardsEnabled());
		});

		describe('when an exchange is made', () => {
			before(async () => {
				await executeTrade();
			});

			it('emitted an ExchangeFeeRecorded event', async () => {
				assert.isTrue(exchangeLogs.some(log => log.name === 'ExchangeFeeRecorded'));
			});

			it('recorded a fee in TradingRewards', async () => {
				assert.bnGt(await rewards.getUnaccountedFeesForAccountForPeriod(owner, 0), toUnit(0));
			}).timeout(LONG_TIMEOUT);
		});
	});
});
