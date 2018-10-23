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
const IssuanceController = artifacts.require('IssuanceController');
const Nomin = artifacts.require('Nomin');

contract('Issuance Controller', async function(accounts) {
	let havven, nomin, issuanceController;

	beforeEach(async function() {
		havven = await Havven.deployed();
		nomin = await Nomin.deployed();
		issuanceController = await IssuanceController.deployed();
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

		const instance = await IssuanceController.new(
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
		const transaction = await issuanceController.setFundsWallet(address1, { from: owner });
		assert.eventEqual(transaction, 'FundsWalletUpdated', { newFundsWallet: address1 });

		assert.equal(await issuanceController.fundsWallet(), address1);
	});

	it('should not set funds wallet when not invoked by owner', async function() {
		await assert.revert(issuanceController.setFundsWallet(address2, { from: deployerAccount }));
	});

	it('should set oracle when invoked by owner', async function() {
		const txn = await issuanceController.setOracle(address2, { from: owner });
		assert.eventEqual(txn, 'OracleUpdated', { newOracle: address2 });

		assert.equal(await issuanceController.oracle(), address2);
	});

	it('should not set oracle when not invoked by owner', async function() {
		await assert.revert(issuanceController.setOracle(address3, { from: deployerAccount }));
	});

	it('should set nomin when invoked by owner', async function() {
		const transaction = await issuanceController.setNomin(address3, { from: owner });
		assert.eventEqual(transaction, 'NominUpdated', { newNominContract: address3 });

		assert.equal(await issuanceController.nomin(), address3);
	});

	it('should not set nomin when not invoked by owner', async function() {
		await assert.revert(issuanceController.setNomin(address4, { from: deployerAccount }));
	});

	it('should set havven when invoked by owner', async function() {
		const transaction = await issuanceController.setHavven(address4, { from: owner });
		assert.eventEqual(transaction, 'HavvenUpdated', { newHavvenContract: address4 });

		assert.equal(await issuanceController.havven(), address4);
	});

	it('should not set havven when not invoked by owner', async function() {
		await assert.revert(issuanceController.setHavven(owner, { from: deployerAccount }));
	});

	it('should not set price stale period when not invoked by owner', async function() {
		await assert.revert(issuanceController.setPriceStalePeriod(60, { from: deployerAccount }));
	});

	it('should set price stale period when invoked by owner', async function() {
		let stalePeriod = 5 * 60 * 60; // Five hours

		let txn = await issuanceController.setPriceStalePeriod(stalePeriod, { from: owner });
		assert.eventEqual(txn, 'PriceStalePeriodUpdated', { priceStalePeriod: stalePeriod });

		assert.bnEqual(await issuanceController.priceStalePeriod(), stalePeriod);
	});

	it('should update prices when invoked by oracle', async function() {
		let now = await currentTime();
		let usdEth = '994957049546843687330';
		let usdHav = '157474638738934625';

		let txn = await issuanceController.updatePrices(usdEth, usdHav, now, {
			from: oracle,
		});

		assert.eventEqual(txn, 'PricesUpdated', {
			newEthPrice: usdEth,
			newHavvenPrice: usdHav,
			timeSent: now,
		});

		const havUSDFromContract = await issuanceController.usdToHavPrice();
		const ethUSDFromContract = await issuanceController.usdToEthPrice();
		const lastPriceUpdateTimeFromContract = await issuanceController.lastPriceUpdateTime();

		assert.equal(havUSDFromContract.toString(), usdHav);
		assert.equal(ethUSDFromContract.toString(), usdEth);
		assert.equal(lastPriceUpdateTimeFromContract.toString(), now.toString());
	});

	it('should not update prices if time sent is lesser than last updated price time', async function() {
		// Send a price update through, just like the above test so we know our values.
		let now = await currentTime();
		let usdEth = '100';
		let usdHav = '200';

		await issuanceController.updatePrices(usdEth, usdHav, now, {
			from: oracle,
		});

		// Unsuccessful price update attempt
		await assert.revert(
			issuanceController.updatePrices('300', '400', now - 1, {
				from: oracle,
			})
		);

		const havUSDFromContract = await issuanceController.usdToHavPrice();
		const EthUSDFromContract = await issuanceController.usdToEthPrice();
		const lastPriceUpdateTimeFromContract = await issuanceController.lastPriceUpdateTime();

		assert.bnEqual(EthUSDFromContract, usdEth);
		assert.bnEqual(havUSDFromContract, usdHav);
		assert.bnEqual(lastPriceUpdateTimeFromContract, now);
	});

	it('should not update prices if time sent is more than (current time stamp + ORACLE_FUTURE_LIMIT)', async function() {
		const lastPriceUpdateTime = await issuanceController.lastPriceUpdateTime();
		const oracleFutureLimit = await issuanceController.ORACLE_FUTURE_LIMIT();
		const havUSD = await issuanceController.usdToHavPrice();
		const ethUSD = await issuanceController.usdToEthPrice();

		// Unsuccessful price update attempt
		await assert.revert(
			issuanceController.updatePrices(ethUSD, havUSD, lastPriceUpdateTime + oracleFutureLimit, {
				from: oracle,
			})
		);

		const havUSDFromContract = await issuanceController.usdToHavPrice();
		const ethUSDFromContract = await issuanceController.usdToEthPrice();
		const lastPriceUpdateTimeFromContract = await issuanceController.lastPriceUpdateTime();

		assert.bnEqual(havUSDFromContract, havUSD);
		assert.bnEqual(ethUSDFromContract, ethUSD);
		assert.bnEqual(lastPriceUpdateTimeFromContract, lastPriceUpdateTime);
	});

	it('should not update prices when not invoked by oracle', async function() {
		let now = await currentTime();
		let usdEth = '994957049546843687330';
		let usdHav = '157474638738934625';

		await assert.revert(
			issuanceController.updatePrices(usdEth, usdHav, now, {
				from: address1,
			})
		);
	});

	describe('should not exchange ether for nomins', async function() {
		let fundsWalletFromContract;
		let fundsWalletEthBalanceBefore;
		let nominsBalance;
		let feePoolBalanceBefore;
		let issuanceControllerNominBalanceBefore;

		beforeEach(async function() {
			fundsWalletFromContract = await issuanceController.fundsWallet();
			fundsWalletEthBalanceBefore = await getEthBalance(fundsWallet);

			// Set up the issuanceController so it contains some nomins to convert Ether for
			nominsBalance = await nomin.balanceOf(owner, { from: owner });
			await nomin.transfer(issuanceController.address, nominsBalance.toString(), { from: owner });
			feePoolBalanceBefore = await nomin.feePool();
			issuanceControllerNominBalanceBefore = await nomin.balanceOf(issuanceController.address);
		});

		it('if the price is stale', async function() {
			const priceStalePeriod = await issuanceController.priceStalePeriod();
			await fastForward(priceStalePeriod);

			// Attempt exchange
			try {
				await issuanceController.exchangeEtherForNomins({
					from: address1,
					amount: 10,
				});
			} catch (error) {
				assert.include(error.message, 'revert');
			}
			const issuanceControllerNominBalanceCurrent = await nomin.balanceOf(
				issuanceController.address
			);
			assert.bnEqual(issuanceControllerNominBalanceCurrent, issuanceControllerNominBalanceBefore);
			assert.bnEqual(await nomin.balanceOf(address1), 0);
			assert.bnEqual(await nomin.feePool(), feePoolBalanceBefore);
			assert.equal(fundsWalletFromContract, fundsWallet);
			assert.bnEqual(await getEthBalance(fundsWallet), fundsWalletEthBalanceBefore);
		});

		it('if the contract is paused', async function() {
			// Pause Contract
			const pausedContract = await issuanceController.setPaused(true, { from: owner });

			// Attempt exchange
			await assert.revert(
				issuanceController.exchangeEtherForNomins({
					from: address1,
					amount: 10,
				})
			);

			const issuanceControllerNominBalanceCurrent = await nomin.balanceOf(
				issuanceController.address
			);
			assert.bnEqual(issuanceControllerNominBalanceCurrent, issuanceControllerNominBalanceBefore);
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
			const depositStartIndex = await issuanceController.depositStartIndex();
			const depositEndIndex = await issuanceController.depositEndIndex();

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

			// Send the nomins to the issuance controller.
			const depositTxn = await nomin.transferSenderPaysFee(
				issuanceController.address,
				nominsToDeposit,
				{
					from: depositor,
				}
			);

			const gasPaid = web3.utils.toBN(depositTxn.receipt.gasUsed * 20000000000);

			const depositStartIndex = await issuanceController.depositStartIndex();
			const depositEndIndex = await issuanceController.depositEndIndex();

			// Assert that there is now one deposit in the queue.
			assert.equal(depositStartIndex, 0);
			assert.equal(depositEndIndex, 1);

			// And assert that our total has increased by the right amount.
			const totalSellableDeposits = await issuanceController.totalSellableDeposits();
			assert.bnEqual(totalSellableDeposits, nominsToDeposit);

			// Now purchase some.
			const txn = await issuanceController.exchangeEtherForNomins({
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
			const issuanceControllerNominBalance = await nomin.balanceOf(issuanceController.address);

			assert.equal(issuanceControllerNominBalance, 0);
			assert.bnEqual(purchaserNominBalance, amountReceived);

			// We should have no deposit in the queue anymore
			assert.equal(await issuanceController.depositStartIndex(), 1);
			assert.equal(await issuanceController.depositEndIndex(), 1);

			// And our total should be 0 as the purchase amount was equal to the deposit
			assert.equal(await issuanceController.totalSellableDeposits(), 0);

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

			// Send the nomins to the issuance controller.
			await nomin.transferSenderPaysFee(issuanceController.address, nominsToDeposit, {
				from: depositor,
			});
			await nomin.transferSenderPaysFee(issuanceController.address, nominsToDeposit, {
				from: depositor2,
			});

			const depositStartIndex = await issuanceController.depositStartIndex();
			const depositEndIndex = await issuanceController.depositEndIndex();

			// Assert that there is now two deposits in the queue.
			assert.equal(depositStartIndex, 0);
			assert.equal(depositEndIndex, 2);

			// And assert that our total has increased by the right amount.
			const totalSellableDeposits = await issuanceController.totalSellableDeposits();
			assert.bnEqual(totalSellableDeposits, totalNominsDeposit);

			// Now purchase some.
			const transaction = await issuanceController.exchangeEtherForNomins({
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
			const issuanceControllerNominBalance = await nomin.balanceOf(issuanceController.address);
			const remainingNomins = web3.utils.toBN(totalNominsDeposit).sub(nominsAmount);
			assert.bnEqual(purchaserNominBalance, amountReceived);

			assert.bnEqual(issuanceControllerNominBalance, remainingNomins);

			// We should have one deposit left in the queue
			assert.equal(await issuanceController.depositStartIndex(), 1);
			assert.equal(await issuanceController.depositEndIndex(), 2);

			// And our total should be totalNominsDeposit - last purchase
			assert.bnEqual(await issuanceController.totalSellableDeposits(), remainingNomins);
		});

		it('exceeds available nomins (and that the remainder of the ETH is correctly refunded)', async function() {
			const nominsToDeposit = web3.utils.toWei('400');
			const ethToSend = web3.utils.toWei('2');
			const purchaserInitialBalance = await getEthBalance(purchaser);
			// Send the nomins to the issuance controller.
			await nomin.transferSenderPaysFee(issuanceController.address, nominsToDeposit, {
				from: depositor,
			});

			// Assert that there is now one deposit in the queue.
			assert.equal(await issuanceController.depositStartIndex(), 0);
			assert.equal(await issuanceController.depositEndIndex(), 1);

			// And assert that our total has increased by the right amount.
			const totalSellableDeposits = await issuanceController.totalSellableDeposits();
			assert.equal(totalSellableDeposits.toString(), nominsToDeposit);

			// Now purchase some.
			const txn = await issuanceController.exchangeEtherForNomins({
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

			// Issuance controller should have 0 nomins left
			const issuanceControllerNominBalance = await nomin.balanceOf(issuanceController.address);
			assert.equal(issuanceControllerNominBalance, 0);

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
			// Send the nomins to the issuance controller.
			await nomin.transferSenderPaysFee(issuanceController.address, nominsToDeposit, {
				from: depositor,
			});

			// And assert that our total has increased by the right amount.
			const totalSellableDeposits = await issuanceController.totalSellableDeposits();
			assert.equal(totalSellableDeposits, nominsToDeposit);

			// Wthdraw the deposited nomins
			const txn = await issuanceController.withdrawMyDepositedNomins({ from: depositor });
			const withdrawEvent = txn.logs[0];

			// The sent nomins should be equal the initial deposit
			assert.eventEqual(withdrawEvent, 'NominWithdrawal', {
				user: depositor,
				amount: nominsToDeposit,
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

			// Send the nomins to the issuance controller.
			await nomin.transferSenderPaysFee(issuanceController.address, deposit1, {
				from: depositor,
			});
			await nomin.transferSenderPaysFee(issuanceController.address, deposit2, {
				from: depositor2,
			});
			await nomin.transferSenderPaysFee(issuanceController.address, deposit3, {
				from: depositor,
			});

			// Assert that there is now three deposits in the queue.
			assert.equal(await issuanceController.depositStartIndex(), 0);
			assert.equal(await issuanceController.depositEndIndex(), 3);

			// Depositor 2 withdraws Nomins
			await issuanceController.withdrawMyDepositedNomins({ from: depositor2 });

			// Queue should be  [1, (empty), 3]
			const queueResultForDeposit2 = await issuanceController.deposits(1);
			assert.equal(queueResultForDeposit2.amount, 0);

			// User exchange ETH for Nomins (same amount as first deposit)
			await issuanceController.exchangeEtherForNomins({
				from: purchaser,
				value: ethToSend,
			});

			// Queue should now be [(empty), 3].
			assert.equal(await issuanceController.depositStartIndex(), 1);
			assert.equal(await issuanceController.depositEndIndex(), 3);
			const queueResultForDeposit1 = await issuanceController.deposits(1);
			assert.equal(queueResultForDeposit1.amount, 0);

			// User exchange ETH for Nomins
			await issuanceController.exchangeEtherForNomins({
				from: purchaser,
				value: ethToSend,
			});

			//Queue should now be [(deposit3 - nominsPurchasedAmount )]
			const remainingNomins =
				web3.utils.fromWei(deposit3) - web3.utils.fromWei(ethToSend) * web3.utils.fromWei(usdEth);
			assert.equal(await issuanceController.depositStartIndex(), 2);
			assert.equal(await issuanceController.depositEndIndex(), 3);
			const totalSellableDeposits = await issuanceController.totalSellableDeposits();
			assert.equal(totalSellableDeposits.toString(), web3.utils.toWei(remainingNomins.toString()));
		});

		it('Ensure multiple users can make multiple Nomin deposits', async function() {
			const deposit1 = web3.utils.toWei('100');
			const deposit2 = web3.utils.toWei('200');
			const deposit3 = web3.utils.toWei('300');
			const deposit4 = web3.utils.toWei('400');

			// Send the nomins to the issuance controller.
			await nomin.transferSenderPaysFee(issuanceController.address, deposit1, {
				from: depositor,
			});
			await nomin.transferSenderPaysFee(issuanceController.address, deposit2, {
				from: depositor2,
			});
			await nomin.transferSenderPaysFee(issuanceController.address, deposit3, {
				from: depositor,
			});
			await nomin.transferSenderPaysFee(issuanceController.address, deposit4, {
				from: depositor2,
			});

			// We should have now 4 deposits
			assert.equal(await issuanceController.depositStartIndex(), 0);
			assert.equal(await issuanceController.depositEndIndex(), 4);
		});

		it('Ensure multiple users can make multiple Nomin deposits and multiple withdrawals (and that the queue is correctly updated)', async function() {
			const deposit1 = web3.utils.toWei('100');
			const deposit2 = web3.utils.toWei('200');
			const deposit3 = web3.utils.toWei('300');
			const deposit4 = web3.utils.toWei('400');

			// Send the nomins to the issuance controller.
			await nomin.transferSenderPaysFee(issuanceController.address, deposit1, {
				from: depositor,
			});
			await nomin.transferSenderPaysFee(issuanceController.address, deposit2, {
				from: depositor,
			});
			await nomin.transferSenderPaysFee(issuanceController.address, deposit3, {
				from: depositor2,
			});
			await nomin.transferSenderPaysFee(issuanceController.address, deposit4, {
				from: depositor2,
			});

			// We should have now 4 deposits
			assert.equal(await issuanceController.depositStartIndex(), 0);
			assert.equal(await issuanceController.depositEndIndex(), 4);

			// Depositors withdraws all his deposits
			await issuanceController.withdrawMyDepositedNomins({ from: depositor });

			// We should have now 4 deposits
			assert.equal(await issuanceController.depositStartIndex(), 0);
			assert.equal(await issuanceController.depositEndIndex(), 4);

			// First two deposits should be 0
			const firstDepositInQueue = await issuanceController.deposits(0);
			const secondDepositInQueue = await issuanceController.deposits(1);
			assert.equal(firstDepositInQueue.amount, 0);
			assert.equal(secondDepositInQueue.amount, 0);
		});
	});

	describe('Ensure user can exchange ETH for Havven', async function() {
		const purchaser = address1;
		let issuanceController;
		let havven;
		let nomin;
		const ethUSD = web3.utils.toWei('500');
		const havUSD = web3.utils.toWei('.10');

		this.beforeEach(async function() {
			issuanceController = await IssuanceController.deployed();
			havven = await Havven.deployed();
			nomin = await Nomin.deployed();
			// We need to send some HAV to the Issuance Controller contract
			await havven.transfer(issuanceController.address, web3.utils.toWei('1000000'), {
				from: owner,
			});
		});

		it('ensure user get the correct amount of HAV after sending ETH', async function() {
			const ethToSend = toUnit('10');

			const purchaserHAVStartBalance = await havven.balanceOf(purchaser);
			// Purchaser should not have HAV yet
			assert.equal(purchaserHAVStartBalance, 0);

			// Purchaser sends ETH
			await issuanceController.exchangeEtherForHavvens({
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
});
