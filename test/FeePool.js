const ExchangeRates = artifacts.require('ExchangeRates');
const FeePool = artifacts.require('FeePool');
const Havven = artifacts.require('Havven');
const Nomin = artifacts.require('Nomin');

const { currentTime, fastForward, fromUnit, toUnit, ZERO_ADDRESS } = require('../utils/testUtils');

contract.only('FeePool', async function(accounts) {
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
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[nUSD, nAUD, nEUR, HAV],
			['1', '0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{
				from: oracle,
			}
		);
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
		// Issue 10,000 nUSD.
		await havven.issueNomins(nUSD, toUnit('10000'), { from: owner });

		// Do a single transfer of all our nomins to generate a fee.
		await nUSDContract.transfer(account1, toUnit('10000'), { from: owner });

		// Assert that the correct fee is in the fee pool.
		const fee = await HDRContract.balanceOf(FEE_ADDRESS);
		const [pendingFees] = await feePool.feesByPeriod(owner);

		assert.bnEqual(pendingFees, fee);
	});

	it('should correctly close the current fee period when there are more than FEE_PERIOD_LENGTH periods', async function() {
		const length = (await feePool.FEE_PERIOD_LENGTH()).toNumber();
		const feePeriodDuration = await feePool.feePeriodDuration();

		// Issue 10,000 nUSD.
		await havven.issueNomins(nUSD, toUnit('10000'), { from: owner });

		// Do a single transfer of all our nomins to generate a fee.
		await nUSDContract.transfer(account1, toUnit('10000'), { from: owner });

		// Assert that the correct fee is in the fee pool.
		const fee = await HDRContract.balanceOf(FEE_ADDRESS);
		const [pendingFees] = await feePool.feesByPeriod(owner);

		assert.bnEqual(pendingFees, fee);

		// Now close FEE_PERIOD_LENGTH * 2 fee periods and assert that it is still in the last one.
		for (let i = 0; i < length * 2; i++) {
			await fastForward(feePeriodDuration);

			await feePool.closeCurrentFeePeriod({ from: feeAuthority });
		}
		// In order to get the fees by period, we need the rates to not be stale.
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[nUSD, nAUD, nEUR, HAV],
			['1', '0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{
				from: oracle,
			}
		);

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
		const feePeriodDuration = await feePool.feePeriodDuration();
		await fastForward(feePeriodDuration);
		await feePool.closeCurrentFeePeriod({ from: feeAuthority });

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
		await fastForward(feePeriodDuration);
		await feePool.closeCurrentFeePeriod({ from: feeAuthority });

		// Try to close the new fee period 5 seconds early
		await fastForward(feePeriodDuration.sub(web3.utils.toBN('5')));
		await assert.revert(feePool.closeCurrentFeePeriod({ from: feeAuthority }));
	});

	it('should allow the fee authority to close the current fee period very late', async function() {
		// Close it 500 times later than prescribed by feePeriodDuration
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

	it.only('should allow a user to claim their fees in nUSD', async function() {
		const length = (await feePool.FEE_PERIOD_LENGTH()).toNumber();
		const feePeriodDuration = await feePool.feePeriodDuration();

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

			await fastForward(feePeriodDuration);
			await feePool.closeCurrentFeePeriod({ from: feeAuthority });

			// Update rates so they're not stale.
			const timestamp = await currentTime();

			await exchangeRates.updateRates(
				[nUSD, nAUD, nEUR, HAV],
				['1', '0.5', '1.25', '0.1'].map(toUnit),
				timestamp,
				{
					from: oracle,
				}
			);
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
		const feePeriodDuration = await feePool.feePeriodDuration();

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

			await fastForward(feePeriodDuration);
			await feePool.closeCurrentFeePeriod({ from: feeAuthority });

			// Update rates so they're not stale.
			const timestamp = await currentTime();

			await exchangeRates.updateRates(
				[nUSD, nAUD, nEUR, HAV],
				['1', '0.5', '1.25', '0.1'].map(toUnit),
				timestamp,
				{
					from: oracle,
				}
			);
		}

		// Assert that we have correct values in the fee pool
		const feesAvailable = await feePool.feesAvailable(owner, nAUD);
		assert.bnClose(feesAvailable, totalFees.div(web3.utils.toBN('2')), '6');

		const oldNominBalance = await nUSDContract.balanceOf(owner);

		// Now we should be able to claim them.
		await feePool.claimFees(nAUD, { from: owner });

		// We should have our fees
		assert.bnEqual(await nAUDContract.balanceOf(owner), oldNominBalance.add(feesAvailable));
	});
	it('should revert when a user tries to double claim their fees');
	it('should track fee withdrawals correctly');
	it('should correctly calculate the transferFeeIncurred using the transferFeeRate');
	it('should correctly calculate the transferPlusFee using the transferFeeRate');
	it('should correctly calculate the amountReceivedFromTransfer using the transferFeeRate');
	it('should correctly calculate the exchangeFeeIncurred using the exchangeFeeRate');
	it('should correctly calculate the exchangePlusFee using the exchangeFeeRate');
	it('should correctly calculate the amountReceivedFromExchange using the exchangeFeeRate');
	it('should correctly calculate the totalFeesAvailable for a single open period');
	it('should correctly calculate the totalFeesAvailable for multiple periods');
	it('should correctly calculate the feesAvailable for a single user in an open period');
	it('should correctly calculate the feesAvailable for a single user in multiple periods');
	it('should correctly calculate the penalties at specific issuance ratios');
	it('should apply a collateralisation ratio penalty when users try to claim fees between 20%-30%');
	it('should apply a collateralisation ratio penalty when users try to claim fees between 30%-40%');
	it('should apply a collateralisation ratio penalty when users try to claim fees >40%');
	it('should correctly calculate the fees available by period for a user');
});
