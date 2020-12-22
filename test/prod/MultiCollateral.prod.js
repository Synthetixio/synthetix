const fs = require('fs');
const path = require('path');
const { contract, config, artifacts } = require('@nomiclabs/buidler');
const { wrap } = require('../../index.js');
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
	implementsMultiCollateral,
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

		if (!(await implementsMultiCollateral({ network, deploymentPath }))) {
			this.skip();
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

	describe('misc state', () => {
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

	describe('ETH backed loans works and interacted with the manager and the system debt properly', () => {
		let tx, id, systemDebtBefore;
		const oneHundressUSD = toUnit('100');
		const oneETH = toUnit('1');
		const sUSD = toBytes32('sUSD');

		before(async () => {
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
	});

	describe('renBTC loans work correctly and interact with the manager and system debt properly', async () => {
		let tx, id, systemDebtBefore;
		const oneHundressUSD = toUnit('100');
		const oneRenBTC = toUnit('1');
		const sUSD = toBytes32('sUSD');
		const renbtc = '0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D';

		before(async () => {
			const RENBTC = await artifacts.require('ERC20').at(renbtc);

			await RENBTC.approve(CollateralErc20.address, oneRenBTC, { from: user1 });

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
	});

	describe('sUSD shorts work correctly and interact with the manager and system debt properly', async () => {
		let tx, id, systemDebtBefore;
		const oneThousandsUSD = toUnit('1000');
		const sETH = toBytes32('sETH');
		const shortAmount = toUnit('200');

		before(async () => {
			await SynthsUSD.approve(CollateralShort.address, oneThousandsUSD, { from: user1 });

			systemDebtBefore = (await DebtCache.currentDebt()).debt;

			tx = await CollateralShort.open(oneThousandsUSD, shortAmount, sETH, {
				from: user1,
			});

			({ id } = tx.receipt.logs.find(log => log.event === 'LoanCreated').args);
		});

		it('produces a valid loan id', async () => {
			assert.notEqual(id.toString(), '0');
		});

		it('updates the managers long and total long', async () => {
			assert.bnEqual(await CollateralManager.short(sETH), shortAmount);
			assert.bnEqual((await CollateralManager.totalShort()).susdValue, shortAmount);
		});

		it('the system debt is unchanged because we do not count eth collateral', async () => {
			assert.bnEqual((await DebtCache.currentDebt()).debt, systemDebtBefore);
		});
	});
});
