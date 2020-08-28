const { chainIdToNetwork, getSource, getTarget, getUsers } = require('../../index.js');
const { assert, addSnapshotBeforeRestoreAfter } = require('./common');
const { contract, web3 } = require('@nomiclabs/buidler');

contract('TradingRewards (prod tests)', () => {
	let network;

	let owner;

	let tradingRewards, addressResolver, systemSettings;

	async function enableTradingRewardsIfNeeded(enabled) {
		const areEnabled = await systemSettings.methods.tradingRewardsEnabled().call();
		if (enabled !== areEnabled) {
			await systemSettings.methods.setTradingRewardsEnabled(enabled).send({ from: owner });
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
		tradingRewards = await connectWithContract({ network, contractName: 'TradingRewards' });
		addressResolver = await connectWithContract({ network, contractName: 'AddressResolver' });
		systemSettings = await connectWithContract({ network, contractName: 'SystemSettings' });
	});

	it('has the expected resolver set', async () => {
		assert.equal(await tradingRewards.methods.resolver().call(), addressResolver.options.address);
	});

	it('has the expected setting for tradingRewardsEnabled', async () => {
		assert.isFalse(await systemSettings.methods.tradingRewardsEnabled().call());
	});

	describe('when trading rewards are disabled', () => {
		addSnapshotBeforeRestoreAfter();

		before(async () => {
			await enableTradingRewardsIfNeeded(false);
		});

		it('shows trading rewards enabled', async () => {
			assert.isFalse(await systemSettings.methods.tradingRewardsEnabled().call());
		});

		// TODO
	});

	describe('when trading rewards are enabled', () => {
		addSnapshotBeforeRestoreAfter();

		before(async () => {
			await enableTradingRewardsIfNeeded(true);
		});

		it('shows trading rewards enabled', async () => {
			assert.isTrue(await systemSettings.methods.tradingRewardsEnabled().call());
		});

		// TODO
	});
});
