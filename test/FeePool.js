const DelegateApprovals = artifacts.require('DelegateApprovals');
const ExchangeRates = artifacts.require('ExchangeRates');
const FeePool = artifacts.require('FeePool');
const FeePoolProxy = artifacts.require('FeePool');
const FeePoolState = artifacts.require('FeePoolState');
const Synthetix = artifacts.require('Synthetix');
const SynthetixState = artifacts.require('SynthetixState');
const Synth = artifacts.require('Synth');
const RewardEscrow = artifacts.require('RewardEscrow');
const { getWeb3, getContractInstance } = require('../utils/web3Helper');

const {
	currentTime,
	fastForward,
	toUnit,
	toPreciseUnit,
	ZERO_ADDRESS,
	fromUnit,
	multiplyDecimal,
} = require('../utils/testUtils');
const web3 = getWeb3();
const getInstance = getContractInstance(web3);

contract('FeePool', async accounts => {
	// Updates rates with defaults so they're not stale.
	const updateRatesWithDefaults = async () => {
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX, sBTC, iBTC],
			['0.5', '1.25', '0.1', '5000', '4000'].map(toUnit),
			timestamp,
			{
				from: oracle,
			}
		);
	};

	const closeFeePeriod = async () => {
		const feePeriodDuration = await feePool.feePeriodDuration();
		await fastForward(feePeriodDuration);
		await feePool.closeCurrentFeePeriod({ from: account1 });
		await updateRatesWithDefaults();
	};

	async function getFeesAvailable(account, key) {
		const result = await feePool.feesAvailable(account, key);
		return result[0];
	}

	// const logFeePeriods = async () => {
	// 	const length = (await feePool.FEE_PERIOD_LENGTH()).toNumber();

	// 	console.log('------------------');
	// 	for (let i = 0; i < length; i++) {
	// 		console.log(`Fee Period [${i}]:`);
	// 		const period = await feePool.recentFeePeriods(i);

	// 		for (const key of Object.keys(period)) {
	// 			if (isNaN(parseInt(key))) {
	// 				console.log(`  ${key}: ${period[key]}`);
	// 			}
	// 		}

	// 		console.log();
	// 	}
	// 	console.log('------------------');
	// };

	// CURRENCIES
	const [sUSD, sAUD, sEUR, sBTC, SNX, XDR, iBTC] = [
		'sUSD',
		'sAUD',
		'sEUR',
		'sBTC',
		'SNX',
		'XDR',
		'iBTC',
	].map(web3.utils.asciiToHex);

	const [
		deployerAccount,
		owner,
		oracle,
		rewardsAuthority,
		account1,
		account2,
		account3,
		account4,
		account5,
	] = accounts;

	let feePool,
		feePoolProxy,
		feePoolWeb3,
		FEE_ADDRESS,
		synthetix,
		synthetixState,
		exchangeRates,
		feePoolState,
		delegates,
		rewardEscrow,
		sUSDContract,
		sAUDContract,
		XDRContract;

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		exchangeRates = await ExchangeRates.deployed();
		feePoolState = await FeePoolState.deployed();
		feePool = await FeePool.deployed();
		feePoolProxy = await FeePoolProxy.deployed();
		delegates = await DelegateApprovals.deployed();
		rewardEscrow = await RewardEscrow.deployed();
		feePoolWeb3 = getInstance(FeePool);
		FEE_ADDRESS = await feePool.FEE_ADDRESS();

		synthetix = await Synthetix.deployed();
		synthetixState = await SynthetixState.at(await synthetix.synthetixState());

		sUSDContract = await Synth.at(await synthetix.synths(sUSD));
		sAUDContract = await Synth.at(await synthetix.synths(sAUD));
		XDRContract = await Synth.at(await synthetix.synths(XDR));

		// Send a price update to guarantee we're not stale.
		await updateRatesWithDefaults();
	});

	it('should set constructor params on deployment', async () => {
		const exchangeFeeRate = toUnit('0.0030');

		// constructor(address _proxy, address _owner, Synthetix _synthetix, FeePoolState _feePoolState, FeePoolEternalStorage _feePoolEternalStorage, ISynthetixState _synthetixState, ISynthetixEscrow _rewardEscrow, uint _exchangeFeeRate)
		const instance = await FeePool.new(
			account1, // proxy
			account2, // owner
			account3, // synthetix
			account4, // feePoolState
			account5, // feePoolEternalStorage
			synthetixState.address, // synthetixState
			rewardEscrow.address,
			rewardsAuthority,
			exchangeFeeRate,
			{
				from: deployerAccount,
			}
		);

		assert.equal(await instance.proxy(), account1);
		assert.equal(await instance.owner(), account2);
		assert.equal(await instance.synthetix(), account3);
		assert.equal(await instance.feePoolState(), account4);
		assert.equal(await instance.feePoolEternalStorage(), account5);
		assert.equal(await instance.synthetixState(), synthetixState.address);
		assert.equal(await instance.rewardsAuthority(), rewardsAuthority);
		assert.bnEqual(await instance.exchangeFeeRate(), exchangeFeeRate);
		assert.equal(await instance.rewardEscrow(), rewardEscrow.address);

		// Assert that our first period is open.
		assert.deepEqual(await instance.recentFeePeriods(0), {
			feePeriodId: 1,
			startingDebtIndex: 0,
			feesToDistribute: 0,
			feesClaimed: 0,
		});

		// And that the second period is not yet open
		assert.deepEqual(await instance.recentFeePeriods(1), {
			feePeriodId: 0,
			startTime: 0,
			startingDebtIndex: 0,
			feesToDistribute: 0,
			feesClaimed: 0,
		});
	});

	it('should allow the owner to set the exchange fee rate', async () => {
		const exchangeFeeRate = await feePool.exchangeFeeRate();
		const newFeeRate = exchangeFeeRate.add(toUnit('0.001'));

		await feePool.setExchangeFeeRate(newFeeRate, {
			from: owner,
		});

		assert.bnEqual(await feePool.exchangeFeeRate(), newFeeRate);
	});

	it('should disallow a non-owner from setting the exchange fee rate', async () => {
		await assert.revert(
			feePool.setExchangeFeeRate(toUnit('0'), {
				from: account1,
			})
		);
	});

	it('should allow the owner to set the fee period duration', async () => {
		// Assert that we're starting with the state we expect
		const oneWeek = web3.utils.toBN(7 * 24 * 60 * 60);
		const twoWeeks = oneWeek.mul(web3.utils.toBN(2));
		assert.bnEqual(await feePool.feePeriodDuration(), oneWeek);

		const transaction = await feePool.setFeePeriodDuration(twoWeeks, {
			from: owner,
		});

		assert.eventEqual(transaction, 'FeePeriodDurationUpdated', { newFeePeriodDuration: twoWeeks });
		assert.bnEqual(await feePool.feePeriodDuration(), twoWeeks);
	});

	it('should disallow a non-owner from setting the fee period duration', async () => {
		const oneWeek = web3.utils.toBN(7 * 24 * 60 * 60);
		const twoWeeks = oneWeek.mul(web3.utils.toBN(2));
		assert.bnEqual(await feePool.feePeriodDuration(), oneWeek);

		await assert.revert(
			feePool.setFeePeriodDuration(twoWeeks, {
				from: account1,
			})
		);
	});

	it('should disallow the owner from setting the fee period duration below minimum', async () => {
		const minimum = await feePool.MIN_FEE_PERIOD_DURATION();

		// Owner should be able to set minimum
		const transaction = await feePool.setFeePeriodDuration(minimum, {
			from: owner,
		});

		assert.eventEqual(transaction, 'FeePeriodDurationUpdated', { newFeePeriodDuration: minimum });
		assert.bnEqual(await feePool.feePeriodDuration(), minimum);

		// But no smaller
		await assert.revert(
			feePool.setFeePeriodDuration(minimum.sub(web3.utils.toBN(1)), {
				from: owner,
			})
		);
	});

	it('should disallow the owner from setting the fee period duration above maximum', async () => {
		const maximum = await feePool.MAX_FEE_PERIOD_DURATION();

		// Owner should be able to set maximum
		const transaction = await feePool.setFeePeriodDuration(maximum, {
			from: owner,
		});

		assert.eventEqual(transaction, 'FeePeriodDurationUpdated', { newFeePeriodDuration: maximum });
		assert.bnEqual(await feePool.feePeriodDuration(), maximum);

		// But no larger
		await assert.revert(
			feePool.setFeePeriodDuration(maximum.add(web3.utils.toBN(1)), {
				from: owner,
			})
		);
	});

	it('should allow the owner to set the synthetix instance', async () => {
		await feePool.setSynthetix(account1, { from: owner });
		assert.bnEqual(await feePool.synthetix(), account1);
	});

	it('should disallow a non-owner from setting the synthetix instance', async () => {
		await assert.revert(feePool.setSynthetix(account2, { from: account1 }));
	});

	it('should allow account1 to close the current fee period', async () => {
		await fastForward(await feePool.feePeriodDuration());

		const transaction = await feePool.closeCurrentFeePeriod({ from: account1 });
		assert.eventEqual(transaction, 'FeePeriodClosed', { feePeriodId: 1 });

		// Assert that our first period is new.
		assert.deepEqual(await feePool.recentFeePeriods(0), {
			feePeriodId: 2,
			startingDebtIndex: 0,
			feesToDistribute: 0,
			feesClaimed: 0,
		});

		// And that the second was the old one
		assert.deepEqual(await feePool.recentFeePeriods(1), {
			feePeriodId: 1,
			startingDebtIndex: 0,
			feesToDistribute: 0,
			feesClaimed: 0,
		});

		// fast forward and close another fee Period
		await fastForward(await feePool.feePeriodDuration());

		const secondPeriodClose = await feePool.closeCurrentFeePeriod({ from: account1 });
		assert.eventEqual(secondPeriodClose, 'FeePeriodClosed', { feePeriodId: 2 });
	});
	it('should import feePeriods and close the current fee period correctly', async () => {
		// startTime for most recent period is mocked to start same time as the 2018-03-13T00:00:00 datetime
		const feePeriodsImport = [
			{
				// recentPeriod 0
				index: 0,
				feePeriodId: 22,
				startingDebtIndex: 2272,
				startTime: 1520859600,
				feesToDistribute: '5800660797674490860',
				feesClaimed: '0',
				rewardsToDistribute: '0',
				rewardsClaimed: '0',
			},
			{
				// recentPeriod 1
				index: 1,
				feePeriodId: 21,
				startingDebtIndex: 1969,
				startTime: 1520254800,
				feesToDistribute: '934419341128642893704',
				feesClaimed: '0',
				rewardsToDistribute: '1442107692307692307692307',
				rewardsClaimed: '0',
			},
		];

		// import fee period data
		for (const period of feePeriodsImport) {
			await feePool.importFeePeriod(
				period.index,
				period.feePeriodId,
				period.startingDebtIndex,
				period.startTime,
				period.feesToDistribute,
				period.feesClaimed,
				period.rewardsToDistribute,
				period.rewardsClaimed,
				{ from: owner }
			);
		}

		await fastForward(await feePool.feePeriodDuration());

		const transaction = await feePool.closeCurrentFeePeriod({ from: account1 });
		assert.eventEqual(transaction, 'FeePeriodClosed', { feePeriodId: 22 });

		// Assert that our first period is new.
		assert.deepEqual(await feePool.recentFeePeriods(0), {
			feePeriodId: 23,
			startingDebtIndex: 0,
			feesToDistribute: 0,
			feesClaimed: 0,
		});

		// And that the second was the old one
		assert.deepEqual(await feePool.recentFeePeriods(1), {
			feePeriodId: 22,
			startingDebtIndex: 2272,
			startTime: 1520859600,
			feesToDistribute: '5800660797674490860',
			feesClaimed: '0',
			rewardsToDistribute: '0',
			rewardsClaimed: '0',
		});

		// And that the third was the oldest one imported
		assert.deepEqual(await feePool.recentFeePeriods(2), {
			feePeriodId: 21,
			startingDebtIndex: 1969,
			startTime: 1520254800,
			feesToDistribute: '934419341128642893704',
			feesClaimed: '0',
			rewardsToDistribute: '1442107692307692307692307',
			rewardsClaimed: '0',
		});
	});

	it('should allow the feePoolProxy to close feePeriod', async () => {
		await fastForward(await feePool.feePeriodDuration());

		const transaction = await feePoolProxy.closeCurrentFeePeriod({ from: account1 });
		assert.eventEqual(transaction, 'FeePeriodClosed', { feePeriodId: 1 });

		// Assert that our first period is new.
		assert.deepEqual(await feePool.recentFeePeriods(0), {
			feePeriodId: 2,
			startingDebtIndex: 0,
			feesToDistribute: 0,
			feesClaimed: 0,
		});

		// And that the second was the old one
		assert.deepEqual(await feePool.recentFeePeriods(1), {
			feePeriodId: 1,
			startingDebtIndex: 0,
			feesToDistribute: 0,
			feesClaimed: 0,
		});
	});
	it('should correctly roll over unclaimed fees when closing fee periods', async () => {
		// Issue 10,000 sUSD.
		await synthetix.issueSynths(sUSD, toUnit('10000'), { from: owner });

		// Users are only entitled to fees when they've participated in a fee period in its
		// entirety. Roll over the fee period so fees generated below count for owner.
		await closeFeePeriod();

		// Do a single transfer of all our synths to generate a fee.
		await sUSDContract.methods['transfer(address,uint256)'](account1, toUnit('10000'), {
			from: owner,
		});

		// Assert that the correct fee is in the fee pool.
		const fee = await XDRContract.balanceOf(FEE_ADDRESS);
		const pendingFees = await feePoolWeb3.methods.feesByPeriod(owner).call();
		assert.bnEqual(web3.utils.toBN(pendingFees[0][0]), fee);
	});

	it('should correctly close the current fee period when there are more than FEE_PERIOD_LENGTH periods', async () => {
		const length = await feePool.FEE_PERIOD_LENGTH();

		// Issue 10,000 sUSD.
		await synthetix.issueSynths(sUSD, toUnit('10000'), { from: owner });

		// Users have to have minted before the close of period. Close that fee period
		// so that there won't be any fees in period. future fees are available.
		await closeFeePeriod();

		// Do a single transfer of all our synths to generate a fee.
		await sUSDContract.methods['transfer(address,uint256)'](account1, toUnit('10000'), {
			from: owner,
		});

		// Assert that the correct fee is in the fee pool.
		const fee = await XDRContract.balanceOf(FEE_ADDRESS);
		const pendingFees = await feePoolWeb3.methods.feesByPeriod(owner).call();

		assert.bnEqual(pendingFees[0][0], fee);

		// Now close FEE_PERIOD_LENGTH * 2 fee periods and assert that it is still in the last one.
		for (let i = 0; i < length * 2; i++) {
			await closeFeePeriod();
		}

		const feesByPeriod = await feePoolWeb3.methods.feesByPeriod(owner).call();

		// Should be no fees for any period
		for (const zeroFees of feesByPeriod.slice(0, length - 1)) {
			assert.bnEqual(zeroFees[0], 0);
		}

		// Except the last one
		assert.bnEqual(feesByPeriod[length - 1][0], fee);
	});

	it('should correctly close the current fee period when there is only one fee period open', async () => {
		// Assert all the IDs and values are 0.
		const length = (await feePool.FEE_PERIOD_LENGTH()).toNumber();

		for (let i = 0; i < length; i++) {
			const period = await feePool.recentFeePeriods(i);

			assert.bnEqual(period.feePeriodId, i === 0 ? 1 : 0);
			assert.bnEqual(period.startingDebtIndex, 0);
			assert.bnEqual(period.feesToDistribute, 0);
			assert.bnEqual(period.feesClaimed, 0);
		}

		// Now create the first fee
		await synthetix.issueSynths(sUSD, toUnit('10000'), { from: owner });
		await sUSDContract.methods['transfer(address,uint256)'](account1, toUnit('10000'), {
			from: owner,
		});
		const fee = await XDRContract.balanceOf(FEE_ADDRESS);

		// And walk it forward one fee period.
		await closeFeePeriod();

		// Assert that we have the correct state

		// First period
		const firstPeriod = await feePool.recentFeePeriods(0);

		assert.bnEqual(firstPeriod.feePeriodId, 2);
		assert.bnEqual(firstPeriod.startingDebtIndex, 1);
		assert.bnEqual(firstPeriod.feesToDistribute, 0);
		assert.bnEqual(firstPeriod.feesClaimed, 0);

		// Second period
		const secondPeriod = await feePool.recentFeePeriods(1);

		assert.bnEqual(secondPeriod.feePeriodId, 1);
		assert.bnEqual(secondPeriod.startingDebtIndex, 0);
		assert.bnEqual(secondPeriod.feesToDistribute, fee);
		assert.bnEqual(secondPeriod.feesClaimed, 0);

		// Everything else should be zero
		for (let i = 2; i < length; i++) {
			const period = await feePool.recentFeePeriods(i);

			assert.bnEqual(period.feePeriodId, 0);
			assert.bnEqual(period.startingDebtIndex, 0);
			assert.bnEqual(period.feesToDistribute, 0);
			assert.bnEqual(period.feesClaimed, 0);
		}
	});

	it('should disallow closing the current fee period too early', async () => {
		const feePeriodDuration = await feePool.feePeriodDuration();

		// Close the current one so we know exactly what we're dealing with
		await closeFeePeriod();

		// Try to close the new fee period 5 seconds early
		await fastForward(feePeriodDuration.sub(web3.utils.toBN('5')));
		await assert.revert(feePool.closeCurrentFeePeriod({ from: account1 }));
	});

	it('should allow closing the current fee period very late', async () => {
		// Close it 500 times later than prescribed by feePeriodDuration
		// which should still succeed.
		const feePeriodDuration = await feePool.feePeriodDuration();
		await fastForward(feePeriodDuration.mul(web3.utils.toBN('500')));
		await updateRatesWithDefaults();
		await feePool.closeCurrentFeePeriod({ from: account1 });
	});

	it('should allow a user to claim their fees in sUSD', async () => {
		const length = (await feePool.FEE_PERIOD_LENGTH()).toNumber();

		// Issue 10,000 sUSD for two different accounts.
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('1000000'), {
			from: owner,
		});

		await synthetix.issueSynths(sUSD, toUnit('10000'), { from: owner });
		await synthetix.issueSynths(sUSD, toUnit('10000'), { from: account1 });

		// For each fee period (with one extra to test rollover), do two exchange transfers, then close it off.
		for (let i = 0; i <= length; i++) {
			const exchange1 = toUnit(((i + 1) * 10).toString());
			const exchange2 = toUnit(((i + 1) * 15).toString());

			await synthetix.exchange(sUSD, exchange1, sAUD, owner, { from: owner });
			await synthetix.exchange(sUSD, exchange2, sAUD, account1, { from: account1 });

			await closeFeePeriod();
		}

		// Assert that we have correct values in the fee pool
		const feesAvailable = await feePool.feesAvailable(owner, XDR);
		const oldXDRBalance = await XDRContract.balanceOf(owner);

		// Now we should be able to claim them.
		const claimFeesTx = await feePool.claimFees(XDR, { from: owner });
		assert.eventEqual(claimFeesTx, 'FeesClaimed', {
			xdrAmount: feesAvailable[0],
			snxRewards: feesAvailable[1],
		});

		const newXDRBalance = await XDRContract.balanceOf(owner);
		// We should have our fees
		assert.bnEqual(newXDRBalance, oldXDRBalance.add(feesAvailable[0]));
	});

	it('should allow a user to claim their fees if they minted debt during period', async () => {
		// Issue 10,000 sUSD for two different accounts.
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('1000000'), {
			from: owner,
		});

		await synthetix.issueSynths(sUSD, toUnit('10000'), { from: owner });

		// For first fee period, do two transfers, then close it off.
		let totalFees = web3.utils.toBN('0');

		const exchange1 = toUnit((10).toString());

		await synthetix.exchange(sUSD, exchange1, sAUD, owner, { from: owner });

		totalFees = totalFees.add(exchange1.sub(await feePool.amountReceivedFromExchange(exchange1)));

		await closeFeePeriod();

		// Assert that we have correct values in the fee pool
		// Owner should have all fees as only minted during period
		const feesAvailable = await feePool.feesAvailable(owner, sUSD);
		assert.bnClose(feesAvailable[0], totalFees, '8');

		const oldSynthBalance = await sUSDContract.balanceOf(owner);

		// Now we should be able to claim them.
		await feePool.claimFees(sUSD, { from: owner });

		// We should have our fees
		assert.bnEqual(await sUSDContract.balanceOf(owner), oldSynthBalance.add(feesAvailable[0]));

		// FeePeriod 2 - account 1 joins and mints 50% of the debt
		totalFees = web3.utils.toBN('0');
		await synthetix.issueSynths(sUSD, toUnit('10000'), { from: account1 });

		// Generate fees
		await synthetix.exchange(sUSD, exchange1, sAUD, owner, { from: owner });
		totalFees = totalFees.add(exchange1.sub(await feePool.amountReceivedFromExchange(exchange1)));

		await closeFeePeriod();

		const issuanceDataOwner = await feePoolState.getAccountsDebtEntry(owner, 0);

		assert.bnEqual(issuanceDataOwner.debtPercentage, toPreciseUnit('1'));
		assert.bnEqual(issuanceDataOwner.debtEntryIndex, '0');

		const feesAvailableOwner = await feePool.feesAvailable(owner, sUSD);
		const feesAvailableAcc1 = await feePool.feesAvailable(account1, sUSD);

		await feePool.claimFees(sUSD, { from: account1 });

		assert.bnClose(feesAvailableOwner[0], totalFees.div(web3.utils.toBN('2')), '8');
		assert.bnClose(feesAvailableAcc1[0], totalFees.div(web3.utils.toBN('2')), '8');
	});

	it('should allow a user to claim their fees in sAUD', async () => {
		const length = (await feePool.FEE_PERIOD_LENGTH()).toNumber();

		// Issue 10,000 sAUD for two different accounts.
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('1000000'), {
			from: owner,
		});

		await synthetix.issueSynths(sAUD, toUnit('10000'), { from: owner });
		await synthetix.issueSynths(sAUD, toUnit('10000'), { from: account1 });

		// For each fee period (with one extra to test rollover), do two transfers, then close it off.
		let totalFees = web3.utils.toBN('0');

		for (let i = 0; i <= length; i++) {
			const exchange1 = toUnit(((i + 1) * 10).toString());
			const exchange2 = toUnit(((i + 1) * 15).toString());

			await synthetix.exchange(sAUD, exchange1, sUSD, owner, { from: owner });
			await synthetix.exchange(sAUD, exchange2, sUSD, account1, { from: account1 });

			totalFees = totalFees.add(exchange1.sub(await feePool.amountReceivedFromExchange(exchange1)));
			totalFees = totalFees.add(exchange2.sub(await feePool.amountReceivedFromExchange(exchange2)));

			await closeFeePeriod();
		}

		// issuanceData for Owner and Account1 should hold order of minting
		const issuanceDataOwner = await feePoolState.getAccountsDebtEntry(owner, 0);
		assert.bnEqual(issuanceDataOwner.debtPercentage, toPreciseUnit('1'));
		assert.bnEqual(issuanceDataOwner.debtEntryIndex, '0');

		const issuanceDataAccount1 = await feePoolState.getAccountsDebtEntry(account1, 0);
		assert.bnEqual(issuanceDataAccount1.debtPercentage, toPreciseUnit('0.5'));
		assert.bnEqual(issuanceDataAccount1.debtEntryIndex, '1');

		// Period One checks
		const ownerDebtRatioForPeriod = await feePool.effectiveDebtRatioForPeriod(owner, 1);
		const account1DebtRatioForPeriod = await feePool.effectiveDebtRatioForPeriod(account1, 1);

		assert.bnEqual(ownerDebtRatioForPeriod, toPreciseUnit('0.5'));
		assert.bnEqual(account1DebtRatioForPeriod, toPreciseUnit('0.5'));

		// Assert that we have correct values in the fee pool
		const feesAvailable = await feePool.feesAvailable(owner, sAUD);
		assert.bnClose(feesAvailable[0], totalFees.div(web3.utils.toBN('2')), '19');

		const oldSynthBalance = await sAUDContract.balanceOf(owner);

		// Now we should be able to claim them.
		await feePool.claimFees(sAUD, { from: owner });

		// We should have our fees
		assert.bnEqual(await sAUDContract.balanceOf(owner), oldSynthBalance.add(feesAvailable[0]));
	});

	it('should revert when a user tries to double claim their fees', async () => {
		// Issue 10,000 sUSD.
		await synthetix.issueSynths(sUSD, toUnit('10000'), { from: owner });

		// Users are only allowed to claim fees in periods they had an issued balance
		// for the entire period.
		await closeFeePeriod();

		// Do a single exchange of all our synths to generate a fee.
		const exchange1 = toUnit(100);
		await synthetix.exchange(sUSD, exchange1, sAUD, owner, { from: owner });

		// Assert that the correct fee is in the fee pool.
		const fee = await XDRContract.balanceOf(FEE_ADDRESS);
		const pendingFees = await feePoolWeb3.methods.feesByPeriod(owner).call();

		assert.bnEqual(pendingFees[0][0], fee);

		// Claiming should revert because the fee period is still open
		await assert.revert(feePool.claimFees(sUSD, { from: owner }));

		await closeFeePeriod();

		// Then claim them
		await feePool.claimFees(sUSD, { from: owner });

		// But claiming again should revert
		const feesAvailable = await feePool.feesAvailable(owner, sUSD);
		assert.bnEqual(feesAvailable[0], '0');

		await assert.revert(feePool.claimFees(sUSD, { from: owner }));
	});

	it('should revert when a user has no fees to claim but tries to claim them', async () => {
		await assert.revert(feePool.claimFees(sUSD, { from: owner }));
	});

	it('should track fee withdrawals correctly', async () => {
		const amount = toUnit('10000');

		// Issue sUSD for two different accounts.
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('1000000'), {
			from: owner,
		});

		await synthetix.issueSynths(sUSD, amount, { from: owner });
		await synthetix.issueSynths(sUSD, amount, { from: account1 });

		await closeFeePeriod();

		// Generate a fee.
		const exchange = toUnit('10000');
		await synthetix.exchange(sUSD, exchange, sAUD, owner, { from: owner });

		await closeFeePeriod();

		// Then claim the owner's fees
		await feePool.claimFees(sUSD, { from: owner });

		// At this stage there should be a single pending period, one that's half claimed, and an empty one.
		const length = (await feePool.FEE_PERIOD_LENGTH()).toNumber();
		const feeInUSD = exchange.sub(await feePool.amountReceivedFromExchange(exchange));
		const xdrFee = await synthetix.effectiveValue(sUSD, feeInUSD, XDR);

		// First period
		assert.deepEqual(await feePool.recentFeePeriods(0), {
			feePeriodId: 3,
			startingDebtIndex: 2,
			feesToDistribute: 0,
			feesClaimed: 0,
		});

		// Second period
		assert.deepEqual(await feePool.recentFeePeriods(1), {
			feePeriodId: 2,
			startingDebtIndex: 2,
			feesToDistribute: xdrFee,
			feesClaimed: xdrFee.divRound(web3.utils.toBN('2')),
		});

		// Third period
		assert.deepEqual(await feePool.recentFeePeriods(2), {
			feePeriodId: 1,
			startingDebtIndex: 0,
			feesToDistribute: 0,
			feesClaimed: 0,
		});

		// Everything else should be zero
		for (let i = 3; i < length; i++) {
			assert.deepEqual(await feePool.recentFeePeriods(i), {
				feePeriodId: 0,
				startingDebtIndex: 0,
				feesToDistribute: 0,
				feesClaimed: 0,
			});
		}

		// And once we roll the periods forward enough we should be able to see the correct
		// roll over happening.
		for (let i = 0; i < length * 2; i++) {
			await closeFeePeriod();
		}

		// All periods except last should now be 0
		for (let i = 0; i < length - 1; i++) {
			assert.deepEqual(await feePool.recentFeePeriods(i), {
				feesToDistribute: 0,
				feesClaimed: 0,
			});
		}

		// Last period should have rolled over fees to distribute
		assert.deepEqual(await feePool.recentFeePeriods(length - 1), {
			feesToDistribute: xdrFee.div(web3.utils.toBN('2')),
			feesClaimed: 0,
		});
	});

	it('should calculate the exchangeFeeIncurred using the exchangeFeeRate', async () => {
		const amount = toUnit('1000');
		const originalFeeRate = await feePool.exchangeFeeRate();
		const originalFee = await feePool.exchangeFeeIncurred(amount);

		// Tripling the transfer fee rate should triple the fee.
		const factor = web3.utils.toBN('3');
		await feePool.setExchangeFeeRate(originalFeeRate.mul(factor), { from: owner });

		assert.bnEqual(await feePool.exchangeFeeIncurred(amount), originalFee.mul(factor));
	});

	it('should calculate exchangedAmountToReceive using the exchangeFeeRate', async () => {
		const amount = toUnit('1000');
		const originalFeeRate = await feePool.exchangeFeeRate();
		const originalFee = (await feePool.exchangedAmountToReceive(amount)).sub(amount);

		// Tripling the transfer fee rate should triple the fee.
		const factor = web3.utils.toBN('3');
		await feePool.setExchangeFeeRate(originalFeeRate.mul(factor), { from: owner });

		assert.bnEqual(
			await feePool.exchangedAmountToReceive(amount),
			amount.add(originalFee.mul(factor))
		);
	});

	it('should calculate the amountReceivedFromExchange using the exchangeFeeRate', async () => {
		const amount = toUnit('1000');
		const originalFeeRate = await feePool.exchangeFeeRate();

		// Tripling the transfer fee rate should almost triple the fee.
		const factor = web3.utils.toBN('3');
		await feePool.setExchangeFeeRate(originalFeeRate.mul(factor), { from: owner });

		const UNIT = toUnit('1');
		const expected = amount.mul(UNIT.sub(originalFeeRate.mul(factor)));

		assert.bnEqual(await feePool.amountReceivedFromExchange(amount), fromUnit(expected));
	});

	it('should correctly calculate the totalFeesAvailable for a single open period', async () => {
		const amount = toUnit('10000');
		const fee = amount.sub(await feePool.amountReceivedFromExchange(amount));

		// Issue sUSD for two different accounts.
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('1000000'), {
			from: owner,
		});

		await synthetix.issueSynths(sUSD, amount, { from: owner });
		await synthetix.issueSynths(sUSD, amount.mul(web3.utils.toBN('2')), { from: account1 });

		// Generate a fee.
		await synthetix.exchange(sUSD, amount, sAUD, owner, { from: owner });

		// Should be no fees available yet because the period is still pending.
		assert.bnEqual(await feePool.totalFeesAvailable(sUSD), 0);

		// So close out the period
		await closeFeePeriod();

		// Now we should have some fees.
		assert.bnEqual(await feePool.totalFeesAvailable(sUSD), fee);
	});

	it('should correctly calculate the totalFeesAvailable for multiple periods', async () => {
		const amount1 = toUnit('10000');
		const amount2 = amount1.mul(web3.utils.toBN('2'));
		const fee1 = amount1.sub(await feePool.amountReceivedFromExchange(amount1));

		// Issue sUSD for two different accounts.
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('1000000'), {
			from: owner,
		});

		await synthetix.issueSynths(sUSD, amount1, { from: owner });
		await synthetix.issueSynths(sUSD, amount2, { from: account1 });

		// Generate a fee.
		await synthetix.exchange(sUSD, amount1, sAUD, owner, { from: owner });

		// Should be no fees available yet because the period is still pending.
		assert.bnEqual(await feePool.totalFeesAvailable(sUSD), 0);

		// So close out the period
		await closeFeePeriod();

		// Now we should have some fees.
		assert.bnEqual(await feePool.totalFeesAvailable(sUSD), fee1);

		// Ok, and do it again but with account1's synths this time.
		const fee2 = amount2.sub(await feePool.amountReceivedFromExchange(amount2));

		// Generate a fee.
		await synthetix.exchange(sUSD, amount2, sAUD, account1, { from: account1 });

		// Should be only the previous fees available because the period is still pending.
		assert.bnEqual(await feePool.totalFeesAvailable(sUSD), fee1);

		// Close out the period
		await closeFeePeriod();

		// Now we should have both fees.
		assert.bnClose(await feePool.totalFeesAvailable(sUSD), fee1.add(fee2));
	});

	it('should correctly calculate the feesAvailable for a single user in an open period', async () => {
		const amount = toUnit('10000');
		const fee = amount.sub(await feePool.amountReceivedFromExchange(amount));

		// Issue sUSD for two different accounts.
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('1000000'), {
			from: owner,
		});

		await synthetix.issueSynths(sUSD, amount, { from: owner });
		await synthetix.issueSynths(sUSD, amount.mul(web3.utils.toBN('2')), { from: account1 });

		// Close out the period to allow both users to be part of the whole fee period.
		await closeFeePeriod();

		// Generate a fee.
		await synthetix.exchange(sUSD, amount, sAUD, owner, { from: owner });

		// Should be no fees available yet because the period is still pending.
		let feesAvailable;
		feesAvailable = await feePool.feesAvailable(owner, sUSD);
		assert.bnEqual(feesAvailable[0], 0);

		feesAvailable = await feePool.feesAvailable(account1, sUSD);
		assert.bnEqual(feesAvailable[0], 0);

		feesAvailable = await feePool.feesAvailable(account2, sUSD);
		assert.bnEqual(feesAvailable[0], 0);

		// Make the period no longer pending
		await closeFeePeriod();

		// Now we should have some fees.
		feesAvailable = await feePool.feesAvailable(owner, sUSD);
		assert.bnClose(feesAvailable[0], fee.div(web3.utils.toBN('3')));

		feesAvailable = await feePool.feesAvailable(account1, sUSD);
		assert.bnClose(feesAvailable[0], fee.div(web3.utils.toBN('3')).mul(web3.utils.toBN('2')), '11');

		// But account2 shouldn't be entitled to anything.
		feesAvailable = await feePool.feesAvailable(account2, sUSD);
		assert.bnEqual(feesAvailable[0], 0);
	});

	it('should correctly calculate the feesAvailable for a single user in multiple periods when fees are partially claimed', async () => {
		const oneThird = number => number.div(web3.utils.toBN('3'));
		const twoThirds = number => oneThird(number).mul(web3.utils.toBN('2'));

		const amount = toUnit('10000');
		const fee = amount.sub(await feePool.amountReceivedFromExchange(amount));
		const FEE_PERIOD_LENGTH = await feePool.FEE_PERIOD_LENGTH();

		// Issue sUSD for two different accounts.
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('1000000'), {
			from: owner,
		});

		await synthetix.issueSynths(sUSD, amount, { from: owner });
		await synthetix.issueSynths(sUSD, amount.mul(web3.utils.toBN('2')), { from: account1 });

		// Close out the period to allow both users to be part of the whole fee period.
		await closeFeePeriod();

		// Generate a fee.
		await synthetix.exchange(sUSD, amount, sAUD, owner, { from: owner });

		let feesAvailable;
		// Should be no fees available yet because the period is still pending.
		feesAvailable = await feePool.feesAvailable(owner, sUSD);
		assert.bnEqual(feesAvailable[0], 0);
		feesAvailable = await feePool.feesAvailable(account1, sUSD);
		assert.bnEqual(feesAvailable[0], 0);
		feesAvailable = await feePool.feesAvailable(account2, sUSD);
		assert.bnEqual(feesAvailable[0], 0);

		// Make the period no longer pending
		await closeFeePeriod();

		// Now we should have some fees.
		feesAvailable = await feePool.feesAvailable(owner, sUSD);
		assert.bnClose(feesAvailable[0], oneThird(fee));
		feesAvailable = await feePool.feesAvailable(account1, sUSD);
		assert.bnClose(feesAvailable[0], twoThirds(fee), '11');

		// The owner decides to claim their fees.
		await feePool.claimFees(sUSD, { from: owner });

		// account1 should still have the same amount of fees available.
		feesAvailable = await feePool.feesAvailable(account1, sUSD);
		assert.bnClose(feesAvailable[0], twoThirds(fee), '11');

		// If we close the next FEE_PERIOD_LENGTH fee periods off without claiming, their
		// fee amount that was unclaimed will roll forward, but will get proportionally
		// redistributed to everyone.
		for (let i = 0; i < FEE_PERIOD_LENGTH; i++) {
			await closeFeePeriod();
		}

		feesAvailable = await feePool.feesAvailable(account1, sUSD);
		assert.bnClose(feesAvailable[0], twoThirds(twoThirds(fee)));

		// But once they claim they should have zero.
		await feePool.claimFees(sUSD, { from: account1 });
		feesAvailable = await feePool.feesAvailable(account1, sUSD);
		assert.bnEqual(feesAvailable[0], 0);
	});

	describe('FeeClaimablePenaltyThreshold', async () => {
		it('should allow the owner to set the Target threshold', async () => {
			const thresholdPercent = 15;

			await feePool.setTargetThreshold(thresholdPercent, { from: owner });

			const penaltyThreshold = await feePool.TARGET_THRESHOLD();
			assert.bnEqual(penaltyThreshold, toUnit(thresholdPercent / 100));
		});
		it('should revert when account1 set the Target threshold', async () => {
			const thresholdPercent = 15;

			await assert.revert(feePool.setTargetThreshold(thresholdPercent, { from: account1 }));
		});

		it('should be no penalty if issuance ratio is less than target ratio', async () => {
			await synthetix.issueMaxSynths(sUSD, { from: owner });

			// Increase the price so we start well and truly within our 20% ratio.
			const newRate = (await exchangeRates.rateForCurrency(SNX)).add(web3.utils.toBN('1'));
			const timestamp = await currentTime();
			await exchangeRates.updateRates([SNX], [newRate], timestamp, {
				from: oracle,
			});

			assert.equal(await feePool.feesClaimable(owner), true);
		});

		it('should correctly calculate the 10% buffer for penalties at specific issuance ratios', async () => {
			const step = toUnit('0.01');
			await synthetix.issueMaxSynths(sUSD, { from: owner });

			// Increase the price so we start well and truly within our 20% ratio.
			const newRate = (await exchangeRates.rateForCurrency(SNX)).add(
				step.mul(web3.utils.toBN('1'))
			);
			const timestamp = await currentTime();
			await exchangeRates.updateRates([SNX], [newRate], timestamp, {
				from: oracle,
			});

			const issuanceRatio = fromUnit(await synthetixState.issuanceRatio());
			const penaltyThreshold = fromUnit(await feePool.TARGET_THRESHOLD());

			const threshold = Number(issuanceRatio) * (1 + Number(penaltyThreshold));
			// Start from the current price of synthetix and slowly decrease the price until
			// we hit almost zero. Assert the correct penalty at each point.
			while ((await exchangeRates.rateForCurrency(SNX)).gt(step.mul(web3.utils.toBN('2')))) {
				const ratio = await synthetix.collateralisationRatio(owner);

				if (ratio.lte(toUnit(threshold))) {
					// Should be claimable
					assert.equal(await feePool.feesClaimable(owner), true);
				} else {
					// Should be not claimable penalty
					assert.equal(await feePool.feesClaimable(owner), false);
				}

				// Bump the rate down.
				const newRate = (await exchangeRates.rateForCurrency(SNX)).sub(step);
				const timestamp = await currentTime();
				await exchangeRates.updateRates([SNX], [newRate], timestamp, {
					from: oracle,
				});
			}
		});

		it('should revert when users try to claim fees with > 10% of threshold', async () => {
			// Issue 10,000 sUSD for two different accounts.
			await synthetix.methods['transfer(address,uint256)'](account1, toUnit('1000000'), {
				from: owner,
			});

			await synthetix.issueMaxSynths(sUSD, { from: account1 });
			const amount = await sUSDContract.balanceOf(account1);
			await synthetix.issueSynths(sUSD, amount, { from: owner });
			await closeFeePeriod();

			// Do a transfer to generate fees
			await synthetix.exchange(sUSD, amount, sAUD, account1, { from: owner });
			const fee = amount.sub(await feePool.amountReceivedFromExchange(amount));

			// We should have zero fees available because the period is still open.
			assert.bnEqual(await getFeesAvailable(account1, sUSD), 0);

			// Once the fee period is closed we should have half the fee available because we have
			// half the collateral backing up the system.
			await closeFeePeriod();
			assert.bnClose(await getFeesAvailable(account1, sUSD), fee.div(web3.utils.toBN('2')));

			// But if the price of SNX decreases by 15%, we will lose all the fees.
			const currentRate = await exchangeRates.rateForCurrency(SNX);
			const newRate = currentRate.sub(multiplyDecimal(currentRate, toUnit('0.15')));

			const timestamp = await currentTime();
			await exchangeRates.updateRates([SNX], [newRate], timestamp, {
				from: oracle,
			});

			// fees available is unaffected but not claimable
			assert.bnClose(await getFeesAvailable(account1, sUSD), fee.div(web3.utils.toBN('2')));

			// And revert if we claim them
			await assert.revert(feePool.claimFees(sUSD, { from: account1 }));
		});

		it('should be able to set the Target threshold to 15% and claim fees', async () => {
			// Issue 10,000 sUSD for two different accounts.
			await synthetix.methods['transfer(address,uint256)'](account1, toUnit('1000000'), {
				from: owner,
			});

			await synthetix.issueMaxSynths(sUSD, { from: account1 });
			const amount = await sUSDContract.balanceOf(account1);
			await synthetix.issueSynths(sUSD, amount, { from: owner });
			await closeFeePeriod();

			// Do a transfer to generate fees
			await synthetix.exchange(sUSD, amount, sAUD, account1, { from: owner });
			const fee = amount.sub(await feePool.amountReceivedFromExchange(amount));

			// We should have zero fees available because the period is still open.
			assert.bnEqual(await getFeesAvailable(account1, sUSD), 0);

			// Once the fee period is closed we should have half the fee available because we have
			// half the collateral backing up the system.
			await closeFeePeriod();
			assert.bnClose(await getFeesAvailable(account1, sUSD), fee.div(web3.utils.toBN('2')));

			// But if the price of SNX decreases by 15%, we will lose all the fees.
			const currentRate = await exchangeRates.rateForCurrency(SNX);
			const newRate = currentRate.sub(multiplyDecimal(currentRate, toUnit('0.15')));

			const timestamp = await currentTime();
			await exchangeRates.updateRates([SNX], [newRate], timestamp, {
				from: oracle,
			});

			// fees available is unaffected but not claimable
			assert.bnClose(await getFeesAvailable(account1, sUSD), fee.div(web3.utils.toBN('2')));

			// And revert if we claim them
			await assert.revert(feePool.claimFees(sUSD, { from: account1 }));

			// Should be able to set the Target threshold to 16% and now claim
			const newPercentage = 16;
			await feePool.setTargetThreshold(newPercentage, { from: owner });
			assert.bnEqual(await feePool.TARGET_THRESHOLD(), toUnit(newPercentage / 100));

			assert.equal(await feePool.feesClaimable(owner), true);
		});
	});

	describe('effectiveDebtRatioForPeriod', async () => {
		it('should revert if period is > than FEE_PERIOD_LENGTH', async () => {
			// returns length of periods
			const length = (await feePool.FEE_PERIOD_LENGTH()).toNumber();

			// adding an extra period should revert as not available (period rollsover at last one)
			await assert.revert(feePool.effectiveDebtRatioForPeriod(owner, length + 1));
		});

		it('should revert if checking current unclosed period ', async () => {
			await assert.revert(feePool.effectiveDebtRatioForPeriod(owner, 0));
		});
	});

	describe('claimOnBehalf and approveClaimOnBehalf', async () => {
		async function generateFees() {
			// Issue 10,000 sUSD.
			await synthetix.methods['transfer(address,uint256)'](account1, toUnit('1000000'), {
				from: owner,
			});

			await synthetix.issueSynths(sUSD, toUnit('10000'), { from: account1 });

			// For first fee period, do one exchange.
			const exchange1 = toUnit((10).toString());

			// generate fee
			await synthetix.exchange(sUSD, exchange1, sAUD, account1, { from: account1 });

			await closeFeePeriod();
		}

		it('should approve a claim on behalf for account1', async () => {
			const authoriser = account1;
			const delegate = account2;

			// approve account2 to claim on behalf of account1
			await feePool.approveClaimOnBehalf(delegate, { from: authoriser });
			const result = await delegates.approval(authoriser, delegate);

			assert.isTrue(result);
		});
		it('should approve a claim on behalf for account1 and then withdraw permission', async () => {
			const authoriser = account1;
			const delegate = account2;

			// approve account2 to claim on behalf of account1
			await feePool.approveClaimOnBehalf(delegate, { from: authoriser });
			const result = await delegates.approval(authoriser, delegate);

			assert.isTrue(result);

			await feePool.removeClaimOnBehalf(delegate, { from: authoriser });
			const withdrawnResult = await delegates.approval(authoriser, delegate);

			assert.isNotTrue(withdrawnResult);
		});
		it('should allow any account to withdraw approval if not set before', async () => {
			const authoriser = account1;
			const delegate = account2;

			// approve account2 to claim on behalf of account1
			await feePool.removeClaimOnBehalf(delegate, { from: authoriser });
			const result = await delegates.approval(authoriser, delegate);

			assert.isNotTrue(result);
		});
		it('should revert if account is being set to ZERO_ADDRESS', async () => {
			const authoriser = account1;
			const delegate = ZERO_ADDRESS;

			// should revert setting delegate to ZERO_ADDRESS
			await assert.revert(feePool.approveClaimOnBehalf(delegate, { from: authoriser }));
		});

		it('should approve a claim on behalf and allow withdrawing the authorisation', async () => {
			const authoriser = account1;
			const delegate = account2;

			// approve account2 to claim on behalf of account1
			await feePool.approveClaimOnBehalf(delegate, { from: authoriser });
			const result = await delegates.approval(authoriser, delegate);

			assert.isTrue(result);

			// withdraw approval of account1
			await feePool.removeClaimOnBehalf(delegate, { from: authoriser });
			const resultAfter = await delegates.approval(authoriser, delegate);

			assert.isNotTrue(resultAfter);
		});

		it('should approve a claim on behalf for account1 by account2 and have fees in wallet', async () => {
			const authoriser = account1;
			const delegate = account2;

			// approve account2 to claim on behalf of account1
			await feePool.approveClaimOnBehalf(delegate, { from: authoriser });
			const result = await delegates.approval(authoriser, delegate);

			assert.isTrue(result);

			// Assert that we have correct values in the fee pool
			// account1 should have all fees as only minted during period
			await generateFees();

			const feesAvailable = await feePool.feesAvailable(account1, sUSD);

			// old balance of account1 (authoriser)
			const oldSynthBalance = await sUSDContract.balanceOf(account1);

			// Now we should be able to claim them on behalf of account1.
			await feePool.claimOnBehalf(account1, sUSD, { from: account2 });

			// We should have our fees for account1
			assert.bnEqual(await sUSDContract.balanceOf(account1), oldSynthBalance.add(feesAvailable[0]));
		});
		it('should revert if account2 tries to claimOnBehalf without approval', async () => {
			const authoriser = account1;
			const delegate = account2;

			// account2 doesn't have approval to claim on behalf of account1
			const result = await delegates.approval(authoriser, delegate);

			assert.isNotTrue(result);

			// Assert that we have correct values in the fee pool
			// account1 should have all fees as only minted during period
			await generateFees();

			// Now we should be able to claim them on behalf of account1.
			await assert.revert(feePool.claimOnBehalf(account1, sUSD, { from: account2 }));
		});
	});

	describe('reducing FEE_PERIOD_LENGTHS', async () => {
		it('should be able to get fees available when feePoolState issuanceData is 6 blocks', async () => {
			const length = (await feePool.FEE_PERIOD_LENGTH()).toNumber();

			await synthetix.methods['transfer(address,uint256)'](account1, toUnit('1000000'), {
				from: owner,
			});

			// For each fee period (with one extra to test rollover), do two transfers, then close it off.
			let totalFees = web3.utils.toBN('0');

			// Iterate over the period lengths * 2 to fill up issuanceData in feePoolState
			// feePoolState can hold up to 6 periods of minting issuanceData
			// fee Periods can be less than the 6 periods
			for (let i = 0; i <= length * 2; i++) {
				const exchange1 = toUnit(((i + 1) * 10).toString());

				// Mint debt each period to fill up feelPoolState issuanceData to [6]
				await synthetix.issueSynths(sUSD, toUnit('1000'), { from: owner });
				await synthetix.issueSynths(sUSD, toUnit('1000'), { from: account1 });

				await synthetix.exchange(sUSD, exchange1, sAUD, account1, { from: owner });

				totalFees = totalFees.add(
					exchange1.sub(await feePool.amountReceivedFromExchange(exchange1))
				);

				await closeFeePeriod();
			}

			// Assert that we have correct values in the fee pool
			// Account1 should have all the fees as only account minted
			const feesAvailable = await feePool.feesAvailable(account1, sUSD);
			assert.bnClose(feesAvailable[0], totalFees.div(web3.utils.toBN('2')), '8');

			const oldSynthBalance = await sUSDContract.balanceOf(account1);

			// Now we should be able to claim them.
			await feePool.claimFees(sUSD, { from: account1 });

			// We should have our fees
			assert.bnEqual(await sUSDContract.balanceOf(account1), oldSynthBalance.add(feesAvailable[0]));
		});
	});

	describe('Escrowing Tokens', async () => {
		const escrowAmount = toUnit('100000');

		it('should revert if non owner calls', async () => {
			await assert.revert(feePool.appendVestingEntry(account3, escrowAmount, { from: account3 }));
		});

		it('should revert if no tokens', async () => {
			await assert.revert(feePool.appendVestingEntry(account3, escrowAmount, { from: owner }));
		});

		it('should escrow tokens on an address when called by owner', async () => {
			// Approve FeePool to spend my fund to escrow
			await synthetix.approve(feePool.address, escrowAmount, {
				from: owner,
			});
			await feePool.appendVestingEntry(account3, escrowAmount, { from: owner });

			const vestingScheduleEntry = await rewardEscrow.getVestingScheduleEntry(account3, 0);
			assert.bnEqual(vestingScheduleEntry[1], escrowAmount);
		});
	});
});
