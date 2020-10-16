const { contract } = require('@nomiclabs/buidler');
const { getUsers } = require('../../index.js');
const { assert, addSnapshotBeforeRestoreAfter } = require('../contracts/common');
const { toUnit } = require('../utils')();
const { toBytes32 } = require('../..');
const {
	detectNetworkName,
	connectContracts,
	ensureAccountHasEther,
	ensureAccountHassUSD,
	ensureAccountHasSNX,
	skipWaitingPeriod,
	skipStakeTime,
	writeSetting,
} = require('./utils');

contract('Synthetix (prod tests)', accounts => {
	const [, user1, user2] = accounts;

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

		await ensureAccountHasEther({
			amount: toUnit('10'),
			account: owner,
			fromAccount: accounts[7],
			network,
		});
		await ensureAccountHassUSD({
			amount: toUnit('1000'),
			account: user1,
			fromAccount: owner,
			network,
		});
		await ensureAccountHasSNX({
			amount: toUnit('1000'),
			account: user1,
			fromAccount: owner,
			network,
		});
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
			const user1BalanceBefore = await Synthetix.balanceOf(user1);
			const user2BalanceBefore = await Synthetix.balanceOf(user2);

			const amount = toUnit('100');
			await Synthetix.transfer(user2, amount, {
				from: user1,
			});

			const user1BalanceAfter = await Synthetix.balanceOf(user1);
			const user2BalanceAfter = await Synthetix.balanceOf(user2);

			assert.bnEqual(user1BalanceAfter, user1BalanceBefore.sub(amount));
			assert.bnEqual(user2BalanceAfter, user2BalanceBefore.add(amount));
		});
	});

	describe('minting', () => {
		addSnapshotBeforeRestoreAfter();

		before(async () => {
			await writeSetting({ setting: 'setMinimumStakeTime', value: '60', owner });
		});

		it('can issue sUSD', async () => {
			const user1BalanceBefore = await SynthsUSD.balanceOf(user1);

			const amount = toUnit('100');
			await Synthetix.issueSynths(amount, {
				from: user1,
			});

			const user1BalanceAfter = await SynthsUSD.balanceOf(user1);

			assert.bnEqual(user1BalanceAfter, user1BalanceBefore.add(amount));
		});

		it('can burn sUSD', async () => {
			await skipStakeTime({ network });

			const user1BalanceBefore = await SynthsUSD.balanceOf(user1);

			await Synthetix.burnSynths(user1BalanceBefore, {
				from: user1,
			});

			const user1BalanceAfter = await SynthsUSD.balanceOf(user1);

			assert.bnEqual(user1BalanceAfter, toUnit('0'));
		});
	});

	describe('exchanging', () => {
		addSnapshotBeforeRestoreAfter();

		it.only('can exchange sUSD to sETH', async () => {
			await skipWaitingPeriod({ network });

			const user1BalanceBeforesUSD = await SynthsUSD.balanceOf(user1);
			const user1BalanceBeforesETH = await SynthsETH.balanceOf(user1);

			const amount = toUnit('100');
			const txn = await Synthetix.exchange(toBytes32('sUSD'), amount, toBytes32('sETH'), {
				from: user1,
			});

			console.log(require('util').inspect(txn, false, null, true));

			// const user1BalanceAftersUSD = await SynthsUSD.balanceOf(user1);
			// const user1BalanceAftersETH = await SynthsETH.balanceOf(user1);

			// assert.bnEqual(user1BalanceAftersUSD, user1BalanceBeforesUSD.sub(amount));
			// assert.bnGt(user1BalanceAftersETH, user1BalanceBeforesETH);
		});

		it('can exchange sETH to sUSD', async () => {
			await skipWaitingPeriod({ network });

			const user1BalanceBeforesUSD = await SynthsUSD.balanceOf(user1);
			const user1BalanceBeforesETH = await SynthsETH.balanceOf(user1);

			await Synthetix.exchange(toBytes32('sETH'), user1BalanceBeforesETH, toBytes32('sUSD'), {
				from: user1,
			});

			const user1BalanceAftersUSD = await SynthsUSD.balanceOf(user1);
			const user1BalanceAftersETH = await SynthsETH.balanceOf(user1);

			assert.bnEqual(user1BalanceAftersETH, toUnit('0'));
			assert.bnGt(user1BalanceAftersUSD, user1BalanceBeforesUSD);
		});
	});
});
