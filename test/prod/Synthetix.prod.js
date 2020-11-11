const fs = require('fs');
const path = require('path');
const { contract, config } = require('@nomiclabs/buidler');
const { wrap } = require('../../index.js');
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
	bootstrapLocal,
	simulateExchangeRates,
	takeDebtSnapshot,
} = require('./utils');

contract('Synthetix (prod tests)', accounts => {
	const [, user1, user2] = accounts;

	let owner, oracle;

	let network, deploymentPath;

	let Synthetix, SynthetixState, AddressResolver;
	let SynthsUSD, SynthsETH;

	before('prepare', async () => {
		network = await detectNetworkName();
		const { getUsers, getPathToNetwork } = wrap({ network, fs, path });

		deploymentPath = config.deploymentPath || getPathToNetwork(network);

		[owner, , , oracle] = getUsers({ network }).map(user => user.address);

		if (network === 'local') {
			await bootstrapLocal({ deploymentPath });
		} else {
			if (config.simulateExchangeRates) {
				await ensureAccountHasEther({
					amount: toUnit('2'),
					account: oracle,
					fromAccount: accounts[7],
					network,
					deploymentPath,
				});

				await simulateExchangeRates({ deploymentPath, network, oracle });
				await takeDebtSnapshot({ deploymentPath, network });
			}
		}

		({ Synthetix, SynthetixState, SynthsUSD, SynthsETH, AddressResolver } = await connectContracts({
			network,
			deploymentPath,
			requests: [
				{ contractName: 'Synthetix' },
				{ contractName: 'SynthetixState' },
				{ contractName: 'ProxyERC20sUSD', abiName: 'Synth', alias: 'SynthsUSD' },
				{ contractName: 'ProxysETH', abiName: 'Synth', alias: 'SynthsETH' },
				{ contractName: 'AddressResolver' },
				{ contractName: 'ProxyERC20', abiName: 'Synthetix' },
			],
		}));

		await skipWaitingPeriod({ network, deploymentPath });

		await ensureAccountHasEther({
			amount: toUnit('1'),
			account: owner,
			fromAccount: accounts[7],
			network,
			deploymentPath,
		});
		await ensureAccountHassUSD({
			amount: toUnit('100'),
			account: user1,
			fromAccount: owner,
			network,
			deploymentPath,
		});
		await ensureAccountHasSNX({
			amount: toUnit('100'),
			account: user1,
			fromAccount: owner,
			network,
			deploymentPath,
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

			const amount = toUnit('10');
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
			await writeSetting({
				setting: 'setMinimumStakeTime',
				value: '60',
				owner,
				network,
				deploymentPath,
			});
		});

		it('can issue sUSD', async () => {
			const user1BalanceBefore = await SynthsUSD.balanceOf(user1);

			const amount = toUnit('10');
			await Synthetix.issueSynths(amount, {
				from: user1,
			});

			const user1BalanceAfter = await SynthsUSD.balanceOf(user1);

			assert.bnEqual(user1BalanceAfter, user1BalanceBefore.add(amount));
		});

		it('can burn sUSD', async () => {
			await skipStakeTime({ network, deploymentPath });

			const user1BalanceBefore = await SynthsUSD.balanceOf(user1);

			await Synthetix.burnSynths(user1BalanceBefore, {
				from: user1,
			});

			const user1BalanceAfter = await SynthsUSD.balanceOf(user1);

			assert.bnLt(user1BalanceAfter, user1BalanceBefore);
		});
	});

	describe('exchanging', () => {
		addSnapshotBeforeRestoreAfter();

		it('can exchange sUSD to sETH', async () => {
			await skipWaitingPeriod({ network, deploymentPath });

			const user1BalanceBeforesUSD = await SynthsUSD.balanceOf(user1);
			const user1BalanceBeforesETH = await SynthsETH.balanceOf(user1);

			const amount = toUnit('10');
			await Synthetix.exchange(toBytes32('sUSD'), amount, toBytes32('sETH'), {
				from: user1,
			});

			const user1BalanceAftersUSD = await SynthsUSD.balanceOf(user1);
			const user1BalanceAftersETH = await SynthsETH.balanceOf(user1);

			assert.bnLt(user1BalanceAftersUSD, user1BalanceBeforesUSD);
			assert.bnGt(user1BalanceAftersETH, user1BalanceBeforesETH);
		});

		it('can exchange sETH to sUSD', async () => {
			await skipWaitingPeriod({ network, deploymentPath });

			const user1BalanceBeforesUSD = await SynthsUSD.balanceOf(user1);
			const user1BalanceBeforesETH = await SynthsETH.balanceOf(user1);

			const amount = toUnit('1');
			await Synthetix.exchange(toBytes32('sETH'), amount, toBytes32('sUSD'), {
				from: user1,
			});

			const user1BalanceAftersUSD = await SynthsUSD.balanceOf(user1);
			const user1BalanceAftersETH = await SynthsETH.balanceOf(user1);

			assert.bnLt(user1BalanceAftersETH, user1BalanceBeforesETH);
			assert.bnGt(user1BalanceAftersUSD, user1BalanceBeforesUSD);
		});
	});
});
