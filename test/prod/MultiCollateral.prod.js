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
		let tx, id, systemDebtBefore, longBefore, totalLongBefore;
		const tensUSD = toUnit('10');
		const hundredEth = toUnit('100');
		const sUSD = toBytes32('sUSD');

		before(async () => {
			systemDebtBefore = (await DebtCache.currentDebt()).debt;
			longBefore = await CollateralManager.long(sUSD);
			totalLongBefore = (await CollateralManager.totalLong()).susdValue;

			tx = await CollateralEth.open(tensUSD, sUSD, {
				from: user1,
				value: hundredEth,
			});

			({ id } = tx.receipt.logs.find(log => log.event === 'LoanCreated').args);
		});

		it('produces a valid loan id', async () => {
			assert.notEqual(id.toString(), '0');
		});

		it('updates the managers long and total long', async () => {
			assert.bnGt(await CollateralManager.long(sUSD), longBefore);
			assert.bnGt((await CollateralManager.totalLong()).susdValue, totalLongBefore);
		});

		it('the system debt is unchanged because we do not count eth collateral', async () => {
			assert.bnEqual((await DebtCache.currentDebt()).debt, systemDebtBefore);
		});
	});

	describe('renBTC loans work correctly and interact with the manager and system debt properly', async () => {
		let tx, id, longBefore, totalLongBefore;
		const oneHundressUSD = toUnit('100');
		const oneRenBTC = 100000000;
		const sUSD = toBytes32('sUSD');
		const renbtc = '0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D';
		const renHolder = '0x53463cd0b074E5FDafc55DcE7B1C82ADF1a43B2E';

		it('on mainnet it works properly', async () => {
			if (network === 'mainnet') {
				const RENBTC = await artifacts.require('ERC20').at(renbtc);

				longBefore = await CollateralManager.long(sUSD);
				totalLongBefore = (await CollateralManager.totalLong()).susdValue;

				await RENBTC.approve(CollateralErc20.address, oneRenBTC, { from: renHolder });

				tx = await CollateralErc20.open(oneRenBTC, oneHundressUSD, sUSD, {
					from: renHolder,
				});

				({ id } = tx.receipt.logs.find(log => log.event === 'LoanCreated').args);
				assert.notEqual(id.toString(), '0');

				assert.bnGt(await CollateralManager.long(sUSD), longBefore);
				assert.bnGt((await CollateralManager.totalLong()).susdValue, totalLongBefore);
			}
		});
	});

	describe('sUSD shorts work correctly and interact with the manager and system debt properly', async () => {
		let tx, id, shortBefore, totalShortBefore;
		const oneThousandsUSD = toUnit('1000');
		const sETH = toBytes32('sETH');
		const shortAmount = toUnit('0.5');

		before(async () => {
			await SynthsUSD.approve(CollateralShort.address, oneThousandsUSD, { from: user1 });

			shortBefore = await CollateralManager.short(sETH);
			totalShortBefore = (await CollateralManager.totalShort()).susdValue;

			tx = await CollateralShort.open(oneThousandsUSD, shortAmount, sETH, {
				from: user1,
			});

			({ id } = tx.receipt.logs.find(log => log.event === 'LoanCreated').args);
		});

		it('produces a valid loan id', async () => {
			assert.notEqual(id.toString(), '0');
		});

		it('updates the managers short and total short', async () => {
			assert.bnGt(await CollateralManager.short(sETH), shortBefore);
			assert.bnGt((await CollateralManager.totalShort()).susdValue, totalShortBefore);
		});
	});
});
