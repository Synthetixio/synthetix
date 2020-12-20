const fs = require('fs');
const path = require('path');
const { contract, config } = require('@nomiclabs/buidler');
const { wrap } = require('../../index.js');
const { web3 } = require('@nomiclabs/buidler');
const { assert } = require('../contracts/common');
const { toUnit } = require('../utils')();
const {
	detectNetworkName,
	connectContracts,
	ensureAccountHasEther,
	ensureAccountHassUSD,
	ensureAccountHasRenBTC,
	skipWaitingPeriod,
	simulateExchangeRates,
	takeDebtSnapshot,
	mockOptimismBridge,
} = require('./utils');

const { toBytes32 } = require('../..');

contract('MultiCollateral (prod tests)', accounts => {
	const [, user1] = accounts;

	let owner;

	let network, deploymentPath;

	let CollateralManager,
		CollateralErc20,
		CollateralEth,
		CollateralShort,
		DebtCache,
		ReadProxyAddressResolver,
		// SynthsETH,
		SynthsUSD;

	before('prepare', async function() {
		network = await detectNetworkName();
		const { getUsers, getPathToNetwork } = wrap({ network, fs, path });

		owner = getUsers({ network, user: 'owner' }).address;

		deploymentPath = config.deploymentPath || getPathToNetwork(network);

		if (config.useOvm) {
			return this.skip();
		}

		if (config.patchFreshDeployment) {
			await simulateExchangeRates({ network, deploymentPath });
			await takeDebtSnapshot({ network, deploymentPath });
			await mockOptimismBridge({ network, deploymentPath });
		}

		({
			CollateralManager,
			CollateralErc20,
			CollateralEth,
			CollateralShort,
			DebtCache,
			// SynthsETH,
			SynthsUSD,
			ReadProxyAddressResolver,
		} = await connectContracts({
			network,
			requests: [
				{ contractName: 'CollateralManager' },
				{ contractName: 'CollateralErc20' },
				{ contractName: 'CollateralEth' },
				{ contractName: 'CollateralShort' },
				{ contractName: 'DebtCache' },
				{ contractName: 'ReadProxyAddressResolver' },
				{ contractName: 'SynthsETH', abiName: 'Synth' },
				{ contractName: 'SynthsUSD', abiName: 'Synth' },
			],
		}));

		await skipWaitingPeriod({ network });

		await ensureAccountHasEther({
			amount: toUnit('1'),
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
		await ensureAccountHasRenBTC({
			amount: toUnit('10'),
			account: user1,
			fromAccount: owner,
			network,
		});
	});

	describe.only('misc state', () => {
		it('has the expected resolver set', async () => {
			assert.equal(await CollateralManager.resolver(), ReadProxyAddressResolver.address);
		});

		it('CollateralManager has the expected owner set', async () => {
			assert.equal(await CollateralManager.owner(), owner);
		});

		it('CollateralErc20 hase the expected owner set', async () => {
			assert.equal(await CollateralErc20.owner(), owner);
		});

		it('CollateralEth hase the expected owner set', async () => {
			assert.equal(await CollateralEth.owner(), owner);
		});

		it('CollateralShort hase the expected owner set', async () => {
			assert.equal(await CollateralShort.owner(), owner);
		});
	});

	describe.only('ETH backed loans works and interact with the manager and the system debt properly', () => {
		let ethBalance, sUSDBalance, tx, id, systemDebtBefore;
		const oneHundressUSD = toUnit('100');
		const oneETH = toUnit('1');
		const sUSD = toBytes32('sUSD');

		before(async () => {
			ethBalance = await web3.eth.getBalance(user1);
			sUSDBalance = await SynthsUSD.balanceOf(user1);

			systemDebtBefore = (await DebtCache.currentDebt()).debt;

			tx = await CollateralEth.open(oneHundressUSD, sUSD, {
				from: user1,
				value: oneETH,
			});

			({ id } = tx.receipt.logs.find(log => log.event === 'LoanCreated').args);
		});

		it('produces a valid loan id', async () => {
			assert.notEqual(id.toString(), '0');
		});

		it('updates the managers long and total long', async () => {
			assert.bnEqual(await CollateralManager.long(sUSD), oneHundressUSD);
			assert.bnEqual((await CollateralManager.totalLong()).susdValue, oneHundressUSD);
		});

		it('the system debt is unchanged because we do not count eth collateral', async () => {
			assert.bnEqual((await DebtCache.currentDebt()).debt, systemDebtBefore);
		});

		describe('closing the loans', () => {
			before(async () => {
				// if (network === 'local') {
				// 	const amount = toUnit('1000');

				// 	const balance = await SynthsUSD.balanceOf(Depot.address);
				// 	if (balance.lt(amount)) {
				// 		await SynthsUSD.approve(Depot.address, amount, {
				// 			from: user1,
				// 		});

				// 		await Depot.depositSynths(amount, {
				// 			from: user1,
				// 		});
				// 	}
				// }

				ethBalance = await web3.eth.getBalance(user1);
				sUSDBalance = await SynthsUSD.balanceOf(user1);

				await CollateralEth.close(id, {
					from: user1,
				});
			});

			it('should increase their ETH balances', async () => {
				assert.bnGt(web3.utils.toBN(await web3.eth.getBalance(user1)), web3.utils.toBN(ethBalance));
			});

			it('should decrease their sUSD balance', async () => {
				assert.bnLt(await SynthsUSD.balanceOf(user1), sUSDBalance);
			});
		});
	});

	describe.only('renBTC loans work correctly and interact with the manager and system debt properly', async () => {
		let ethBalance, sUSDBalance, tx, id, systemDebtBefore;
		const oneHundressUSD = toUnit('100');
		const oneRenBTC = toUnit('1');
		const sUSD = toBytes32('sUSD');

		before(async () => {
			// const RENBTC = await connectContract({ network, deploymentPath, contractName: 'ProxyERC20' });

			// renBalance = await RENBTC.balanceOf(user1);
			sUSDBalance = await SynthsUSD.balanceOf(user1);

			// await RENBTC.approve(CollateralEth.address, oneRenBTC, { from: user1 });

			systemDebtBefore = (await DebtCache.currentDebt()).debt;

			tx = await CollateralErc20.open(oneRenBTC, oneHundressUSD, sUSD, {
				from: user1,
			});

			({ id } = tx.receipt.logs.find(log => log.event === 'LoanCreated').args);
		});

		it('produces a valid loan id', async () => {
			assert.notEqual(id.toString(), '0');
		});

		it('updates the managers long and total long', async () => {
			assert.bnEqual(await CollateralManager.long(sUSD), oneHundressUSD);
			assert.bnEqual((await CollateralManager.totalLong()).susdValue, oneHundressUSD);
		});

		it('the system debt is unchanged because we do not count eth collateral', async () => {
			assert.bnEqual((await DebtCache.currentDebt()).debt, systemDebtBefore);
		});

		describe('closing the loans', () => {
			before(async () => {
				// renBalance = awaist RENBTC.balanceOf(user1);
				sUSDBalance = await SynthsUSD.balanceOf(user1);

				await CollateralErc20.close(id, {
					from: user1,
				});
			});

			xit('should increase their ETH balances', async () => {
				assert.bnGt(web3.utils.toBN(await web3.eth.getBalance(user1)), web3.utils.toBN(ethBalance));
			});

			xit('should decrease their sUSD balance', async () => {
				assert.bnLt(await SynthsUSD.balanceOf(user1), sUSDBalance);
			});
		});
	});
});
