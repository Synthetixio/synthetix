const fs = require('fs');
const path = require('path');
const { wrap } = require('../..');
const { contract, config } = require('hardhat');
const { assert } = require('../contracts/common');
const { toUnit, fastForward } = require('../utils')();
const {
	connectContracts,
	ensureAccountHasEther,
	ensureAccountHassUSD,
	exchangeSynths,
	skipWaitingPeriod,
	simulateExchangeRates,
	takeDebtSnapshot,
	mockOptimismBridge,
	avoidStaleRates,
	resumeSystem,
} = require('./utils');
const { toBytes32 } = require('../..');

contract('ExchangeRates (prod tests)', (accounts) => {
	const [, user] = accounts;

	let owner;

	let network, deploymentPath;

	let ExchangeRates, ReadProxyAddressResolver, SystemSettings, Exchanger;

	before('prepare', async () => {
		network = config.targetNetwork;
		const { getUsers, getPathToNetwork } = wrap({ network, fs, path });
		owner = getUsers({ network, user: 'owner' }).address;
		deploymentPath = config.deploymentPath || getPathToNetwork(network);

		await avoidStaleRates({ network, deploymentPath });
		await takeDebtSnapshot({ network, deploymentPath });
		await resumeSystem({ owner, network, deploymentPath });

		if (config.patchFreshDeployment) {
			await simulateExchangeRates({ network, deploymentPath });
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

	beforeEach('check debt snapshot', async () => {
		await takeDebtSnapshot({ network, deploymentPath });
	});

	describe('misc state', () => {
		it('has the expected resolver set', async () => {
			assert.equal(await ExchangeRates.resolver(), ReadProxyAddressResolver.address);
		});
	});

	describe('when an exchange is made', () => {
		let waitingPeriod;
		before(async function () {
			if (config.useOvm) {
				this.skip();
			}

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
