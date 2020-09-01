const { chainIdToNetwork, getSource, getTarget, getUsers, toBytes32 } = require('../../index.js');
const { assert, addSnapshotBeforeRestoreAfter } = require('./common');
const { contract, web3 } = require('@nomiclabs/buidler');
const { toUnit } = require('../utils')();
const { getDecodedLogs } = require('./helpers');

contract('TradingRewards (prod tests)', () => {
	let network;

	let owner;

	let TradingRewards, AddressResolver, SystemSettings, Synthetix;

	const currencyKeys = ['sUSD', 'sETH'];
	const currencyKeysBytes = currencyKeys.map(toBytes32);
	const [sUSD, sETH] = currencyKeysBytes;

	async function enableTradingRewardsIfNeeded(enabled) {
		const areEnabled = await SystemSettings.methods.tradingRewardsEnabled().call();
		if (enabled !== areEnabled) {
			await SystemSettings.methods.setTradingRewardsEnabled(enabled).send({ from: owner });
		}
	}

	async function connectWithContract({ network, contractName, abiName = contractName }) {
		const { address } = getTarget({ network, contract: contractName });
		const { abi } = getSource({ network, contract: abiName });

		return new web3.eth.Contract(abi, address);
	}

	before('detect network', async () => {
		const networkId = await web3.eth.net.getId();
		network = chainIdToNetwork[`${networkId}`];
	});

	before('get users', async () => {
		[owner] = getUsers({ network }).map(user => user.address);
	});

	before('connect to contracts', async () => {
		TradingRewards = await connectWithContract({ network, contractName: 'TradingRewards' });
		AddressResolver = await connectWithContract({ network, contractName: 'AddressResolver' });
		SystemSettings = await connectWithContract({ network, contractName: 'SystemSettings' });
		Synthetix = await connectWithContract({
			network,
			contractName: 'Synthetix',
			abiName: 'ProxyERC20',
		});
	});

	it('has the expected resolver set', async () => {
		assert.equal(await TradingRewards.methods.resolver().call(), AddressResolver.options.address);
	});

	it('has the expected setting for tradingRewardsEnabled (disabled)', async () => {
		assert.isFalse(await SystemSettings.methods.tradingRewardsEnabled().call());
	});

	describe('when trading rewards are disabled', () => {
		addSnapshotBeforeRestoreAfter();

		before(async () => {
			await enableTradingRewardsIfNeeded(false);
		});

		it('shows trading rewards disabled', async () => {
			assert.isFalse(await SystemSettings.methods.tradingRewardsEnabled().call());
		});

		describe('when an exchange is made', () => {
			let exchangeTx;

			before(async () => {
				exchangeTx = await Synthetix.methods.exchange(sUSD, toUnit('1'), sETH).send({
					from: owner,
				});
			});

			it('did not emit an ExchangeFeeRecorded event', async () => {
				const logs = await getDecodedLogs({
					hash: exchangeTx.tx,
					contracts: [Synthetix, TradingRewards],
				});
				console.log('logs', logs);
			});

			it.skip('did not record a fee', async () => {});
		});

		// TODO
	});

	describe('when trading rewards are enabled', () => {
		addSnapshotBeforeRestoreAfter();

		before(async () => {
			await enableTradingRewardsIfNeeded(true);
		});

		it('shows trading rewards enabled', async () => {
			assert.isTrue(await SystemSettings.methods.tradingRewardsEnabled().call());
		});

		// TODO
	});
});
