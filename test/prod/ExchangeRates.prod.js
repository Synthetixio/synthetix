const { contract } = require('@nomiclabs/buidler');
const { getUsers } = require('../../index.js');
const { assert } = require('../contracts/common');
const { toUnit, fastForward } = require('../utils')();
const {
	detectNetworkName,
	connectContracts,
	ensureAccountHasEther,
	ensureAccountHassUSD,
	exchangeSynths,
	skipWaitingPeriod,
} = require('./utils');
const { toBytes32 } = require('../..');

contract('ExchangeRates (prod tests)', accounts => {
	const [, user] = accounts;

	let owner;

	let network;

	let ExchangeRates, AddressResolver, SystemSettings, Exchanger;

	before('prepare', async () => {
		network = await detectNetworkName();

		({ ExchangeRates, AddressResolver, SystemSettings, Exchanger } = await connectContracts({
			network,
			requests: [
				{ contractName: 'ExchangeRates' },
				{ contractName: 'AddressResolver' },
				{ contractName: 'SystemSettings' },
				{ contractName: 'Exchanger' },
			],
		}));

		await skipWaitingPeriod({ network });

		[owner] = getUsers({ network }).map(user => user.address);

		await ensureAccountHasEther({
			amount: toUnit('10'),
			account: owner,
			fromAccount: accounts[7],
			network,
		});
		await ensureAccountHassUSD({
			amount: toUnit('1000'),
			account: user,
			fromAccount: owner,
			network,
		});
	});

	describe('misc state', () => {
		it('has the expected resolver set', async () => {
			assert.equal(await ExchangeRates.resolver(), AddressResolver.address);
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
