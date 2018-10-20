const ExchangeRates = artifacts.require('ExchangeRates');
const FeePool = artifacts.require('FeePool');
const Havven = artifacts.require('Havven');
const Nomin = artifacts.require('Nomin');

const { currentTime, fastForward, toUnit, ZERO_ADDRESS } = require('../utils/testUtils');

contract.only('FeePool', async function(accounts) {
	// Updates rates with defaults so they're not stale.
	const updateRatesWithDefaults = async () => {
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[nUSD, nAUD, nEUR, HAV],
			['1', '0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{
				from: oracle,
			}
		);
	};

	const closeFeePeriod = async () => {
		const feePeriodDuration = await feePool.feePeriodDuration();
		await fastForward(feePeriodDuration);
		await feePool.closeCurrentFeePeriod({ from: feeAuthority });
		await updateRatesWithDefaults();
	};

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

	const [nUSD, nAUD, nEUR, HAV, HDR] = ['nUSD', 'nAUD', 'nEUR', 'HAV', 'HDR'].map(
		web3.utils.asciiToHex
	);

	const [
		deployerAccount,
		owner,
		oracle,
		feeAuthority,
		account1,
		account2,
		account3,
		account4,
	] = accounts;

	let feePool, FEE_ADDRESS, havven, exchangeRates, nUSDContract, nAUDContract, HDRContract;

	beforeEach(async function() {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		exchangeRates = await ExchangeRates.deployed();
		feePool = await FeePool.deployed();
		FEE_ADDRESS = await feePool.FEE_ADDRESS();

		havven = await Havven.deployed();
		nUSDContract = await Nomin.at(await havven.nomins(nUSD));
		nAUDContract = await Nomin.at(await havven.nomins(nAUD));
		HDRContract = await Nomin.at(await havven.nomins(HDR));

		// Send a price update to guarantee we're not stale.
		await updateRatesWithDefaults();
	});

	it('should set constructor params on deployment', async function() {
		const transferFeeRate = toUnit('0.0015');
		const exchangeFeeRate = toUnit('0.0030');

		// constructor(address _proxy, address _owner, Havven _havven, address _feeAuthority, uint _transferFeeRate, uint _exchangeFeeRate)
		const instance = await FeePool.new(
			account1,
			account2,
			account3,
			account4,
			transferFeeRate,
			exchangeFeeRate,
			{
				from: deployerAccount,
			}
		);

		assert.equal(await instance.proxy(), account1);
		assert.equal(await instance.owner(), account2);
		assert.equal(await instance.havven(), account3);
		assert.equal(await instance.feeAuthority(), account4);
		assert.bnEqual(await instance.transferFeeRate(), transferFeeRate);
		assert.bnEqual(await instance.exchangeFeeRate(), exchangeFeeRate);

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

	it('should allow the owner to set the exchange fee rate', async function() {
		const exchangeFeeRate = await feePool.exchangeFeeRate();
		const newFeeRate = exchangeFeeRate.add(toUnit('0.001'));

		const transaction = await feePool.setExchangeFeeRate(newFeeRate, {
			from: owner,
		});

		assert.eventEqual(transaction, 'ExchangeFeeUpdated', { newFeeRate });
		assert.bnEqual(await feePool.exchangeFeeRate(), newFeeRate);
	});

	it('should disallow a non-owner from setting the exchange fee rate', async function() {
		await assert.revert(
			feePool.setExchangeFeeRate(toUnit('0'), {
				from: account1,
			})
		);
	});

	it('should disallow the owner from setting the exchange fee rate above maximum', async function() {
		const max = await feePool.MAX_EXCHANGE_FEE_RATE();

		// Should be able to set to the max
		const transaction = await feePool.setExchangeFeeRate(max, {
			from: owner,
		});

		assert.eventEqual(transaction, 'ExchangeFeeUpdated', { newFeeRate: max });
		assert.bnEqual(await feePool.exchangeFeeRate(), max);

		// But not 1 over max
		await assert.revert(
			feePool.setExchangeFeeRate(max.add(web3.utils.toBN('1')), {
				from: owner,
			})
		);
	});

	it('should allow the owner to set the transfer fee rate', async function() {
		const transferFeeRate = await feePool.transferFeeRate();
		const newFeeRate = transferFeeRate.add(toUnit('0.001'));

		const transaction = await feePool.setTransferFeeRate(newFeeRate, {
			from: owner,
		});

		assert.eventEqual(transaction, 'TransferFeeUpdated', { newFeeRate });
		assert.bnEqual(await feePool.transferFeeRate(), newFeeRate);
	});

	it('should disallow a non-owner from setting the transfer fee rate', async function() {
		await assert.revert(feePool.setTransferFeeRate(toUnit('0'), { from: account1 }));
	});

	it('should disallow the owner from setting the transfer fee rate above maximum', async function() {
		const max = await feePool.MAX_TRANSFER_FEE_RATE();

		// Should be able to set to the max
		const transaction = await feePool.setTransferFeeRate(max, {
			from: owner,
		});

		assert.eventEqual(transaction, 'TransferFeeUpdated', { newFeeRate: max });
		assert.bnEqual(await feePool.transferFeeRate(), max);

		// But not 1 over max
		await assert.revert(
			feePool.setTransferFeeRate(max.add(web3.utils.toBN('1')), {
				from: owner,
			})
		);
	});

	it('should allow the owner to set a fee authority', async function() {
		let transaction = await feePool.setFeeAuthority(ZERO_ADDRESS, { from: owner });

		assert.eventEqual(transaction, 'FeeAuthorityUpdated', { newFeeAuthority: ZERO_ADDRESS });
		assert.bnEqual(await feePool.feeAuthority(), ZERO_ADDRESS);
	});

	it('should disallow a non-owner from setting the fee authority', async function() {
		await assert.revert(feePool.setFeeAuthority(ZERO_ADDRESS, { from: account1 }));
	});

	it('should allow the owner to set the fee period duration', async function() {
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

	it('should disallow a non-owner from setting the fee period duration', async function() {
		const oneWeek = web3.utils.toBN(7 * 24 * 60 * 60);
		const twoWeeks = oneWeek.mul(web3.utils.toBN(2));
		assert.bnEqual(await feePool.feePeriodDuration(), oneWeek);

		await assert.revert(
			feePool.setFeePeriodDuration(twoWeeks, {
				from: account1,
			})
		);
	});

	it('should disallow the owner from setting the fee period duration below minimum', async function() {
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

	it('should disallow the owner from setting the fee period duration above maximum', async function() {
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

	it('should allow the owner to set the havven instance', async function() {
		let transaction = await feePool.setHavven(account1, { from: owner });

		assert.eventEqual(transaction, 'HavvenUpdated', { newHavven: account1 });
		assert.bnEqual(await feePool.havven(), account1);
	});

	it('should disallow a non-owner from setting the havven instance', async function() {
		await assert.revert(feePool.setHavven(account2, { from: account1 }));
	});

	it('should allow the fee authority to close the current fee period', async function() {
		await fastForward(await feePool.feePeriodDuration());

		const transaction = await feePool.closeCurrentFeePeriod({ from: feeAuthority });
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

		// And that the next one is 3
		assert.bnEqual(await feePool.nextFeePeriodId(), 3);
	});

	it('should correctly roll over unclaimed fees when closing fee periods', async function() {
		const feePeriodLength = (await feePool.FEE_PERIOD_LENGTH()).toNumber();

		// Issue 10,000 nUSD.
		await havven.issueNomins(nUSD, toUnit('10000'), { from: owner });

		// Users are only entitled to fees when they've participated in a fee period in its
		// entirety. Roll over the fee period so fees generated below count for owner.
		await closeFeePeriod();

		// Do a single transfer of all our nomins to generate a fee.
		await nUSDContract.transfer(account1, toUnit('10000'), { from: owner });

		// Assert that the correct fee is in the fee pool.
		const fee = await HDRContract.balanceOf(FEE_ADDRESS);
		const [pendingFees] = await feePool.feesByPeriod(owner);

		assert.bnEqual(pendingFees, fee);

		// Now we roll over the fee periods double FEE_PERIOD_LENGTH more times
		// and should have exactly the same fee available because nobody else
		// has claimed
		for (let i = 0; i < feePeriodLength * 2; i++) {
			await closeFeePeriod();
		}

		assert.bnEqual(pendingFees, fee);
	});

	it('should correctly close the current fee period when there are more than FEE_PERIOD_LENGTH periods', async function() {
		const length = (await feePool.FEE_PERIOD_LENGTH()).toNumber();
		const feePeriodDuration = await feePool.feePeriodDuration();

		// Issue 10,000 nUSD.
		await havven.issueNomins(nUSD, toUnit('10000'), { from: owner });

		// Users have to be in the fee period in its entirety to be owed fees. Close that fee period
		// so that future fees are available for the owner.
		await closeFeePeriod();

		// Do a single transfer of all our nomins to generate a fee.
		await nUSDContract.transfer(account1, toUnit('10000'), { from: owner });

		// Assert that the correct fee is in the fee pool.
		const fee = await HDRContract.balanceOf(FEE_ADDRESS);
		const [pendingFees] = await feePool.feesByPeriod(owner);

		assert.bnEqual(pendingFees, fee);

		// Now close FEE_PERIOD_LENGTH * 2 fee periods and assert that it is still in the last one.
		for (let i = 0; i < length * 2; i++) {
			await closeFeePeriod();
		}

		const feesByPeriod = await feePool.feesByPeriod(owner);

		// Should be no fees for any period
		for (const zeroFees of feesByPeriod.slice(0, length - 1)) {
			assert.bnEqual(zeroFees, 0);
		}

		// Except the last one
		assert.bnEqual(feesByPeriod[length - 1], fee);
	});

	it('should correctly close the current fee period when there is only one fee period open', async function() {
		// Assert all the IDs and values are 0.
		const length = (await feePool.FEE_PERIOD_LENGTH()).toNumber();

		for (let i = 0; i < length; i++) {
			let period = await feePool.recentFeePeriods(i);

			assert.bnEqual(period.feePeriodId, i === 0 ? 1 : 0);
			assert.bnEqual(period.startingDebtIndex, 0);
			assert.bnEqual(period.feesToDistribute, 0);
			assert.bnEqual(period.feesClaimed, 0);
		}

		// Now create the first fee
		await havven.issueNomins(nUSD, toUnit('10000'), { from: owner });
		await nUSDContract.transfer(account1, toUnit('10000'), { from: owner });
		const fee = await HDRContract.balanceOf(FEE_ADDRESS);

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

	it('should disallow the fee authority from closing the current fee period too early', async function() {
		const feePeriodDuration = await feePool.feePeriodDuration();

		// Close the current one so we know exactly what we're dealing with
		await closeFeePeriod();

		// Try to close the new fee period 5 seconds early
		await fastForward(feePeriodDuration.sub(web3.utils.toBN('5')));
		await assert.revert(feePool.closeCurrentFeePeriod({ from: feeAuthority }));
	});

	it('should allow the fee authority to close the current fee period very late', async function() {
		// Close it 500 times later than prescribed by feePeriodDuration
		// which should still succeed.
		const feePeriodDuration = await feePool.feePeriodDuration();
		await fastForward(feePeriodDuration.mul(web3.utils.toBN('500')));
		await feePool.closeCurrentFeePeriod({ from: feeAuthority });
	});

	it('should disallow a non-fee-authority from closing the current fee period', async function() {
		const feePeriodDuration = await feePool.feePeriodDuration();
		await fastForward(feePeriodDuration);

		// Owner shouldn't be able to close it.
		await assert.revert(feePool.closeCurrentFeePeriod({ from: owner }));

		// But the feeAuthority still should be able to
		await feePool.closeCurrentFeePeriod({ from: feeAuthority });
	});

	it('should allow a user to claim their fees in nUSD', async function() {
		const length = (await feePool.FEE_PERIOD_LENGTH()).toNumber();

		// Issue 10,000 nUSD for two different accounts.
		await havven.transfer(account1, toUnit('1000000'), { from: owner });

		await havven.issueNomins(nUSD, toUnit('10000'), { from: owner });
		await havven.issueNomins(nUSD, toUnit('10000'), { from: account1 });

		// For each fee period (with one extra to test rollover), do two transfers, then close it off.
		let totalFees = web3.utils.toBN('0');

		for (let i = 0; i <= length; i++) {
			const transfer1 = toUnit(((i + 1) * 10).toString());
			const transfer2 = toUnit(((i + 1) * 15).toString());

			await nUSDContract.transfer(account1, transfer1, { from: owner });
			await nUSDContract.transfer(account1, transfer2, { from: owner });

			totalFees = totalFees.add(transfer1.sub(await feePool.amountReceivedFromTransfer(transfer1)));
			totalFees = totalFees.add(transfer2.sub(await feePool.amountReceivedFromTransfer(transfer2)));

			await closeFeePeriod();
		}

		// Assert that we have correct values in the fee pool
		const feesAvailable = await feePool.feesAvailable(owner, nUSD);
		assert.bnClose(feesAvailable, totalFees.div(web3.utils.toBN('2')), '6');

		const oldNominBalance = await nUSDContract.balanceOf(owner);

		// Now we should be able to claim them.
		await feePool.claimFees(nUSD, { from: owner });

		// We should have our fees
		assert.bnEqual(await nUSDContract.balanceOf(owner), oldNominBalance.add(feesAvailable));
	});

	it('should allow a user to claim their fees in nAUD', async function() {
		const length = (await feePool.FEE_PERIOD_LENGTH()).toNumber();

		// Issue 10,000 nAUD for two different accounts.
		await havven.transfer(account1, toUnit('1000000'), { from: owner });

		await havven.issueNomins(nAUD, toUnit('10000'), { from: owner });
		await havven.issueNomins(nAUD, toUnit('10000'), { from: account1 });

		// For each fee period (with one extra to test rollover), do two transfers, then close it off.
		let totalFees = web3.utils.toBN('0');

		for (let i = 0; i <= length; i++) {
			const transfer1 = toUnit(((i + 1) * 10).toString());
			const transfer2 = toUnit(((i + 1) * 15).toString());

			await nAUDContract.transfer(account1, transfer1, { from: owner });
			await nAUDContract.transfer(account1, transfer2, { from: owner });

			totalFees = totalFees.add(transfer1.sub(await feePool.amountReceivedFromTransfer(transfer1)));
			totalFees = totalFees.add(transfer2.sub(await feePool.amountReceivedFromTransfer(transfer2)));

			await closeFeePeriod();
		}

		// Assert that we have correct values in the fee pool
		const feesAvailable = await feePool.feesAvailable(owner, nAUD);
		assert.bnClose(feesAvailable, totalFees.div(web3.utils.toBN('2')), '6');

		const oldNominBalance = await nAUDContract.balanceOf(owner);

		// Now we should be able to claim them.
		await feePool.claimFees(nAUD, { from: owner });

		// We should have our fees
		assert.bnEqual(await nAUDContract.balanceOf(owner), oldNominBalance.add(feesAvailable));
	});

	it('should revert when a user tries to double claim their fees', async function() {
		// Issue 10,000 nUSD.
		await havven.issueNomins(nUSD, toUnit('10000'), { from: owner });

		// Users are only allowed to claim fees in periods they had an issued balance
		// for the entire period.
		await closeFeePeriod();

		// Do a single transfer of all our nomins to generate a fee.
		await nUSDContract.transfer(account1, toUnit('10000'), { from: owner });

		// Assert that the correct fee is in the fee pool.
		const fee = await HDRContract.balanceOf(FEE_ADDRESS);
		const [pendingFees] = await feePool.feesByPeriod(owner);

		assert.bnEqual(pendingFees, fee);

		// Claiming should revert because the fee period is still open
		await assert.revert(feePool.claimFees(nUSD, { from: owner }));

		await closeFeePeriod();

		// Then claim them
		await feePool.claimFees(nUSD, { from: owner });

		// But claiming again should revert
		await assert.revert(feePool.claimFees(nUSD, { from: owner }));
	});

	it('should revert when a user has no fees to claim but tries to claim them', async function() {
		await assert.revert(feePool.claimFees(nUSD, { from: owner }));
	});

	it('should track fee withdrawals correctly', async function() {
		const amount = toUnit('10000');

		// Issue nUSD for two different accounts.
		await havven.transfer(account1, toUnit('1000000'), { from: owner });

		await havven.issueNomins(nUSD, amount, { from: owner });
		await havven.issueNomins(nUSD, amount, { from: account1 });

		await closeFeePeriod();

		// Generate a fee.
		await nUSDContract.transfer(account2, amount, { from: owner });

		await closeFeePeriod();

		// Then claim the owner's fees
		await feePool.claimFees(nUSD, { from: owner });

		// At this stage there should be a single pending period, one that's half claimed, and an empty one.
		const length = (await feePool.FEE_PERIOD_LENGTH()).toNumber();
		const feeInUSD = amount.sub(await feePool.amountReceivedFromTransfer(amount));
		const hdrFee = await havven.effectiveValue(nUSD, feeInUSD, HDR);

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
			feesToDistribute: hdrFee,
			feesClaimed: hdrFee.div(web3.utils.toBN('2')),
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
			feesToDistribute: hdrFee.div(web3.utils.toBN('2')),
			feesClaimed: 0,
		});
	});

	it('should calculate transferFeeIncurred using the transferFeeRate', async function() {
		const amount = toUnit('1000');
		const originalFeeRate = await feePool.transferFeeRate();
		const originalFee = await feePool.transferFeeIncurred(amount);

		// Tripling the transfer fee rate should triple the fee.
		const factor = web3.utils.toBN('3');
		await feePool.setTransferFeeRate(originalFeeRate.mul(factor), { from: owner });

		assert.bnEqual(await feePool.transferFeeIncurred(amount), originalFee.mul(factor));
	});

	it('should calculate the transferredAmountToReceive using the transferFeeRate', async function() {
		const amount = toUnit('1000');
		const originalFeeRate = await feePool.transferFeeRate();
		const originalFee = (await feePool.transferredAmountToReceive(amount)).sub(amount);

		// Tripling the transfer fee rate should triple the fee.
		const factor = web3.utils.toBN('3');
		await feePool.setTransferFeeRate(originalFeeRate.mul(factor), { from: owner });

		assert.bnEqual(
			await feePool.transferredAmountToReceive(amount),
			amount.add(originalFee.mul(factor))
		);
	});

	it('should calculate the amountReceivedFromTransfer using the transferFeeRate', async function() {
		const amount = toUnit('1000');
		const originalFeeRate = await feePool.transferFeeRate();

		// Tripling the transfer fee rate should triple the fee.
		const factor = web3.utils.toBN('3');
		await feePool.setTransferFeeRate(originalFeeRate.mul(factor), { from: owner });

		const UNIT = toUnit('1');
		const expected = amount.mul(UNIT).div(originalFeeRate.mul(factor).add(UNIT));

		assert.bnEqual(await feePool.amountReceivedFromTransfer(amount), expected);
	});

	it('should calculate the exchangeFeeIncurred using the exchangeFeeRate', async function() {
		const amount = toUnit('1000');
		const originalFeeRate = await feePool.exchangeFeeRate();
		const originalFee = await feePool.exchangeFeeIncurred(amount);

		// Tripling the transfer fee rate should triple the fee.
		const factor = web3.utils.toBN('3');
		await feePool.setExchangeFeeRate(originalFeeRate.mul(factor), { from: owner });

		assert.bnEqual(await feePool.exchangeFeeIncurred(amount), originalFee.mul(factor));
	});

	it('should calculate exchangedAmountToReceive using the exchangeFeeRate', async function() {
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

	it('should calculate the amountReceivedFromExchange using the exchangeFeeRate', async function() {
		const amount = toUnit('1000');
		const originalFeeRate = await feePool.exchangeFeeRate();

		// Tripling the transfer fee rate should almost triple the fee.
		const factor = web3.utils.toBN('3');
		await feePool.setExchangeFeeRate(originalFeeRate.mul(factor), { from: owner });

		const UNIT = toUnit('1');
		const expected = amount.mul(UNIT).div(originalFeeRate.mul(factor).add(UNIT));

		assert.bnEqual(await feePool.amountReceivedFromExchange(amount), expected);
	});

	it('should correctly calculate the totalFeesAvailable for a single open period', async function() {
		const amount = toUnit('10000');
		const fee = amount.sub(await feePool.amountReceivedFromTransfer(amount));

		// Issue nUSD for two different accounts.
		await havven.transfer(account1, toUnit('1000000'), { from: owner });

		await havven.issueNomins(nUSD, amount, { from: owner });
		await havven.issueNomins(nUSD, amount.mul(web3.utils.toBN('2')), { from: account1 });

		// Generate a fee.
		await nUSDContract.transfer(account2, amount, { from: owner });

		// Should be no fees available yet because the period is still pending.
		assert.bnEqual(await feePool.totalFeesAvailable(nUSD), 0);

		// So close out the period
		await closeFeePeriod();

		// Now we should have some fees.
		assert.bnEqual(await feePool.totalFeesAvailable(nUSD), fee);
	});

	it('should correctly calculate the totalFeesAvailable for multiple periods', async function() {
		const amount1 = toUnit('10000');
		const amount2 = amount1.mul(web3.utils.toBN('2'));
		const fee1 = amount1.sub(await feePool.amountReceivedFromTransfer(amount1));

		// Issue nUSD for two different accounts.
		await havven.transfer(account1, toUnit('1000000'), { from: owner });

		await havven.issueNomins(nUSD, amount1, { from: owner });
		await havven.issueNomins(nUSD, amount2, { from: account1 });

		// Generate a fee.
		await nUSDContract.transfer(account2, amount1, { from: owner });

		// Should be no fees available yet because the period is still pending.
		assert.bnEqual(await feePool.totalFeesAvailable(nUSD), 0);

		// So close out the period
		await closeFeePeriod();

		// Now we should have some fees.
		assert.bnEqual(await feePool.totalFeesAvailable(nUSD), fee1);

		// Ok, and do it again but with account1's nomins this time.
		const fee2 = amount2.sub(await feePool.amountReceivedFromTransfer(amount2));

		// Generate a fee.
		await nUSDContract.transfer(account3, amount2, { from: account1 });

		// Should be only the previous fees available because the period is still pending.
		assert.bnEqual(await feePool.totalFeesAvailable(nUSD), fee1);

		// Close out the period
		await closeFeePeriod();

		// Now we should have both fees.
		assert.bnClose(await feePool.totalFeesAvailable(nUSD), fee1.add(fee2));
	});

	it('should correctly calculate the feesAvailable for a single user in an open period', async function() {
		const amount = toUnit('10000');
		const fee = amount.sub(await feePool.amountReceivedFromTransfer(amount));

		// Issue nUSD for two different accounts.
		await havven.transfer(account1, toUnit('1000000'), { from: owner });

		await havven.issueNomins(nUSD, amount, { from: owner });
		await havven.issueNomins(nUSD, amount.mul(web3.utils.toBN('2')), { from: account1 });

		// Close out the period to allow both users to be part of the whole fee period.
		await closeFeePeriod();

		// Generate a fee.
		await nUSDContract.transfer(account2, amount, { from: owner });

		// Should be no fees available yet because the period is still pending.
		assert.bnEqual(await feePool.feesAvailable(owner, nUSD), 0);
		assert.bnEqual(await feePool.feesAvailable(account1, nUSD), 0);
		assert.bnEqual(await feePool.feesAvailable(account2, nUSD), 0);

		// Make the period no longer pending
		await closeFeePeriod();

		// Now we should have some fees.
		assert.bnClose(await feePool.feesAvailable(owner, nUSD), fee.div(web3.utils.toBN('3')));

		assert.bnClose(
			await feePool.feesAvailable(account1, nUSD),
			fee.div(web3.utils.toBN('3')).mul(web3.utils.toBN('2')),
			'11'
		);

		// But account2 shouldn't be entitled to anything.
		assert.bnEqual(await feePool.feesAvailable(account2, nUSD), 0);
	});

	it('should correctly calculate the feesAvailable for a single user in multiple periods when fees are partially claimed', async function() {
		const oneThird = number => number.div(web3.utils.toBN('3'));
		const twoThirds = number => oneThird(number).mul(web3.utils.toBN('2'));

		const amount = toUnit('10000');
		const fee = amount.sub(await feePool.amountReceivedFromTransfer(amount));
		const FEE_PERIOD_LENGTH = await feePool.FEE_PERIOD_LENGTH();

		// Issue nUSD for two different accounts.
		await havven.transfer(account1, toUnit('1000000'), { from: owner });

		await havven.issueNomins(nUSD, amount, { from: owner });
		await havven.issueNomins(nUSD, amount.mul(web3.utils.toBN('2')), { from: account1 });

		// Close out the period to allow both users to be part of the whole fee period.
		await closeFeePeriod();

		// Generate a fee.
		await nUSDContract.transfer(account2, amount, { from: owner });

		// Should be no fees available yet because the period is still pending.
		assert.bnEqual(await feePool.feesAvailable(owner, nUSD), 0);
		assert.bnEqual(await feePool.feesAvailable(account1, nUSD), 0);
		assert.bnEqual(await feePool.feesAvailable(account2, nUSD), 0);

		// Make the period no longer pending
		await closeFeePeriod();

		// Now we should have some fees.
		assert.bnClose(await feePool.feesAvailable(owner, nUSD), oneThird(fee));
		assert.bnClose(await feePool.feesAvailable(account1, nUSD), twoThirds(fee), '11');

		// The owner decides to claim their fees.
		await feePool.claimFees(nUSD, { from: owner });

		// account1 should still have the same amount of fees available.
		assert.bnClose(await feePool.feesAvailable(account1, nUSD), twoThirds(fee), '11');

		// If we close the next FEE_PERIOD_LENGTH fee periods off without claiming, their
		// fee amount that was unclaimed will roll forward, but will get proportionally
		// redistributed to everyone.
		for (let i = 0; i < FEE_PERIOD_LENGTH; i++) {
			await closeFeePeriod();
		}

		assert.bnClose(await feePool.feesAvailable(account1, nUSD), twoThirds(twoThirds(fee)));

		// But once they claim they should have zero.
		await feePool.claimFees(nUSD, { from: account1 });
		assert.bnEqual(await feePool.feesAvailable(account1, nUSD), 0);
	});

	it('should correctly calculate the penalties at specific issuance ratios', async function() {
		const step = toUnit('0.005');
		await havven.issueMaxNomins(nUSD, { from: owner });

		// Increase the price so we start well and truly within our 20% ratio.
		const newRate = (await exchangeRates.rateForCurrency(HAV)).add(step.mul(web3.utils.toBN('5')));
		const timestamp = await currentTime();
		await exchangeRates.updateRates([HAV], [newRate], timestamp, {
			from: oracle,
		});

		// Start from the current price of havven and slowly decrease the price until
		// we hit almost zero. Assert the correct penalty at each point.
		while ((await exchangeRates.rateForCurrency(HAV)).gt(step.mul(web3.utils.toBN('2')))) {
			const ratio = await havven.collateralisationRatio(owner);

			if (ratio.lte(toUnit('0.2'))) {
				// Should be 0% penalty
				assert.bnEqual(await feePool.currentPenalty(owner), 0);
			} else if (ratio.lte(toUnit('0.3'))) {
				// Should be 25% penalty
				assert.bnEqual(await feePool.currentPenalty(owner), toUnit('0.25'));
			} else if (ratio.lte(toUnit('0.4'))) {
				// Should be 50% penalty
				assert.bnEqual(await feePool.currentPenalty(owner), toUnit('0.5'));
			} else {
				// Should be 75% penalty
				assert.bnEqual(await feePool.currentPenalty(owner), toUnit('0.75'));
			}

			// Bump the rate down.
			const newRate = (await exchangeRates.rateForCurrency(HAV)).sub(step);
			const timestamp = await currentTime();
			await exchangeRates.updateRates([HAV], [newRate], timestamp, {
				from: oracle,
			});
		}
	});

	it('should apply a collateralisation ratio penalty when users claim fees between 20%-30%', async function() {
		const threeQuarters = amount => amount.div(web3.utils.toBN('4')).mul(web3.utils.toBN('3'));

		// Issue 10,000 nUSD for two different accounts.
		await havven.transfer(account1, toUnit('1000000'), { from: owner });

		await havven.issueMaxNomins(nUSD, { from: account1 });
		const amount = await nUSDContract.balanceOf(account1);
		await havven.issueNomins(nUSD, amount, { from: owner });
		await closeFeePeriod();

		// Do a transfer to generate fees
		await nUSDContract.transfer(account2, amount, { from: account1 });
		const fee = amount.sub(await feePool.amountReceivedFromTransfer(amount));

		// We should have zero fees available because the period is still open.
		assert.bnEqual(await feePool.feesAvailable(account1, nUSD), 0);

		// Once the fee period is closed we should have half the fee available because we have
		// half the collateral backing up the system.
		await closeFeePeriod();
		assert.bnClose(await feePool.feesAvailable(account1, nUSD), fee.div(web3.utils.toBN('2')));

		// But if the price of HAV decreases a bit, we will fall into the 20-30% bracket and lose
		// 25% of those fees.
		const newRate = (await exchangeRates.rateForCurrency(HAV)).sub(toUnit('0.0001'));

		const timestamp = await currentTime();
		await exchangeRates.updateRates([HAV], [newRate], timestamp, {
			from: oracle,
		});

		assert.bnClose(
			await feePool.feesAvailable(account1, nUSD),
			threeQuarters(fee.div(web3.utils.toBN('2')))
		);

		// And if we claim them
		await feePool.claimFees(nUSD, { from: account1 });

		// We should have our decreased fee amount
		assert.bnClose(
			await nUSDContract.balanceOf(account1),
			threeQuarters(fee.div(web3.utils.toBN('2')))
		);
	});

	it('should apply a collateralisation ratio penalty when users claim fees between 30%-40%', async function() {
		const half = amount => amount.div(web3.utils.toBN('2'));

		// Issue 10,000 nUSD for two different accounts.
		await havven.transfer(account1, toUnit('1000000'), { from: owner });

		await havven.issueMaxNomins(nUSD, { from: account1 });
		const amount = await nUSDContract.balanceOf(account1);
		await havven.issueNomins(nUSD, amount, { from: owner });
		await closeFeePeriod();

		// Do a transfer to generate fees
		await nUSDContract.transfer(account2, amount, { from: account1 });
		const fee = amount.sub(await feePool.amountReceivedFromTransfer(amount));

		// We should have zero fees available because the period is still open.
		assert.bnEqual(await feePool.feesAvailable(account1, nUSD), 0);

		// Once the fee period is closed we should have half the fee available because we have
		// half the collateral backing up the system.
		await closeFeePeriod();
		assert.bnClose(await feePool.feesAvailable(account1, nUSD), half(fee));

		// But if the price of HAV decreases a bit, we will fall into the 30-40% bracket and lose
		// 50% of those fees.
		const newRate = (await exchangeRates.rateForCurrency(HAV)).sub(toUnit('0.045'));
		const timestamp = await currentTime();
		await exchangeRates.updateRates([HAV], [newRate], timestamp, {
			from: oracle,
		});

		assert.bnClose(await feePool.feesAvailable(account1, nUSD), half(half(fee)));

		// And if we claim them
		await feePool.claimFees(nUSD, { from: account1 });

		// We should have our decreased fee amount
		assert.bnClose(await nUSDContract.balanceOf(account1), half(half(fee)));
	});

	it('should apply a collateralisation ratio penalty when users claim fees >40%', async function() {
		const half = amount => amount.div(web3.utils.toBN('2'));
		const quarter = amount => amount.div(web3.utils.toBN('4'));

		// Issue 10,000 nUSD for two different accounts.
		await havven.transfer(account1, toUnit('1000000'), { from: owner });

		await havven.issueMaxNomins(nUSD, { from: account1 });
		const amount = await nUSDContract.balanceOf(account1);
		await havven.issueNomins(nUSD, amount, { from: owner });
		await closeFeePeriod();

		// Do a transfer to generate fees
		await nUSDContract.transfer(account2, amount, { from: account1 });
		const fee = amount.sub(await feePool.amountReceivedFromTransfer(amount));

		// We should have zero fees available because the period is still open.
		assert.bnEqual(await feePool.feesAvailable(account1, nUSD), 0);

		// Once the fee period is closed we should have half the fee available because we have
		// half the collateral backing up the system.
		await closeFeePeriod();
		assert.bnClose(await feePool.feesAvailable(account1, nUSD), half(fee));

		// But if the price of HAV decreases a lot, we will fall into the 40%+ bracket and lose
		// 75% of those fees.
		const newRate = (await exchangeRates.rateForCurrency(HAV)).sub(toUnit('0.06'));
		const timestamp = await currentTime();
		await exchangeRates.updateRates([HAV], [newRate], timestamp, {
			from: oracle,
		});

		assert.bnClose(await feePool.feesAvailable(account1, nUSD), quarter(half(fee)));

		// And if we claim them
		await feePool.claimFees(nUSD, { from: account1 });

		// We should have our decreased fee amount
		assert.bnClose(await nUSDContract.balanceOf(account1), quarter(half(fee)));
	});
});
