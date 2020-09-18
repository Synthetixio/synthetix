const { contract } = require('@nomiclabs/buidler');
const { getUsers } = require('../../index.js');
const { assert, addSnapshotBeforeRestoreAfter } = require('../contracts/common');
const { toUnit, fastForward } = require('../utils')();
const { toBytes32 } = require('../..');
const {
	detectNetworkName,
	connectContracts,
	getEther,
	getsUSD,
	getSNX,
	readSetting,
} = require('./utils');

contract('Synthetix (prod tests)', accounts => {
	const [, user, user1] = accounts;

	let owner;

	let network;

	let Synthetix, SynthetixState, AddressResolver;
	let SynthsUSD, SynthsETH;

	let exchangeLogs;

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

		// Skip any possibly active wwaiting periods.
		await fastForward(await readSetting({ network, setting: 'waitingPeriodSecs' }));

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
		it('can issue sUSD', async () => {
			const userBalanceBefore = await SynthsUSD.balanceOf(user);

			const amount = toUnit('100');
			await Synthetix.issueSynths(amount, {
				from: user,
			});

			const userBalanceAfter = await SynthsUSD.balanceOf(user);

			assert.bnEqual(userBalanceAfter, userBalanceBefore.add(amount));
		});

		it.skip('can burn sUSD', async () => {});
	});

	describe('exchanging', () => {
		it('can exchange sUSD to sETH', async () => {
			const userBalanceBefore_sUSD = await SynthsUSD.balanceOf(user);
			const userBalanceBefore_sETH = await SynthsETH.balanceOf(user);

			const amount = toUnit('100');
			await Synthetix.exchange(toBytes32('sUSD'), amount, toBytes32('sETH'), {
				from: user,
			});

			const userBalanceAfter_sUSD = await SynthsUSD.balanceOf(user);
			const userBalanceAfter_sETH = await SynthsETH.balanceOf(user);

			assert.bnEqual(userBalanceAfter_sUSD, userBalanceBefore_sUSD.sub(amount));
			assert.bnGt(userBalanceAfter_sETH, userBalanceBefore_sETH);
		});

		it.skip('can exchange sETH to sUSD', async () => {});
	});
});
