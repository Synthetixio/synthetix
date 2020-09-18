const { contract } = require('@nomiclabs/buidler');
const { getUsers } = require('../../index.js');
const { assert, addSnapshotBeforeRestoreAfter } = require('../contracts/common');
const { toUnit } = require('../utils')();
const { toBytes32 } = require('../..');
const {
	detectNetworkName,
	connectContracts,
	getEther,
	getsUSD,
	getSNX,
	skipWaitingPeriod,
	skipStakeTime,
	writeSetting,
} = require('./utils');

contract('Synthetix (prod tests)', accounts => {
	const [, user, user1] = accounts;

	let owner;

	let network;

	let Synthetix, SynthetixState, AddressResolver;
	let SynthsUSD, SynthsETH;

	before('prepare', async () => {
		network = await detectNetworkName();

		({ Synthetix, SynthetixState, SynthsUSD, SynthsETH, AddressResolver } = await connectContracts({
			network,
			requests: [
				{ contractName: 'Synthetix' },
				{ contractName: 'SynthetixState' },
				{ contractName: 'ProxyERC20sUSD', abiName: 'Synth', alias: 'SynthsUSD' },
				{ contractName: 'ProxysETH', abiName: 'Synth', alias: 'SynthsETH' },
				{ contractName: 'AddressResolver' },
				{ contractName: 'ProxyERC20', abiName: 'Synthetix' },
			],
		}));

		await skipWaitingPeriod({ network });

		[owner] = getUsers({ network }).map(user => user.address);

		await getEther({
			amount: toUnit('10'),
			account: owner,
			fromAccount: accounts[7],
			network,
		});
		await getsUSD({ amount: toUnit('1000'), account: user, fromAccount: owner, network });
		await getSNX({ amount: toUnit('1000'), account: user, fromAccount: owner, network });
	});

	describe('misc state', () => {
		it('has the expected resolver set', async () => {
			assert.equal(await Synthetix.resolver(), AddressResolver.address);
		});

		it('has the expected owner set', async () => {
			assert.equal(await Synthetix.owner(), owner);
		});

		it('does not report any rate to be stale or invalid', async () => {
			assert.isFalse(await Synthetix.anySynthOrSNXRateIsInvalid());
		});

		it('reports matching totalIssuedSynths and debtLedger', async () => {
			const totalIssuedSynths = await Synthetix.totalIssuedSynths(toBytes32('sUSD'));
			const debtLedgerLength = await SynthetixState.debtLedgerLength();

			assert.isFalse(debtLedgerLength > 0 && totalIssuedSynths === 0);
		});
	});

	describe('erc20 functionality', () => {
		addSnapshotBeforeRestoreAfter();

		it('can transfer SNX', async () => {
			const userBalanceBefore = await Synthetix.balanceOf(user);
			const user1BalanceBefore = await Synthetix.balanceOf(user1);

			const amount = toUnit('100');
			await Synthetix.transfer(user1, amount, {
				from: user,
			});

			const userBalanceAfter = await Synthetix.balanceOf(user);
			const user1BalanceAfter = await Synthetix.balanceOf(user1);

			assert.bnEqual(userBalanceAfter, userBalanceBefore.sub(amount));
			assert.bnEqual(user1BalanceAfter, user1BalanceBefore.add(amount));
		});
	});

	describe('minting', () => {
		addSnapshotBeforeRestoreAfter();

		before(async () => {
			await writeSetting({ setting: 'setMinimumStakeTime', value: '60', owner });
		});

		it('can issue sUSD', async () => {
			const userBalanceBefore = await SynthsUSD.balanceOf(user);

			const amount = toUnit('100');
			await Synthetix.issueSynths(amount, {
				from: user,
			});

			const userBalanceAfter = await SynthsUSD.balanceOf(user);

			assert.bnEqual(userBalanceAfter, userBalanceBefore.add(amount));
		});

		it('can burn sUSD', async () => {
			await skipStakeTime({ network });

			const userBalanceBefore = await SynthsUSD.balanceOf(user);

			await Synthetix.burnSynths(userBalanceBefore, {
				from: user,
			});

			const userBalanceAfter = await SynthsUSD.balanceOf(user);

			assert.bnEqual(userBalanceAfter, toUnit('0'));
		});
	});

	describe('exchanging', () => {
		addSnapshotBeforeRestoreAfter();

		it('can exchange sUSD to sETH', async () => {
			await skipWaitingPeriod({ network });

			const userBalanceBeforesUSD = await SynthsUSD.balanceOf(user);
			const userBalanceBeforesETH = await SynthsETH.balanceOf(user);

			const amount = toUnit('100');
			await Synthetix.exchange(toBytes32('sUSD'), amount, toBytes32('sETH'), {
				from: user,
			});

			const userBalanceAftersUSD = await SynthsUSD.balanceOf(user);
			const userBalanceAftersETH = await SynthsETH.balanceOf(user);

			assert.bnEqual(userBalanceAftersUSD, userBalanceBeforesUSD.sub(amount));
			assert.bnGt(userBalanceAftersETH, userBalanceBeforesETH);
		});

		it('can exchange sETH to sUSD', async () => {
			await skipWaitingPeriod({ network });

			const userBalanceBeforesUSD = await SynthsUSD.balanceOf(user);
			const userBalanceBeforesETH = await SynthsETH.balanceOf(user);

			await Synthetix.exchange(toBytes32('sETH'), userBalanceBeforesETH, toBytes32('sUSD'), {
				from: user,
			});

			const userBalanceAftersUSD = await SynthsUSD.balanceOf(user);
			const userBalanceAftersETH = await SynthsETH.balanceOf(user);

			assert.bnEqual(userBalanceAftersETH, toUnit('0'));
			assert.bnGt(userBalanceAftersUSD, userBalanceBeforesUSD);
		});
	});
});
