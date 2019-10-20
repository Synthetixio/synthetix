//const RewardsDistribution = artifacts.require('RewardsDistribution');
//const SupplySchedule = artifacts.require('SupplySchedule');

const ExchangeRates = artifacts.require('ExchangeRates');
const RewardEscrow = artifacts.require('RewardEscrow');
const FeePool = artifacts.require('FeePool');
const Depot = artifacts.require('Depot');
const Synthetix = artifacts.require('Synthetix');
const StakingPool = artifacts.require('StakingPool');
const PoolFactory = artifacts.require('StakingPoolFacotry');
const Synth = artifacts.require('Synth');
const { getWeb3, getContractInstance } = require('../utils/web3Helper');

const BN = require('bn.js');

const {
	currentTime,
	fastForward,
	fastForwardTo,
	multiplyDecimal,
	divideDecimal,
	toUnit,
	assertRevert,
	assertBNEqual,
	assertBNClose,
	ZERO_ADDRESS,
} = require('../utils/testUtils');

const getInstance = getContractInstance(web3);
const WEEK = 604800;
const YEAR = 31556926;

contract('StakingPool', async accounts => {
	const distributeSNX = async (snx, accounts, owner) => {
		accounts.forEach(async acc => {
			let amount = toUnit(1000000);
			await snx.transfer(acc, amount, { from: owner });
		});
	};

	const approveStakingPool = async (stakingPool, snx, accounts) => {
		accounts.forEach(async acc => {
			let amount = toUnit(1000000);
			await snx.approve(stakingPool.address, amount, { from: acc });
		});
	};

	const generateTradignFees = async (synthetix, accounts, synth, synthContract, feePool) => {
		for (let i = 0; i < accounts.length; i++) {
			let amount = await synthetix.maxIssuableSynths.call(accounts[i], synth);

			await synthetix.issueMaxSynths(synth, { from: accounts[i] });

			await synthContract.methods['transfer(address,uint256)'](accounts[i], amount, {
				from: accounts[i],
			});

			await closeFeePeriod();
		}
	};

	const generateRewards = async (synthetix, rewardEscrow, owner, feePoolAccount, poolAddress) => {
		await rewardEscrow.setFeePool(feePoolAccount, { from: owner });
		await synthetix.methods['transfer(address,uint256)'](RewardEscrow.address, toUnit('6000'), {
			from: owner,
		});

		// Add a few vesting entries as the feepool address
		await rewardEscrow.appendVestingEntry(poolAddress, toUnit('1000'), { from: feePoolAccount });
		await fastForward(WEEK);
		await rewardEscrow.appendVestingEntry(poolAddress, toUnit('2000'), { from: feePoolAccount });
		await fastForward(WEEK);
		await rewardEscrow.appendVestingEntry(poolAddress, toUnit('3000'), { from: feePoolAccount });
		await updateRatesWithDefaults();
	};

	const closeFeePeriod = async () => {
		const feePeriodDuration = await feePool.feePeriodDuration();
		await fastForward(feePeriodDuration);

		await feePool.closeCurrentFeePeriod({ from: account1 });

		await updateRatesWithDefaults();
	};

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

	const updateDepotRates = async (depot, oracle) => {
		const now = await currentTime();
		const usdEth = '994957049546843687330';
		//const usdSnx = '157474638738934625';
		const usdSnx = '100000000000000000';

		const txn = await depot.updatePrices(usdEth, usdSnx, now, {
			from: oracle,
		});
	};

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

	const [
		,
		owner,
		manager,
		account1,
		account2,
		account3,
		account4,
		account5,
		feePoolAccount,
	] = accounts;
	let feePool,
		oracle,
		synthetix,
		exchangeRates,
		stakingPool,
		poolFacotry,
		sUSDContract,
		sAUDContract,
		sEURContract,
		//XDRContract,
		feePoolWeb3,
		depot;
	//FEE_ADDRESS;

	//const fee = new BN('100'); // 1%
	beforeEach(async () => {
		synthetix = await Synthetix.deployed();
		rewardEscrow = await RewardEscrow.deployed();
		exchangeRates = await ExchangeRates.deployed();
		feePool = await FeePool.deployed();
		depot = await Depot.deployed();
		sUSDContract = await Synth.at(await synthetix.synths(sUSD));
		sAUDContract = await Synth.at(await synthetix.synths(sAUD));
		//sEURContract = await Synth.at(await synthetix.synths(sEUR));
		//XDRContract = await Synth.at(await synthetix.synths(XDR));

		//feePoolWeb3 = getInstance(FeePool);
		//FEE_ADDRESS = await feePool.FEE_ADDRESS();
		// Get the oracle address to send price updates when fastForwarding
		oracle = await exchangeRates.oracle();
		timestamp = await currentTime();
		//await updateRatesWithDefaults();
		// stakingPool = await StakingPool.new(
		// 	manager,
		// 	synthetix.address,
		// 	feePool.address,
		// 	rewardEscrow.address,
		// 	depot.address,
		// 	fee,
		// 	'3'
		// );

		// await distributeSNX(
		// 	synthetix,
		// 	[account1, account2, account3, account4, account5, depot.address],
		// 	owner
		// );

		// await approveStakingPool(stakingPool, synthetix, [
		// 	account1,
		// 	account2,
		// 	account3,
		// 	account4,
		// 	account5,
		// ]);
		// await updateRatesWithDefaults();
		// await updateDepotRates(depot, oracle);
	});

	describe('StakinPool Facotry works Correclty', async () => {
		beforeEach(async () => {
			let poolTarget = await StakingPool.new();
			poolFacotry = await PoolFactory.new(
				poolTarget.address,
				synthetix.address,
				feePool.address,
				rewardEscrow.address,
				depot.address
			);
		});

		it('Correctly deploys a stakingPool', async () => {
			const fee = new BN('100'); // 1%
			const delay = 60 * 60 * 24;
			tx = await poolFacotry.deployStakingPool(manager, fee, delay);
			let poolAdd = tx.receipt.logs[0].args.stakingPool;
			stakingPool = await StakingPool.at(poolAdd);
			let snx = await stakingPool.synthetix();
			let man = await stakingPool.manager();
			let fp = await stakingPool.feePool();
			let re = await stakingPool.rewardEscrow();
			let dpt = await stakingPool.depot();

			assert.equal(snx, synthetix.address);
			assert.equal(man, manager);
			assert.equal(fp, feePool.address);
			assert.equal(re, rewardEscrow.address);
			assert.equal(dpt, depot.address);
		});
	});

	describe('Staking Pool Functionality', async () => {
		const fee = new BN('100000'); // 1%
		const delay = 60 * 60 * 24;

		beforeEach(async () => {
			let poolTarget = await StakingPool.new();
			poolFacotry = await PoolFactory.new(
				poolTarget.address,
				synthetix.address,
				feePool.address,
				rewardEscrow.address,
				depot.address
			);

			tx = await poolFacotry.deployStakingPool(manager, fee, delay);
			let poolAdd = tx.receipt.logs[0].args.stakingPool;
			stakingPool = await StakingPool.at(poolAdd);

			await distributeSNX(
				synthetix,
				[account1, account2, account3, account4, account5, manager, depot.address],
				owner
			);

			await approveStakingPool(stakingPool, synthetix, [
				account1,
				account2,
				account3,
				account4,
				account5,
				manager,
			]);
		});

		// describe('Simple deposits and withdraws', async () => {
		// 	it('Deposit into the pool correctly', async () => {
		// 		const amount = toUnit(100);
		// 		const bal = await synthetix.balanceOf(account1);
		// 		await stakingPool.deposit(amount, { from: account1 });
		// 		const bal2 = await synthetix.balanceOf(account1);
		// 		const tkBalance = await synthetix.balanceOf(stakingPool.address);
		// 		assert.isTrue(tkBalance.eq(amount));
		// 	});

		// 	it('Correctly distributes liquiditytokens', async () => {
		// 		const amount1 = toUnit(90);
		// 		const amount2 = toUnit(80);
		// 		const amount3 = toUnit(70);
		// 		await stakingPool.deposit(amount1, { from: account1 });
		// 		await stakingPool.deposit(amount2, { from: account2 });
		// 		await stakingPool.deposit(amount3, { from: account3 });
		// 		let totalValue = await stakingPool.totalSNXValue.call();
		// 		let totalLiquidity = await stakingPool.totalSupply.call();

		// 		let balance1 = await stakingPool.balanceOf(account1);
		// 		let balance2 = await stakingPool.balanceOf(account2);
		// 		let balance3 = await stakingPool.balanceOf(account3);
		// 		let sum = balance1.add(balance2).add(balance3);
		// 		assert.isTrue(amount1.eq(totalValue.mul(balance1).div(totalLiquidity)));
		// 		assert.isTrue(amount2.eq(totalValue.mul(balance2).div(totalLiquidity)));
		// 		assert.isTrue(amount3.eq(totalValue.mul(balance3).div(totalLiquidity)));
		// 	});

		// 	it('Users can withdrawal their SNX', async () => {
		// 		const amount = toUnit(100);
		// 		const snxBalance = await synthetix.balanceOf(account1);
		// 		await stakingPool.deposit(amount, { from: account1 });
		// 		const bal1 = await stakingPool.balanceOf(account1);
		// 		await stakingPool.withdrawal(bal1, { from: account1 });
		// 		const bal2 = await stakingPool.balanceOf(account1);
		// 		const snxBalance2 = await synthetix.balanceOf(account1);
		// 		assertBNEqual(snxBalance, snxBalance2);
		// 		assertBNEqual(bal2, new BN('0'));
		// 	});
		//});
		// it('Users can withdrawal their SNX when there are fees to be claimed', async () => {
		// 	const amount = toUnit(100);
		// 	const snxBalance = await synthetix.balanceOf(account1);
		// 	await stakingPool.deposit(amount, { from: account1 });
		// 	const bal1 = await sUSDContract.balanceOf(account1);
		// 	console.log('here');

		// 	await stakingPool.issueSynths(sAUD, '10000', { from: manager });
		// 	console.log(1111);
		// 	await generateTradignFees(synthetix, [account4, account5], sUSD, sUSDContract, feePool);
		// 	console.log(4444);
		// 	await stakingPool.claimFees({ from: manager });
		// 	console.log(555);
		// 	await stakingPool.withdrawal(amount, { from: account1 });
		// 	console.log(77);
		// 	const bal2 = await sUSDContract.balanceOf(account1);
		// 	const snxBalance2 = await synthetix.balanceOf(account1);
		// 	//Not sure how to deal with variance in balances
		// 	console.log(bal1.toString());
		// 	console.log(bal2.toString());
		// 	//assert.fail();
		// });

		// describe('Manager Functions', async () => {
		// 	beforeEach(async () => {
		// 		await updateRatesWithDefaults();
		// 		const amount1 = toUnit(900);
		// 		const amount2 = toUnit(800);
		// 		const amount3 = toUnit(700);
		// 		await stakingPool.deposit(amount1, { from: account1 });
		// 		await stakingPool.deposit(amount2, { from: account2 });
		// 		await stakingPool.deposit(amount3, { from: account3 });
		// 	});
		// 	it('The pool manager can correctly issue Synths', async () => {
		// 		await stakingPool.issueSynths(sUSD, '10', { from: manager });
		// 		let debt = await synthetix.debtBalanceOf(stakingPool.address, sUSD);
		// 		let sUSDBalance = await sUSDContract.balanceOf(stakingPool.address);

		// 		assert.isTrue(debt.eq(sUSDBalance));
		// 	});

		// 	it('The pool manager can correctly issue maxSynths', async () => {
		// 		await stakingPool.issueMaxSynths(sUSD, { from: manager });
		// 		let debt = await synthetix.debtBalanceOf(stakingPool.address, sUSD);
		// 		let sUSDBalance = await sUSDContract.balanceOf(stakingPool.address);

		// 		assert.equal(debt.divRound(sUSDBalance).toString(), '1');
		// 	});

		// 	it('The pool manager can correctly burn synths', async () => {
		// 		await stakingPool.issueSynths(sUSD, '10', { from: manager });
		// 		await stakingPool.burnSynths(sUSD, '10', { from: manager });

		// 		let debt = await synthetix.debtBalanceOf.call(stakingPool.address, sUSD);
		// 		let sUSDBalance = await sUSDContract.balanceOf(stakingPool.address);

		// 		assert.isTrue(debt.eq(sUSDBalance));
		// 		assert.isTrue(debt.isZero());
		// 	});

		// 	it('The pool manager can collect fees', async () => {
		// 		await stakingPool.issueSynths(sAUD, '10000', { from: manager });

		// 		await generateTradignFees(synthetix, [account4, account5], sUSD, sUSDContract, feePool);

		// 		await updateRatesWithDefaults();

		// 		let balance1 = await synthetix.balanceOf(stakingPool.address);
		// 		let feesAvailable = await feePool.feesAvailable(stakingPool.address, SNX);
		// 		await updateDepotRates(depot, oracle);

		// 		await stakingPool.claimFees({ from: manager });
		// 		let balance2 = await synthetix.balanceOf(stakingPool.address);
		// 		let managerFees = feesAvailable[0].mul(fee).div(new BN('100000'));
		// 		assertBNClose(balance1.add(feesAvailable[0].sub(managerFees)), balance2);
		// 	});

		// 	it('The pool manager can collect Rewards', async () => {
		// 		await stakingPool.issueSynths(sAUD, '100', { from: manager });
		// 		await generateRewards(synthetix, rewardEscrow, owner, feePoolAccount, stakingPool.address);
		// 		await fastForward(YEAR + WEEK * 3);
		// 		await updateRatesWithDefaults();
		// 		const bal = await rewardEscrow.balanceOf(stakingPool.address);

		// 		const snxBalance1 = await synthetix.balanceOf(stakingPool.address);
		// 		await stakingPool.vest({ from: manager });
		// 		const snxBalance2 = await synthetix.balanceOf(stakingPool.address);

		// 		assertBNEqual(snxBalance2, snxBalance1.add(bal));
		// 	});

		// 	it('Pool manager can exchange between synths', async () => {
		// 		let max = await synthetix.maxIssuableSynths(stakingPool.address, sUSD);
		// 		const amountIssued = max.div(new BN('2'));
		// 		await stakingPool.issueSynths(sUSD, amountIssued, { from: manager });

		// 		const exchangeFeeUSD = await feePool.exchangeFeeIncurred(amountIssued);
		// 		const exchangeFeeXDR = await synthetix.effectiveValue(sUSD, exchangeFeeUSD, XDR);

		// 		// Exchange sUSD to sAUD
		// 		await stakingPool.exchange(sUSD, amountIssued, sAUD, { from: manager });

		// 		// how much sAUD the user is supposed to get
		// 		const effectiveValue = await synthetix.effectiveValue(sUSD, amountIssued, sAUD);

		// 		// chargeFee = true so we need to minus the fees for this exchange
		// 		const effectiveValueMinusFees = await feePool.amountReceivedFromExchange(effectiveValue);

		// 		// Assert we have the correct AUD value - exchange fee
		// 		const sAUDBalance = await sAUDContract.balanceOf(stakingPool.address);
		// 		assert.isTrue(effectiveValueMinusFees.eq(sAUDBalance));
		// 	});
		// });

		describe('Pool can correctly calculate overall value', async () => {
			const depositedAmount = toUnit('10000');
			const issuedAmount = toUnit('50');

			beforeEach(async () => {
				await updateRatesWithDefaults();
				const amount4 = toUnit(900);
				const amount5 = toUnit(800);

				await stakingPool.deposit(amount4, { from: account4 });
				await stakingPool.deposit(amount5, { from: account5 });
				await stakingPool.issueSynths(sAUD, issuedAmount, { from: manager });
			});

			it('Can track value when there are fees to be claimed', async () => {
				await updateDepotRates(depot, oracle);
				let initialValue = await stakingPool.totalSNXValue();

				await generateTradignFees(synthetix, [account1, account2], sUSD, sUSDContract, feePool);
				const feesAvailable = await feePool.feesAvailable(stakingPool.address, sUSD);

				let intermediaryValue = await stakingPool.totalSNXValue();

				await updateDepotRates(depot, oracle);
				await stakingPool.claimFees({ from: manager });

				let finalValue = await stakingPool.totalSNXValue();
				console.log(initialValue.toString());
				console.log(intermediaryValue.toString());
				console.log(finalValue.toString());
				console.log(feesAvailable[0].toString());

				let manBal = await stakingPool.balanceOf(manager);
				await stakingPool.withdrawal(manBal, { from: manager });

				let endValue = await stakingPool.totalSNXValue();
				console.log(endValue.toString());

				let newValue = await depot.synthetixReceivedForSynths(feesAvailable[0]);
				let managerFees = newValue.mul(fee).div(new BN('100000'));

				assertBNEqual(endValue, initialValue);
				assertBNClose(finalValue, intermediaryValue);
				assertBNClose(initialValue.add(newValue), finalValue);
			});

			// it('Can track value when there are rewards to be claimed', async () => {
			// 	let initialValue = await stakingPool.totalSNXValue();
			// 	await generateRewards(synthetix, rewardEscrow, owner, feePoolAccount, stakingPool.address);
			// 	const bal = await rewardEscrow.totalEscrowedAccountBalance(stakingPool.address);

			// 	await fastForward(YEAR + WEEK * 3);
			// 	await updateRatesWithDefaults();

			// 	let intermediaryValue = await stakingPool.totalSNXValue();

			// 	await stakingPool.vest({ from: manager });

			// 	let finalValue = await stakingPool.totalSNXValue();
			// 	assertBNEqual(finalValue, intermediaryValue);
			// 	assertBNEqual(initialValue.add(bal), finalValue);
			// });
		});
	});

	// describe('Liquidity Tokens should adhere to ERC20 standard', async () => {
	// 	const amount1 = toUnit(90);
	// 	const amount2 = toUnit(80);
	// 	const amount3 = toUnit(70);
	// 	beforeEach(async () => {
	// 		await stakingPool.deposit(amount1, { from: account1 });
	// 		await stakingPool.deposit(amount2, { from: account2 });
	// 		await stakingPool.deposit(amount3, { from: account3 });
	// 	});
	// 	it('should be able to query ERC20 totalSupply', async () => {
	// 		const tSupply = await stakingPool.totalSupply();
	// 		assertBNEqual(tSupply, amount1.add(amount2).add(amount3));
	// 	});

	// 	it('should be able to query ERC20 balanceOf', async () => {
	// 		const balance = await stakingPool.balanceOf(account1);
	// 		assertBNEqual(balance, amount1);
	// 	});

	// 	it('should be able to call ERC20 approve', async () => {
	// 		const amountToTransfer = toUnit('50');

	// 		// Approve Account2 to spend 50
	// 		const approveTX = await stakingPool.approve(account2, amountToTransfer, {
	// 			from: account1,
	// 		});

	// 		// should be able to query ERC20 allowance
	// 		const allowance = await stakingPool.allowance(account1, account2);

	// 		// Assert we have the same
	// 		assertBNEqual(allowance, amountToTransfer);
	// 	});

	// 	it('should be able to call ERC20 transferFrom', async () => {
	// 		const amountToTransfer = toUnit('33');

	// 		// Approve Account2 to spend 50
	// 		await stakingPool.approve(account2, amountToTransfer, { from: account1 });

	// 		// Get Before Transfer Balances
	// 		const account1BalanceBefore = await stakingPool.balanceOf(account1);
	// 		const account3BalanceBefore = await stakingPool.balanceOf(account3);

	// 		// Transfer SNX
	// 		const transferTX = await stakingPool.methods['transferFrom(address,address,uint256)'](
	// 			account1,
	// 			account3,
	// 			amountToTransfer,
	// 			{
	// 				from: account2,
	// 			}
	// 		);

	// 		// Get After Transfer Balances
	// 		const account1BalanceAfter = await stakingPool.balanceOf(account1);
	// 		const account3BalanceAfter = await stakingPool.balanceOf(account3);

	// 		// Check Balances
	// 		assertBNEqual(account1BalanceBefore.sub(amountToTransfer), account1BalanceAfter);
	// 		assertBNEqual(account3BalanceBefore.add(amountToTransfer), account3BalanceAfter);
	// 	});

	// 	it('should be able to call ERC20 transfer', async () => {
	// 		const amountToTransfer = toUnit('44');

	// 		// Get Before Transfer Balances
	// 		const account1BalanceBefore = await stakingPool.balanceOf(account1);
	// 		const account2BalanceBefore = await stakingPool.balanceOf(account2);

	// 		// Transfer SNX
	// 		await stakingPool.methods['transfer(address,uint256)'](account2, amountToTransfer, {
	// 			from: account1,
	// 		});

	// 		// Get After Transfer Balances
	// 		const account1BalanceAfter = await stakingPool.balanceOf(account1);
	// 		const account2BalanceAfter = await stakingPool.balanceOf(account2);

	// 		// Check Balances
	// 		assertBNEqual(account1BalanceBefore.sub(amountToTransfer), account1BalanceAfter);
	// 		assertBNEqual(account2BalanceBefore.add(amountToTransfer), account2BalanceAfter);
	// 	});
	// });

	// describe('Fees and Delays', async () => {
	// 	// beforeEach(async () => {
	// 	// 	await updateRatesWithDefaults();
	// 	// });
	// 	it("Fees can't finalize if they aren't set", async () => {
	// 		await assertRevert(stakingPool.finalizeFee());
	// 	});
	// 	it('Manager can set fee', async () => {
	// 		const newFee = '500'; //5%
	// 		await stakingPool.setFee(newFee, { from: manager });
	// 		await fastForward(WEEK);
	// 		await updateRatesWithDefaults();
	// 		//confirm new Fee
	// 		await stakingPool.finalizeFee();

	// 		let sp_fee = await stakingPool.fee();
	// 		assertBNEqual(sp_fee, newFee);
	// 	});

	// 	it('Fees cant have an effect prematurely', async () => {
	// 		let dddf = await stakingPool.delay();
	// 		const newFee = '500'; //5%
	// 		await stakingPool.setFee(newFee, { from: manager });
	// 		await assertRevert(stakingPool.finalizeFee());
	// 	});

	// 	it("Delays can't finalize if they aren't set", async () => {
	// 		await assertRevert(stakingPool.finalizeDelay());
	// 	});

	// 	it('Manager can set delay', async () => {
	// 		const newDelay = '5'; //5 days
	// 		await stakingPool.setDelay(newDelay, { from: manager });
	// 		await fastForward(WEEK);
	// 		await updateRatesWithDefaults();
	// 		//confirm new Fee
	// 		await stakingPool.finalizeDelay();

	// 		let sp_delay = await stakingPool.delay();
	// 		//secs * minutes * hours
	// 		assertBNEqual(sp_delay, newDelay * 60 * 60 * 24);
	// 	});

	// 	it('Delays cant have an effect prematurely', async () => {
	// 		const newDelay = '5'; //5 days
	// 		await stakingPool.setDelay(newDelay, { from: manager });
	// 		await assertRevert(stakingPool.finalizeDelay());
	// 	});
	// });
});
