const {
	currentTime,
	fastForward,
	getEthBalance,
	toUnit,
	fromUnit,
	multiplyDecimal,
	divideDecimal,
} = require('../utils/testUtils');

const Havven = artifacts.require('Havven');
const Depot = artifacts.require('Depot');
const Nomin = artifacts.require('Nomin');

contract.only('Depot', async function(accounts) {
	let havven, nomin, depot;

	beforeEach(async function() {
		havven = await Havven.deployed();
		nomin = await Nomin.deployed();
		depot = await Depot.deployed();
	});

	const [
		deployerAccount,
		owner,
		oracle,
		fundsWallet,
		address1,
		address2,
		address3,
		address4,
	] = accounts;

	it('should set constructor params on deployment', async function() {
		let usdEth = '274957049546843687330';
		let usdHav = '127474638738934625';

		const instance = await Depot.new(
			owner,
			fundsWallet,
			havven.address,
			nomin.address,
			oracle,
			usdEth,
			usdHav,
			{
				from: deployerAccount,
			}
		);

		assert.equal(await instance.havven(), havven.address);
		assert.equal(await instance.nomin(), nomin.address);
		assert.equal(await instance.fundsWallet(), fundsWallet);
		assert.equal(await instance.oracle(), oracle);
		assert.bnEqual(await instance.usdToHavPrice(), usdHav);
		assert.bnEqual(await instance.usdToEthPrice(), usdEth);
	});

	it('should set funds wallet when invoked by owner', async function() {
		const transaction = await depot.setFundsWallet(address1, { from: owner });
		assert.eventEqual(transaction, 'FundsWalletUpdated', { newFundsWallet: address1 });

		assert.equal(await depot.fundsWallet(), address1);
	});

	it('should not set funds wallet when not invoked by owner', async function() {
		await assert.revert(depot.setFundsWallet(address2, { from: deployerAccount }));
	});

	it('should set oracle when invoked by owner', async function() {
		const txn = await depot.setOracle(address2, { from: owner });
		assert.eventEqual(txn, 'OracleUpdated', { newOracle: address2 });

		assert.equal(await depot.oracle(), address2);
	});

	it('should not set oracle when not invoked by owner', async function() {
		await assert.revert(depot.setOracle(address3, { from: deployerAccount }));
	});

	it('should set nomin when invoked by owner', async function() {
		const transaction = await depot.setNomin(address3, { from: owner });
		assert.eventEqual(transaction, 'NominUpdated', { newNominContract: address3 });

		assert.equal(await depot.nomin(), address3);
	});

	it('should not set nomin when not invoked by owner', async function() {
		await assert.revert(depot.setNomin(address4, { from: deployerAccount }));
	});

	it('should set havven when invoked by owner', async function() {
		const transaction = await depot.setHavven(address4, { from: owner });
		assert.eventEqual(transaction, 'HavvenUpdated', { newHavvenContract: address4 });

		assert.equal(await depot.havven(), address4);
	});

	it('should not set havven when not invoked by owner', async function() {
		await assert.revert(depot.setHavven(owner, { from: deployerAccount }));
	});

	it('should not set price stale period when not invoked by owner', async function() {
		await assert.revert(depot.setPriceStalePeriod(60, { from: deployerAccount }));
	});

	it('should set price stale period when invoked by owner', async function() {
		let stalePeriod = 5 * 60 * 60; // Five hours

		let txn = await depot.setPriceStalePeriod(stalePeriod, { from: owner });
		assert.eventEqual(txn, 'PriceStalePeriodUpdated', { priceStalePeriod: stalePeriod });

		assert.bnEqual(await depot.priceStalePeriod(), stalePeriod);
	});

	it('should update prices when invoked by oracle', async function() {
		let now = await currentTime();
		let usdEth = '994957049546843687330';
		let usdHav = '157474638738934625';

		let txn = await depot.updatePrices(usdEth, usdHav, now, {
			from: oracle,
		});

		assert.eventEqual(txn, 'PricesUpdated', {
			newEthPrice: usdEth,
			newHavvenPrice: usdHav,
			timeSent: now,
		});

		const havUSDFromContract = await depot.usdToHavPrice();
		const ethUSDFromContract = await depot.usdToEthPrice();
		const lastPriceUpdateTimeFromContract = await depot.lastPriceUpdateTime();

		assert.equal(havUSDFromContract.toString(), usdHav);
		assert.equal(ethUSDFromContract.toString(), usdEth);
		assert.equal(lastPriceUpdateTimeFromContract.toString(), now.toString());
	});

	it('should not update prices if time sent is lesser than last updated price time', async function() {
		// Send a price update through, just like the above test so we know our values.
		let now = await currentTime();
		let usdEth = '100';
		let usdHav = '200';

		await depot.updatePrices(usdEth, usdHav, now, {
			from: oracle,
		});

		// Unsuccessful price update attempt
		await assert.revert(
			depot.updatePrices('300', '400', now - 1, {
				from: oracle,
			})
		);

		const havUSDFromContract = await depot.usdToHavPrice();
		const EthUSDFromContract = await depot.usdToEthPrice();
		const lastPriceUpdateTimeFromContract = await depot.lastPriceUpdateTime();

		assert.bnEqual(EthUSDFromContract, usdEth);
		assert.bnEqual(havUSDFromContract, usdHav);
		assert.bnEqual(lastPriceUpdateTimeFromContract, now);
	});

	it('should not update prices if time sent is more than (current time stamp + ORACLE_FUTURE_LIMIT)', async function() {
		const lastPriceUpdateTime = await depot.lastPriceUpdateTime();
		const oracleFutureLimit = await depot.ORACLE_FUTURE_LIMIT();
		const havUSD = await depot.usdToHavPrice();
		const ethUSD = await depot.usdToEthPrice();

		// Unsuccessful price update attempt
		await assert.revert(
			depot.updatePrices(ethUSD, havUSD, lastPriceUpdateTime + oracleFutureLimit, {
				from: oracle,
			})
		);

		const havUSDFromContract = await depot.usdToHavPrice();
		const ethUSDFromContract = await depot.usdToEthPrice();
		const lastPriceUpdateTimeFromContract = await depot.lastPriceUpdateTime();

		assert.bnEqual(havUSDFromContract, havUSD);
		assert.bnEqual(ethUSDFromContract, ethUSD);
		assert.bnEqual(lastPriceUpdateTimeFromContract, lastPriceUpdateTime);
	});

	it('should not update prices when not invoked by oracle', async function() {
		let now = await currentTime();
		let usdEth = '994957049546843687330';
		let usdHav = '157474638738934625';

		await assert.revert(
			depot.updatePrices(usdEth, usdHav, now, {
				from: address1,
			})
		);
	});

	it('should allow the owner to set the minimum deposit amount', async function() {
		const minimumDepositAmount = toUnit('100');
		const setMinimumDepositAmountTx = await depot.setMinimumDepositAmount(minimumDepositAmount, {
			from: owner,
		});
		assert.eventEqual(setMinimumDepositAmountTx, 'MinimumDepositAmountUpdated', {
			amount: minimumDepositAmount,
		});
		const newMinimumDepositAmount = await depot.minimumDepositAmount();
		assert.bnEqual(newMinimumDepositAmount, minimumDepositAmount);
	});

	it('should not allow someone other than owner to set the minimum deposit amount', async function() {
		const minimumDepositAmount = toUnit('100');
		await assert.revert(depot.setMinimumDepositAmount(minimumDepositAmount, { from: address1 }));
	});

	it('should not allow the owner to set the minimum deposit amount to be less than 1 nUSD', async function() {
		const minimumDepositAmount = toUnit('.5');
		await assert.revert(depot.setMinimumDepositAmount(minimumDepositAmount, { from: address1 }));
	});

	it('should not allow the owner to set the minimum deposit amount to be zero', async function() {
		const minimumDepositAmount = toUnit('0');
		await assert.revert(depot.setMinimumDepositAmount(minimumDepositAmount, { from: address1 }));
	});

	describe('should increment depositor smallDeposits balance', async function() {
		const nominsBalance = toUnit('100');
		const depositor = address1;

		beforeEach(async function() {
			// We need the owner to issue nomins
			await havven.issueMaxNomins({ from: owner });
			// Set up the depositor with an amount of nomins to deposit.
			await nomin.transferSenderPaysFee(depositor, nominsBalance, { from: owner });
		});

		it('if the deposit nomin amount is a tiny amount', async function() {
			const nominsToDeposit = toUnit('0.01');
			const depositorStartBalance = await nomin.balanceOf(depositor);

			// Depositor should initially have a smallDeposits balance of 0
			const initialSmallDepositsBalance = await depot.smallDeposits(depositor);
			assert.equal(initialSmallDepositsBalance, 0);

			await nomin.transfer(depot.address, nominsToDeposit, {
				from: depositor,
			});

			// Now balance should be equal to the amount we just sent minus the fees
			const smallDepositsBalance = await depot.smallDeposits(depositor);
			const amountDepotReceived = await nomin.amountReceived(nominsToDeposit);
			assert.bnEqual(smallDepositsBalance, amountDepotReceived);
		});

		it('if the deposit nomin of 10 amount is less than the minimumDepositAmount', async function() {
			const nominsToDeposit = toUnit('10');
			const depositorStartBalance = await nomin.balanceOf(depositor);

			// Depositor should initially have a smallDeposits balance of 0
			const initialSmallDepositsBalance = await depot.smallDeposits(depositor);
			assert.equal(initialSmallDepositsBalance, 0);

			await nomin.transfer(depot.address, nominsToDeposit, {
				from: depositor,
			});

			// Now balance should be equal to the amount we just sent minus the fees
			const smallDepositsBalance = await depot.smallDeposits(depositor);
			const amountDepotReceived = await nomin.amountReceived(nominsToDeposit);
			assert.bnEqual(smallDepositsBalance, amountDepotReceived);
		});

		it('if the deposit nomin amount of 49.99 is less than the minimumDepositAmount', async function() {
			const nominsToDeposit = toUnit('49.99');
			const depositorStartBalance = await nomin.balanceOf(depositor);

			// Depositor should initially have a smallDeposits balance of 0
			const initialSmallDepositsBalance = await depot.smallDeposits(depositor);
			assert.equal(initialSmallDepositsBalance, 0);

			await nomin.transfer(depot.address, nominsToDeposit, {
				from: depositor,
			});

			// Now balance should be equal to the amount we just sent minus the fees
			const smallDepositsBalance = await depot.smallDeposits(depositor);
			const amountDepotReceived = await nomin.amountReceived(nominsToDeposit);
			assert.bnEqual(smallDepositsBalance, amountDepotReceived);
		});
	});

	describe('should accept nomin deposits', async function() {
		const nominsBalance = toUnit('100');
		const depositor = address1;

		beforeEach(async function() {
			// We need the owner to issue nomins
			await havven.issueMaxNomins({ from: owner });
			// Set up the depositor with an amount of nomins to deposit.
			await nomin.transferSenderPaysFee(depositor, nominsBalance, { from: owner });
		});

		it('if the deposit nomin amount of 50 is the minimumDepositAmount', async function() {
			const nominsToDeposit = toUnit('50');

			const txn = await nomin.transferSenderPaysFee(depot.address, nominsToDeposit, {
				from: depositor,
			});

			const events = await depot.getPastEvents();
			const nominDepositEvent = events.find(log => log.event === 'NominDeposit');
			const nominDepositIndex = nominDepositEvent.args.depositIndex.toString();

			assert.eventEqual(nominDepositEvent, 'NominDeposit', {
				user: depositor,
				amount: nominsToDeposit,
				depositIndex: nominDepositIndex,
			});

			const depotNominBalanceCurrent = await nomin.balanceOf(depot.address);
			assert.bnEqual(depotNominBalanceCurrent, nominsToDeposit);

			const depositStartIndexAfter = await depot.depositStartIndex();
			const nominDeposit = await depot.deposits.call(depositStartIndexAfter);
			assert.equal(nominDeposit.user, depositor);
			assert.bnEqual(nominDeposit.amount, nominsToDeposit);
		});

		it('if the deposit nomin amount of 51 is more than the minimumDepositAmount', async function() {
			const nominsToDeposit = toUnit('51');
			const txn = await nomin.transferSenderPaysFee(depot.address, nominsToDeposit, {
				from: depositor,
			});

			const events = await depot.getPastEvents();
			const nominDepositEvent = events.find(log => log.event === 'NominDeposit');
			const nominDepositIndex = nominDepositEvent.args.depositIndex.toString();

			assert.eventEqual(nominDepositEvent, 'NominDeposit', {
				user: depositor,
				amount: nominsToDeposit,
				depositIndex: nominDepositIndex,
			});

			const depotNominBalanceCurrent = await nomin.balanceOf(depot.address);
			assert.bnEqual(depotNominBalanceCurrent, nominsToDeposit);

			const depositStartIndexAfter = await depot.depositStartIndex();
			const nominDeposit = await depot.deposits.call(depositStartIndexAfter);
			assert.equal(nominDeposit.user, depositor);
			assert.bnEqual(nominDeposit.amount, nominsToDeposit);
		});
	});

	describe('should not exchange ether for nomins', async function() {
		let fundsWalletFromContract;
		let fundsWalletEthBalanceBefore;
		let nominsBalance;
		let feePoolBalanceBefore;
		let depotNominBalanceBefore;

		beforeEach(async function() {
			fundsWalletFromContract = await depot.fundsWallet();
			fundsWalletEthBalanceBefore = await getEthBalance(fundsWallet);
			// We need the owner to issue nomins
			await havven.issueMaxNomins({ from: owner });
			// Set up the depot so it contains some nomins to convert Ether for
			nominsBalance = await nomin.balanceOf(owner, { from: owner });
			await nomin.transfer(depot.address, nominsBalance.toString(), { from: owner });
			feePoolBalanceBefore = await nomin.feePool();
			depotNominBalanceBefore = await nomin.balanceOf(depot.address);
		});

		it('if the price is stale', async function() {
			const priceStalePeriod = await depot.priceStalePeriod();
			await fastForward(priceStalePeriod);

			// Attempt exchange
			await assert.revert(
				depot.exchangeEtherForNomins({
					from: address1,
					amount: 10,
				})
			);
			const depotNominBalanceCurrent = await nomin.balanceOf(depot.address);
			assert.bnEqual(depotNominBalanceCurrent, depotNominBalanceBefore);
			assert.bnEqual(await nomin.balanceOf(address1), 0);
			assert.bnEqual(await nomin.feePool(), feePoolBalanceBefore);
			assert.equal(fundsWalletFromContract, fundsWallet);
			assert.bnEqual(await getEthBalance(fundsWallet), fundsWalletEthBalanceBefore);
		});

		it('if the contract is paused', async function() {
			// Pause Contract
			const pausedContract = await depot.setPaused(true, { from: owner });

			// Attempt exchange
			await assert.revert(
				depot.exchangeEtherForNomins({
					from: address1,
					amount: 10,
				})
			);

			const depotNominBalanceCurrent = await nomin.balanceOf(depot.address);
			assert.bnEqual(depotNominBalanceCurrent, depotNominBalanceBefore);
			assert.bnEqual(await nomin.balanceOf(address1), 0);
			assert.equal(await nomin.feePool(), feePoolBalanceBefore.toString());
			assert.equal(fundsWalletFromContract, fundsWallet);
			assert.bnEqual(await getEthBalance(fundsWallet), fundsWalletEthBalanceBefore.toString());
		});
	});

	describe('Ensure user can exchange ETH for Nomins where the amount', async function() {
		const depositor = address1;
		const depositor2 = address2;
		const purchaser = address3;
		let nominsBalance = web3.utils.toWei('1000');
		let usdEth = web3.utils.toWei('500');

		beforeEach(async function() {
			// We need the owner to issue nomins
			await havven.issueMaxNomins({ from: owner });

			// Assert that there are no deposits already.
			const depositStartIndex = await depot.depositStartIndex();
			const depositEndIndex = await depot.depositEndIndex();

			assert.equal(depositStartIndex, 0);
			assert.equal(depositEndIndex, 0);

			// Set up the depositor with an amount of nomins to deposit.
			await nomin.transferSenderPaysFee(depositor, nominsBalance.toString(), { from: owner });
			await nomin.transferSenderPaysFee(depositor2, nominsBalance.toString(), { from: owner });
		});

		it('exactly matches one deposit (and that the queue is correctly updated)', async function() {
			const nominsToDeposit = toUnit('500');
			const ethToSend = toUnit('1');
			const depositorStartingBalance = await getEthBalance(depositor);

			// Send the nomins to the Token Depot.
			const depositTxn = await nomin.transferSenderPaysFee(depot.address, nominsToDeposit, {
				from: depositor,
			});

			const gasPaid = web3.utils.toBN(depositTxn.receipt.gasUsed * 20000000000);

			const depositStartIndex = await depot.depositStartIndex();
			const depositEndIndex = await depot.depositEndIndex();

			// Assert that there is now one deposit in the queue.
			assert.equal(depositStartIndex, 0);
			assert.equal(depositEndIndex, 1);

			// And assert that our total has increased by the right amount.
			const totalSellableDeposits = await depot.totalSellableDeposits();
			assert.bnEqual(totalSellableDeposits, nominsToDeposit);

			// Now purchase some.
			const txn = await depot.exchangeEtherForNomins({
				from: purchaser,
				value: ethToSend,
			});

			// Exchange("ETH", msg.value, "nUSD", fulfilled);
			const exchangeEvent = txn.logs.find(log => log.event === 'Exchange');
			assert.eventEqual(exchangeEvent, 'Exchange', {
				fromCurrency: 'ETH',
				fromAmount: ethToSend,
				toCurrency: 'nUSD',
				toAmount: nominsToDeposit,
			});

			// We need to calculate the amount - fees the purchaser is supposed to get
			const amountReceived = await nomin.amountReceived(nominsToDeposit);

			// Purchaser should have received the Nomins
			const purchaserNominBalance = await nomin.balanceOf(purchaser);
			const depotNominBalance = await nomin.balanceOf(depot.address);

			assert.equal(depotNominBalance, 0);
			assert.bnEqual(purchaserNominBalance, amountReceived);

			// We should have no deposit in the queue anymore
			assert.equal(await depot.depositStartIndex(), 1);
			assert.equal(await depot.depositEndIndex(), 1);

			// And our total should be 0 as the purchase amount was equal to the deposit
			assert.equal(await depot.totalSellableDeposits(), 0);

			// The depositor should have received the ETH
			const depositorEndingBalance = await getEthBalance(depositor);
			assert.bnEqual(
				web3.utils.toBN(depositorStartingBalance).add(ethToSend),
				web3.utils.toBN(depositorEndingBalance).add(gasPaid)
			);
		});

		it('exceeds one deposit (and that the queue is correctly updated)', async function() {
			const nominsToDeposit = web3.utils.toWei('600');
			const totalNominsDeposit = web3.utils.toWei('1200');
			const ethToSend = web3.utils.toWei('2');

			// Send the nomins to the Token Depot.
			await nomin.transferSenderPaysFee(depot.address, nominsToDeposit, {
				from: depositor,
			});
			await nomin.transferSenderPaysFee(depot.address, nominsToDeposit, {
				from: depositor2,
			});

			const depositStartIndex = await depot.depositStartIndex();
			const depositEndIndex = await depot.depositEndIndex();

			// Assert that there is now two deposits in the queue.
			assert.equal(depositStartIndex, 0);
			assert.equal(depositEndIndex, 2);

			// And assert that our total has increased by the right amount.
			const totalSellableDeposits = await depot.totalSellableDeposits();
			assert.bnEqual(totalSellableDeposits, totalNominsDeposit);

			// Now purchase some.
			const transaction = await depot.exchangeEtherForNomins({
				from: purchaser,
				value: ethToSend,
			});

			// Exchange("ETH", msg.value, "nUSD", fulfilled);
			const exchangeEvent = transaction.logs.find(log => log.event === 'Exchange');
			const nominsAmount = multiplyDecimal(ethToSend, usdEth);

			assert.eventEqual(exchangeEvent, 'Exchange', {
				fromCurrency: 'ETH',
				fromAmount: ethToSend,
				toCurrency: 'nUSD',
				toAmount: nominsAmount,
			});

			// We need to calculate the amount - fees the purchaser is supposed to get
			const amountReceived = await nomin.amountReceived(nominsAmount);

			// Purchaser should have received the Nomins
			const purchaserNominBalance = await nomin.balanceOf(purchaser);
			const depotNominBalance = await nomin.balanceOf(depot.address);
			const remainingNomins = web3.utils.toBN(totalNominsDeposit).sub(nominsAmount);
			assert.bnEqual(purchaserNominBalance, amountReceived);

			assert.bnEqual(depotNominBalance, remainingNomins);

			// We should have one deposit left in the queue
			assert.equal(await depot.depositStartIndex(), 1);
			assert.equal(await depot.depositEndIndex(), 2);

			// And our total should be totalNominsDeposit - last purchase
			assert.bnEqual(await depot.totalSellableDeposits(), remainingNomins);
		});

		it('exceeds available nomins (and that the remainder of the ETH is correctly refunded)', async function() {
			const nominsToDeposit = web3.utils.toWei('400');
			const ethToSend = web3.utils.toWei('2');
			const purchaserInitialBalance = await getEthBalance(purchaser);
			// Send the nomins to the Token Depot.
			await nomin.transferSenderPaysFee(depot.address, nominsToDeposit, {
				from: depositor,
			});

			// Assert that there is now one deposit in the queue.
			assert.equal(await depot.depositStartIndex(), 0);
			assert.equal(await depot.depositEndIndex(), 1);

			// And assert that our total has increased by the right amount.
			const totalSellableDeposits = await depot.totalSellableDeposits();
			assert.equal(totalSellableDeposits.toString(), nominsToDeposit);

			// Now purchase some.
			const txn = await depot.exchangeEtherForNomins({
				from: purchaser,
				value: ethToSend,
			});

			const gasPaid = web3.utils.toBN(txn.receipt.gasUsed * 20000000000);

			// Exchange("ETH", msg.value, "nUSD", fulfilled);
			const exchangeEvent = txn.logs.find(log => log.event === 'Exchange');
			const nominsPurchaseAmount = web3.utils.fromWei(ethToSend) * web3.utils.fromWei(usdEth);
			// const availableAmount = nominsPurchaseAmount - web3.utils.fromWei(nominsToDeposit);

			assert.eventEqual(exchangeEvent, 'Exchange', {
				fromCurrency: 'ETH',
				fromAmount: ethToSend,
				toCurrency: 'nUSD',
				toAmount: nominsToDeposit,
			});

			// We need to calculate the amount - fees the purchaser is supposed to get
			const amountReceived = await nomin.amountReceived(nominsToDeposit);
			const nominsAvailableInETH = divideDecimal(nominsToDeposit, usdEth);

			// Purchaser should have received the total available nomins
			const purchaserNominBalance = await nomin.balanceOf(purchaser);
			assert.equal(amountReceived.toString(), purchaserNominBalance.toString());

			// Token Depot should have 0 nomins left
			const depotNominBalance = await nomin.balanceOf(depot.address);
			assert.equal(depotNominBalance, 0);

			// The purchaser should have received the refund
			// which can be checked by initialBalance = endBalance + fees + amount of nomins bought in ETH
			const purchaserEndingBalance = await getEthBalance(purchaser);
			assert.bnEqual(
				web3.utils.toBN(purchaserInitialBalance),
				web3.utils
					.toBN(purchaserEndingBalance)
					.add(gasPaid)
					.add(nominsAvailableInETH)
			);
		});

		it('Ensure user can withdraw their Nomin deposit', async function() {
			const nominsToDeposit = web3.utils.toWei('500');
			// Send the nomins to the Token Depot.
			const depositTx = await nomin.transferSenderPaysFee(depot.address, nominsToDeposit, {
				from: depositor,
			});

			const events = await depot.getPastEvents();
			const nominDepositEvent = events.find(log => log.event === 'NominDeposit');
			const nominDepositIndex = nominDepositEvent.args.depositIndex.toString();

			// And assert that our total has increased by the right amount.
			const totalSellableDeposits = await depot.totalSellableDeposits();
			assert.equal(totalSellableDeposits, nominsToDeposit);

			// Wthdraw the deposited nomins
			const txn = await depot.withdrawMyDepositedNomins({ from: depositor });
			const depositRemovedEvent = txn.logs[0];
			const withdrawEvent = txn.logs[1];

			// The sent nomins should be equal the initial deposit
			assert.eventEqual(depositRemovedEvent, 'NominDepositRemoved', {
				user: depositor,
				amount: nominsToDeposit,
				depositIndex: nominDepositIndex,
			});

			// Tells the DApps the deposit is removed from the fifi queue
			assert.eventEqual(withdrawEvent, 'NominWithdrawal', {
				user: depositor,
				amount: nominsToDeposit,
			});
		});

		it('Ensure user can withdraw their Nomin deposit even if they sent an amount smaller than the minimum required', async function() {
			const nominsToDeposit = toUnit('10');

			await nomin.transferSenderPaysFee(depot.address, nominsToDeposit, {
				from: depositor,
			});

			// Now balance should be equal to the amount we just sent minus the fees
			const smallDepositsBalance = await depot.smallDeposits(depositor);
			assert.bnEqual(smallDepositsBalance, nominsToDeposit);

			// Wthdraw the deposited nomins
			const txn = await depot.withdrawMyDepositedNomins({ from: depositor });
			const withdrawEvent = txn.logs[0];

			// The sent nomins should be equal the initial deposit
			assert.eventEqual(withdrawEvent, 'NominWithdrawal', {
				user: depositor,
				amount: nominsToDeposit,
			});
		});

		it('Ensure user can withdraw their multiple Nomin deposits when they sent amounts smaller than the minimum required', async function() {
			const nominsToDeposit1 = toUnit('10');
			const nominsToDeposit2 = toUnit('15');
			const totalNominDeposits = nominsToDeposit1.add(nominsToDeposit2);

			await nomin.transferSenderPaysFee(depot.address, nominsToDeposit1, {
				from: depositor,
			});

			await nomin.transferSenderPaysFee(depot.address, nominsToDeposit2, {
				from: depositor,
			});

			// Now balance should be equal to the amount we just sent minus the fees
			const smallDepositsBalance = await depot.smallDeposits(depositor);
			assert.bnEqual(smallDepositsBalance, nominsToDeposit1.add(nominsToDeposit2));

			// Wthdraw the deposited nomins
			const txn = await depot.withdrawMyDepositedNomins({ from: depositor });
			const withdrawEvent = txn.logs[0];

			// The sent nomins should be equal the initial deposit
			assert.eventEqual(withdrawEvent, 'NominWithdrawal', {
				user: depositor,
				amount: totalNominDeposits,
			});
		});

		it('Ensure user can exchange ETH for Nomins after a withdrawal and that the queue correctly skips the empty entry', async function() {
			//   - e.g. Deposits of [1, 2, 3], user withdraws 2, so [1, (empty), 3], then
			//      - User can exchange for 1, and queue is now [(empty), 3]
			//      - User can exchange for 2 and queue is now [2]
			const deposit1 = web3.utils.toWei('100');
			const deposit2 = web3.utils.toWei('200');
			const deposit3 = web3.utils.toWei('300');
			const ethToSend = web3.utils.toWei('0.2');

			// Send the nomins to the Token Depot.
			await nomin.transferSenderPaysFee(depot.address, deposit1, {
				from: depositor,
			});
			await nomin.transferSenderPaysFee(depot.address, deposit2, {
				from: depositor2,
			});
			await nomin.transferSenderPaysFee(depot.address, deposit3, {
				from: depositor,
			});

			// Assert that there is now three deposits in the queue.
			assert.equal(await depot.depositStartIndex(), 0);
			assert.equal(await depot.depositEndIndex(), 3);

			// Depositor 2 withdraws Nomins
			await depot.withdrawMyDepositedNomins({ from: depositor2 });

			// Queue should be  [1, (empty), 3]
			const queueResultForDeposit2 = await depot.deposits(1);
			assert.equal(queueResultForDeposit2.amount, 0);

			// User exchange ETH for Nomins (same amount as first deposit)
			await depot.exchangeEtherForNomins({
				from: purchaser,
				value: ethToSend,
			});

			// Queue should now be [(empty), 3].
			assert.equal(await depot.depositStartIndex(), 1);
			assert.equal(await depot.depositEndIndex(), 3);
			const queueResultForDeposit1 = await depot.deposits(1);
			assert.equal(queueResultForDeposit1.amount, 0);

			// User exchange ETH for Nomins
			await depot.exchangeEtherForNomins({
				from: purchaser,
				value: ethToSend,
			});

			//Queue should now be [(deposit3 - nominsPurchasedAmount )]
			const remainingNomins =
				web3.utils.fromWei(deposit3) - web3.utils.fromWei(ethToSend) * web3.utils.fromWei(usdEth);
			assert.equal(await depot.depositStartIndex(), 2);
			assert.equal(await depot.depositEndIndex(), 3);
			const totalSellableDeposits = await depot.totalSellableDeposits();
			assert.equal(totalSellableDeposits.toString(), web3.utils.toWei(remainingNomins.toString()));
		});

		it('Ensure multiple users can make multiple Nomin deposits', async function() {
			const deposit1 = web3.utils.toWei('100');
			const deposit2 = web3.utils.toWei('200');
			const deposit3 = web3.utils.toWei('300');
			const deposit4 = web3.utils.toWei('400');

			// Send the nomins to the Token Depot.
			await nomin.transferSenderPaysFee(depot.address, deposit1, {
				from: depositor,
			});
			await nomin.transferSenderPaysFee(depot.address, deposit2, {
				from: depositor2,
			});
			await nomin.transferSenderPaysFee(depot.address, deposit3, {
				from: depositor,
			});
			await nomin.transferSenderPaysFee(depot.address, deposit4, {
				from: depositor2,
			});

			// We should have now 4 deposits
			assert.equal(await depot.depositStartIndex(), 0);
			assert.equal(await depot.depositEndIndex(), 4);
		});

		it('Ensure multiple users can make multiple Nomin deposits and multiple withdrawals (and that the queue is correctly updated)', async function() {
			const deposit1 = web3.utils.toWei('100');
			const deposit2 = web3.utils.toWei('200');
			const deposit3 = web3.utils.toWei('300');
			const deposit4 = web3.utils.toWei('400');

			// Send the nomins to the Token Depot.
			await nomin.transferSenderPaysFee(depot.address, deposit1, {
				from: depositor,
			});
			await nomin.transferSenderPaysFee(depot.address, deposit2, {
				from: depositor,
			});
			await nomin.transferSenderPaysFee(depot.address, deposit3, {
				from: depositor2,
			});
			await nomin.transferSenderPaysFee(depot.address, deposit4, {
				from: depositor2,
			});

			// We should have now 4 deposits
			assert.equal(await depot.depositStartIndex(), 0);
			assert.equal(await depot.depositEndIndex(), 4);

			// Depositors withdraws all his deposits
			await depot.withdrawMyDepositedNomins({ from: depositor });

			// We should have now 4 deposits
			assert.equal(await depot.depositStartIndex(), 0);
			assert.equal(await depot.depositEndIndex(), 4);

			// First two deposits should be 0
			const firstDepositInQueue = await depot.deposits(0);
			const secondDepositInQueue = await depot.deposits(1);
			assert.equal(firstDepositInQueue.amount, 0);
			assert.equal(secondDepositInQueue.amount, 0);
		});
	});

	describe('Ensure user can exchange ETH for Havven', async function() {
		const purchaser = address1;
		let depot;
		let havven;
		let nomin;
		const ethUSD = web3.utils.toWei('500');
		const havUSD = web3.utils.toWei('.10');

		this.beforeEach(async function() {
			depot = await Depot.deployed();
			havven = await Havven.deployed();
			nomin = await Nomin.deployed();
			// We need to send some HAV to the Token Depot contract
			await havven.transfer(depot.address, web3.utils.toWei('1000000'), {
				from: owner,
			});
		});

		it('ensure user get the correct amount of HAV after sending ETH', async function() {
			const ethToSend = toUnit('10');

			const purchaserHAVStartBalance = await havven.balanceOf(purchaser);
			// Purchaser should not have HAV yet
			assert.equal(purchaserHAVStartBalance, 0);

			// Purchaser sends ETH
			await depot.exchangeEtherForHavvens({
				from: purchaser,
				value: ethToSend,
			});

			const purchaseValueInNomins = multiplyDecimal(ethToSend, ethUSD);
			const purchaseValueInNominsAfterFees = await nomin.amountReceived(purchaseValueInNomins);
			const purchaseValueInHavvens = divideDecimal(purchaseValueInNominsAfterFees, havUSD);

			const purchaserHAVEndBalance = await havven.balanceOf(purchaser);

			// Purchaser HAV balance should be equal to the purchase value we calculated above
			assert.bnEqual(purchaserHAVEndBalance, purchaseValueInHavvens);
		});
	});

	describe('Ensure user can exchange Nomins for Havvens', async function() {
		const purchaser = address1;
		const purchaserNominAmount = toUnit('2000');
		const depotHAVAmount = toUnit('1000000');
		let depot;
		let havven;
		let nomin;
		const ethUSD = toUnit('500');
		const havUSD = toUnit('.10');
		const nominsToSend = toUnit('1');

		this.beforeEach(async function() {
			depot = await Depot.deployed();
			havven = await Havven.deployed();
			nomin = await Nomin.deployed();

			// We need the owner to issue nomins
			await havven.issueNomins(toUnit('50000'), { from: owner });
			// Send the purchaser some nomins
			await nomin.transferSenderPaysFee(purchaser, purchaserNominAmount, { from: owner });
			// We need to send some HAV to the Token Depot contract
			await havven.transfer(depot.address, depotHAVAmount, {
				from: owner,
			});

			await nomin.approve(depot.address, nominsToSend, { from: purchaser });

			const depotHAVBalance = await havven.balanceOf(depot.address);
			const purchaserNominBalance = await nomin.balanceOf(purchaser);
			assert.bnEqual(depotHAVBalance, depotHAVAmount);
			assert.bnEqual(purchaserNominBalance, purchaserNominAmount);
		});

		it('ensure user gets the correct amount of HAV after sending 10 nUSD', async function() {
			const purchaserHAVStartBalance = await havven.balanceOf(purchaser);
			// Purchaser should not have HAV yet
			assert.equal(purchaserHAVStartBalance, 0);

			// Purchaser sends nUSD
			const txn = await depot.exchangeNominsForHavvens(nominsToSend, {
				from: purchaser,
			});

			const purchaseValueInNominsAfterFees = await nomin.amountReceived(nominsToSend);
			const purchaseValueInHavvens = divideDecimal(purchaseValueInNominsAfterFees, havUSD);

			const purchaserHAVEndBalance = await havven.balanceOf(purchaser);

			// Purchaser HAV balance should be equal to the purchase value we calculated above
			assert.bnEqual(purchaserHAVEndBalance, purchaseValueInHavvens);

			//assert the exchange event
			const exchangeEvent = txn.logs.find(log => log.event === 'Exchange');
			const nominsPurchaseAmount = web3.utils.fromWei(nominsToSend) * web3.utils.fromWei(ethUSD);

			assert.eventEqual(exchangeEvent, 'Exchange', {
				fromCurrency: 'nUSD',
				fromAmount: nominsToSend,
				toCurrency: 'HAV',
				toAmount: purchaseValueInHavvens,
			});
		});
	});
});
