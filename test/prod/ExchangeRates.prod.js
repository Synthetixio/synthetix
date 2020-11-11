const fs = require('fs');
const path = require('path');
const { contract, config } = require('@nomiclabs/buidler');
const { wrap } = require('../../index.js');
const { assert } = require('../contracts/common');
const { toUnit, fastForward } = require('../utils')();
const {
	detectNetworkName,
	connectContracts,
	ensureAccountHasEther,
	ensureAccountHassUSD,
	exchangeSynths,
	skipWaitingPeriod,
	simulateExchangeRates,
	takeDebtSnapshot,
	mockOptimismBridge,
} = require('./utils');
const { toBytes32 } = require('../..');

contract('ExchangeRates (prod tests)', accounts => {
	const [, user] = accounts;

	let owner;

	let network, deploymentPath;

	let ExchangeRates, ReadProxyAddressResolver, SystemSettings, Exchanger;

	before('prepare', async () => {
		network = await detectNetworkName();
		const { getUsers, getPathToNetwork } = wrap({ network, fs, path });

		owner = getUsers({ network, user: 'owner' }).address;

		deploymentPath = config.deploymentPath || getPathToNetwork(network);

		if (config.patchFreshDeployment) {
			await simulateExchangeRates({ network, deploymentPath });
			await takeDebtSnapshot({ network, deploymentPath });
			await mockOptimismBridge({ network, deploymentPath });
		}

		({
			ExchangeRates,
			ReadProxyAddressResolver,
			SystemSettings,
			Exchanger,
		} = await connectContracts({
			network,
			deploymentPath,
			requests: [
				{ contractName: 'ExchangeRates' },
				{ contractName: 'ReadProxyAddressResolver' },
				{ contractName: 'SystemSettings' },
				{ contractName: 'Exchanger' },
			],
		}));

		await skipWaitingPeriod({ network, deploymentPath });

		await ensureAccountHasEther({
			amount: toUnit('10'),
			account: owner,
			fromAccount: accounts[7],
			network,
			deploymentPath,
		});
		await ensureAccountHassUSD({
			amount: toUnit('1000'),
			account: user,
			fromAccount: owner,
			network,
			deploymentPath,
		});
	});

	describe('misc state', () => {
		it('has the expected resolver set', async () => {
			assert.equal(await ExchangeRates.resolver(), ReadProxyAddressResolver.address);
		});

		it('has the expected owner set', async () => {
			assert.equal(await ExchangeRates.owner(), owner);
		});
	});

	describe('when an exchange is made', () => {
		let waitingPeriod;
		before(async () => {
			await exchangeSynths({
				network,
				deploymentPath,
				account: user,
				fromCurrency: 'sUSD',
				toCurrency: 'sETH',
				amount: toUnit('10'),
			});
			waitingPeriod = Number(await SystemSettings.waitingPeriodSecs());
		});
		it('should settle', async () => {
			await fastForward(waitingPeriod);
			await Exchanger.settle(user, toBytes32('sETH'), { from: user });
		});
	});
});
