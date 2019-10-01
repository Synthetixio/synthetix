const ExchangeRates = artifacts.require('ExchangeRates');
const RewardEscrow = artifacts.require('RewardEscrow');
const RewardsDistribution = artifacts.require('RewardsDistribution');
const FeePool = artifacts.require('FeePool');
const SupplySchedule = artifacts.require('SupplySchedule');
const Synthetix = artifacts.require('Synthetix');
const StakingPool = artifacts.require('StakingPool');
const Synth = artifacts.require('Synth');
const { getWeb3, getContractInstance } = require('../utils/web3Helper');

const {
	currentTime,
	fastForward,
	fastForwardTo,
	multiplyDecimal,
	divideDecimal,
	toUnit,
	ZERO_ADDRESS,
} = require('../utils/testUtils');
const getInstance = getContractInstance(web3);

const assertBNEqual = (actualBN, expectedBN, context) => {
	assert.equal(actualBN.toString(), expectedBN.toString(), context);
};

const distributeSNX = async (snx, accounts, owner) => {
	accounts.forEach(async acc => {
		let amount = toUnit(10000);
		await snx.transfer(acc, amount, { from: owner });
	});
};

const approveStakingPool = async (stakingPool, snx, accounts) => {
	accounts.forEach(async acc => {
		let amount = toUnit(10000);
		await snx.approve(stakingPool.address, amount, { from: acc });
	});
};

contract('StakingPool', async accounts => {
	const [sUSD, sAUD, sEUR, SNX, XDR, sXYZ, sBTC, iBTC] = [
		'sUSD',
		'sAUD',
		'sEUR',
		'SNX',
		'XDR',
		'sXYZ',
		'sBTC',
		'iBTC',
	].map(web3.utils.asciiToHex);

	const [, owner, manager, account1, account2, account3, account4, account5] = accounts;
	let feePool,
		oracle,
		synthetix,
		exchangeRates,
		stakingPool,
		sUSDContract,
		sAUDContract,
		sEURContract,
		XDRContract,
		feePoolWeb3,
		FEE_ADDRESS;

	const updateRatesWithDefaults = async () => {
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX, sBTC, iBTC],
			['0.5', '1.25', '0.1', 5000, 4000].map(toUnit),
			timestamp,
			{
				from: oracle,
			}
		);
	};

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		synthetix = await Synthetix.deployed();
		rewardEscrow = await RewardEscrow.deployed();
		exchangeRates = await ExchangeRates.deployed();
		feePool = await FeePool.deployed();
		sUSDContract = await Synth.at(await synthetix.synths(sUSD));
		sAUDContract = await Synth.at(await synthetix.synths(sAUD));
		sEURContract = await Synth.at(await synthetix.synths(sEUR));
		XDRContract = await Synth.at(await synthetix.synths(XDR));

		feePoolWeb3 = getInstance(FeePool);
		FEE_ADDRESS = await feePool.FEE_ADDRESS();
		// Get the oracle address to send price updates when fastForwarding
		oracle = await exchangeRates.oracle();
		timestamp = await currentTime();

		stakingPool = await StakingPool.new(manager, synthetix.address, feePool.address);
		await distributeSNX(synthetix, [account1, account2, account3, account4, account5], owner);
		await approveStakingPool(stakingPool, synthetix, [
			account1,
			account2,
			account3,
			account4,
			account5,
		]);
	});

	it('Deploys with correct state', async () => {
		let snx = await stakingPool.snx();
		let man = await stakingPool.manager();
		let fp = await stakingPool.feePool();

		assert.equal(snx, synthetix.address);
		assert.equal(man, manager);
		assert.equal(fp, feePool.address);
	});

	it('Deposit into the pool correctly', async () => {
		const amount = toUnit(100);
		const bal = await synthetix.balanceOf(account1);
		await stakingPool.deposit(amount, { from: account1 });
		const bal2 = await synthetix.balanceOf(account1);
		const tkBalance = await synthetix.balanceOf(stakingPool.address);
		assert.isTrue(tkBalance.eq(amount));
	});

	it('Correctly distributes liquiditytokens', async () => {
		const amount1 = toUnit(90);
		const amount2 = toUnit(80);
		const amount3 = toUnit(70);
		await stakingPool.deposit(amount1, { from: account1 });
		await stakingPool.deposit(amount2, { from: account2 });
		await stakingPool.deposit(amount3, { from: account3 });
		let totalValue = await stakingPool.totalSNXValue.call();
		let totalLiquidity = await stakingPool.totalSupply.call();

		let balance1 = await stakingPool.balanceOf(account1);
		let balance2 = await stakingPool.balanceOf(account2);
		let balance3 = await stakingPool.balanceOf(account3);
		let sum = balance1.add(balance2).add(balance3);
		assert.isTrue(amount1.eq(totalValue.mul(balance1).div(totalLiquidity)));
		assert.isTrue(amount2.eq(totalValue.mul(balance2).div(totalLiquidity)));
		assert.isTrue(amount3.eq(totalValue.mul(balance3).div(totalLiquidity)));
	});

	it('The pool manager can correctly issue Synths', async () => {
		const amount1 = toUnit(90);
		const amount2 = toUnit(80);
		const amount3 = toUnit(70);
		await stakingPool.deposit(amount1, { from: account1 });
		await stakingPool.deposit(amount2, { from: account2 });
		await stakingPool.deposit(amount3, { from: account3 });

		await stakingPool.issueSynths(sUSD, '10', { from: manager });
		let debt = await synthetix.debtBalanceOf(stakingPool.address, sUSD);
		let sUSDBalance = await sUSDContract.balanceOf(stakingPool.address);

		assert.isTrue(debt.eq(sUSDBalance));
	});

	it('The pool manager can correctly issue maxSynths', async () => {
		const amount1 = toUnit(90);

		await stakingPool.deposit(amount1, { from: account1 });

		await stakingPool.issueMaxSynths(sUSD, { from: manager });
		let debt = await synthetix.debtBalanceOf(stakingPool.address, sUSD);
		let sUSDBalance = await sUSDContract.balanceOf(stakingPool.address);

		assert.equal(debt.divRound(sUSDBalance).toString(), '1');
	});

	it('The pool manager can correctly burn synths', async () => {
		const amount1 = toUnit(90);
		await stakingPool.deposit(amount1, { from: account1 });
		await stakingPool.issueSynths(sUSD, '10', { from: manager });
		await stakingPool.burnSynths(sUSD, '10', { from: manager });

		let debt = await synthetix.debtBalanceOf.call(stakingPool.address, sUSD);
		let sUSDBalance = await sUSDContract.balanceOf(stakingPool.address);

		assert.isTrue(debt.eq(sUSDBalance));
		assert.isTrue(debt.isZero());
	});
	const closeFeePeriod = async () => {
		const feePeriodDuration = await feePool.feePeriodDuration();

		await fastForward(feePeriodDuration);

		await feePool.closeCurrentFeePeriod({ from: account1 });

		await updateRatesWithDefaults();
	};

	const generateFees = async accs => {
		const length = (await feePool.FEE_PERIOD_LENGTH()).toNumber();
		await closeFeePeriod();
		await synthetix.issueSynths(sAUD, toUnit('10000'), { from: owner });
		await stakingPool.issueSynths(sAUD, '10000', { from: manager });
		// await synthetix.issueSynths(sAUD, toUnit('10000'), { from: accs[0] });
		// await synthetix.issueSynths(sAUD, toUnit('10000'), { from: accs[1] });

		// For each fee period (with one extra to test rollover), do two transfers, then close it off.
		//for (let i = 0; i <= length; i++) {
		const transfer1 = toUnit((1 * 10).toString());
		const transfer2 = toUnit((1 * 15).toString());
		await sAUDContract.methods['transfer(address,uint256)'](accs[0], transfer1, { from: owner });
		await sAUDContract.methods['transfer(address,uint256)'](accs[1], transfer2, { from: owner });

		let totalFees = await feePool.amountReceivedFromTransfer(transfer1);
		console.log('total', totalFees.toString());

		let Ta = await feePool.totalFeesAvailable.call(XDR);
		console.log(Ta.toString());

		await closeFeePeriod();
		//}
	};

	it('The pool manager can collect fees', async () => {
		// const amount1 = toUnit(90);
		// await stakingPool.deposit(amount1, { from: account1 });
		// console.log('Start');
		// await stakingPool.issueSynths(sAUD, '10000', { from: manager });
		// await synthetix.issueSynths(sAUD, toUnit('10000'), { from: owner });
		// console.log('issues done');
		// await closeFeePeriod();
		// console.log('closed');
		// await sAUDContract.methods['transfer(address,uint256)'](account1, toUnit('10000'), {
		// 	from: owner,
		// });
		// console.log('trasndered');
		// const fee = await XDRContract.balanceOf(FEE_ADDRESS);
		// console.log('fee: ', fee.toString());
		// const pendingFees = await feePoolWeb3.methods.feesByPeriod(stakingPool.address).call();
		// console.log('Pending fees', pendingFees);
		// //await generateFees([account5, account4]);
		// const fee3 = await XDRContract.balanceOf(FEE_ADDRESS);
		// console.log('fee', fee3.toString());
		// const feesAvailable = await feePool.feesAvailable(owner, XDR);
		// console.log('FA', feesAvailable);
		// const oldXDRBalance = await XDRContract.balanceOf(stakingPool.address);
		// // Now we should be able to claim them.
		// //const claimFeesTx = await stakingPool.claimFees(XDR, { from: manager });
		// await closeFeePeriod();
		// const feesByPeriod = await feePoolWeb3.methods.feesByPeriod(owner).call();
		// console.log('after closing, ', feesByPeriod);
		// const newXDRBalance = await XDRContract.balanceOf(stakingPool.address);
		// // We should have our fees
		// assert.bnEqual(newXDRBalance, oldXDRBalance.add(feesAvailable[0]));
	});

	it('Pool manager can exchange between synths', async () => {
		const amount1 = toUnit(90);
		await stakingPool.deposit(amount1, { from: account1 });
		console.log('here');

		await stakingPool.issueSynths(sUSD, '10', { from: manager });
		console.log(1);

		await stakingPool.issueSynths(sAUD, '10', { from: manager });
		console.log(2);

		await synthetix.issueSynths(sUSD, '10', { from: owner });
		console.log(1);

		await synthetix.issueSynths(sAUD, '10', { from: owner });
		console.log(2);
		await synthetix.exchange(sUSD, '1', sAUD, stakingPool.address);

		await stakingPool.exchange(sUSD, '1', sAUD, stakingPool.address);
	});
});
