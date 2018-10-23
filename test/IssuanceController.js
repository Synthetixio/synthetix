const {
	fastForward,
	getEthBalance,
	toUnit,
	fromUnit,
	assertUnitEqual,
	assertBNEqual,
	divideDecimal,
} = require('../utils/testUtils');

const Havven = artifacts.require('Havven');
const IssuanceController = artifacts.require('IssuanceController');
const Nomin = artifacts.require('Nomin');

contract('Issuance Controller', async function(accounts) {
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
		const havven = await Havven.deployed();
		const nomin = await Nomin.deployed();

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

		const havvenFromContract = await instance.havven();
		assert.equal(havvenFromContract, havven.address);

		const nominFromContract = await instance.nomin();
		assert.equal(nominFromContract, nomin.address);

		const fundsWalletFromContract = await instance.fundsWallet();
		assert.equal(fundsWalletFromContract, fundsWallet);

		const oracleFromContract = await instance.oracle();
		assert.equal(oracleFromContract, oracle);

		const usdToHavFromContract = await instance.usdToHavPrice();
		assert.equal(usdToHavFromContract.toString(), usdHav);

		const usdToEthPriceFromContract = await instance.usdToEthPrice();
		assert.equal(usdToEthPriceFromContract.toString(), usdEth);
	});

	it('should set funds wallet when invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();

		let txn = await issuanceController.setFundsWallet(address1, { from: owner });
		assert.eventEqual(txn, 'FundsWalletUpdated', { newFundsWallet: address1 });

		assert.equal(await issuanceController.fundsWallet(), address1);
	});

	it('should not set funds wallet when not invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();

		const currentFundsWallet = await issuanceController.fundsWallet();

		try {
			await issuanceController.setFundsWallet(address2, { from: deployerAccount });
		} catch (error) {
			assert.include(error.message, 'revert');
		}

		assert.equal(await issuanceController.fundsWallet(), currentFundsWallet);
	});

	it('should set oracle when invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();

		let txn = await issuanceController.setOracle(address2, { from: owner });
		assert.eventEqual(txn, 'OracleUpdated', { newOracle: address2 });

		assert.equal(await issuanceController.oracle(), address2);
	});

	it('should not set oracle when not invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();

		try {
			await issuanceController.setOracle(address3, { from: deployerAccount });
		} catch (error) {
			assert.include(error.message, 'revert');
		}
		assert.equal(await issuanceController.oracle(), oracle);
	});

	it('should set nomin when invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();

		let txn = await issuanceController.setNomin(address3, { from: owner });
		assert.eventEqual(txn, 'NominUpdated', { newNominContract: address3 });

		assert.equal(await issuanceController.nomin(), address3);
	});

	it('should not set nomin when not invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();
		const currentNomin = await issuanceController.nomin();

		try {
			await issuanceController.setNomin(address4, { from: deployerAccount });
		} catch (error) {
			assert.include(error.message, 'revert');
		}
		assert.equal(await issuanceController.nomin(), currentNomin);
	});

	it('should set havven when invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();

		const txn = await issuanceController.setHavven(address4, { from: owner });
		assert.eventEqual(txn, 'HavvenUpdated', { newHavvenContract: address4 });

		assert.equal(await issuanceController.havven(), address4);
	});

	it('should not set havven when not invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();
		const currentHavven = await issuanceController.havven();

		try {
			await issuanceController.setHavven(owner, { from: deployerAccount });
		} catch (error) {
			assert.include(error.message, 'revert');
		}
		assert.equal(await issuanceController.havven(), currentHavven);
	});

	it('should not set price stale period when not invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();
		let stalePeriod = 60; // One minute

		try {
			await issuanceController.setPriceStalePeriod(stalePeriod, { from: deployerAccount });
		} catch (error) {
			assert.include(error.message, 'revert');
		}
		const priceStalePeriod = await issuanceController.priceStalePeriod();
		assert.equal(priceStalePeriod.toNumber(), 3 * 60 * 60);
	});

	it('should set price stale period when invoked by owner', async function() {
		const issuanceController = await IssuanceController.deployed();
		let stalePeriod = 5 * 60 * 60; // Five hours

		let txn = await issuanceController.setPriceStalePeriod(stalePeriod, { from: owner });
		assert.eventEqual(txn, 'PriceStalePeriodUpdated', { priceStalePeriod: stalePeriod });

		const priceStalePeriod = await issuanceController.priceStalePeriod();
		assert.equal(priceStalePeriod.toNumber(), stalePeriod);
	});

	it('should update prices when invoked by oracle', async function() {
		// The additional 1 is to ensure we are far enough away from the initial deploy that the
		// contract will let us update the price
		const issuanceController = await IssuanceController.deployed();
		let now = Math.floor(Date.now() / 1000) + 1;
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
		const issuanceController = await IssuanceController.deployed();
		let now = Math.floor(Date.now() / 1000) + 2;
		let usdEth = '100';
		let usdHav = '200';

		await issuanceController.updatePrices(usdEth, usdHav, now, {
			from: oracle,
		});

		// Unsuccessful price update attempt
		try {
			await issuanceController.updatePrices('300', '400', now - 1, {
				from: oracle,
			});
		} catch (error) {
			assert.include(error.message, 'revert');
		}

		const havUSDFromContract = await issuanceController.usdToHavPrice();
		const EthUSDFromContract = await issuanceController.usdToEthPrice();
		const lastPriceUpdateTimeFromContract = await issuanceController.lastPriceUpdateTime();

		assert.equal(EthUSDFromContract.toString(), usdEth);
		assert.equal(havUSDFromContract.toString(), usdHav);
		assert.equal(lastPriceUpdateTimeFromContract.toNumber(), now);
	});

	it('should not update prices if time sent is more than (current time stamp + ORACLE_FUTURE_LIMIT)', async function() {
		const issuanceController = await IssuanceController.deployed();
		const lastPriceUpdateTime = await issuanceController.lastPriceUpdateTime();
		const oracleFutureLimit = 10 * 60; // 10 minutes. This is hard coded as a const in the contract
		const havUSD = await issuanceController.usdToHavPrice();
		const ethUSD = await issuanceController.usdToEthPrice();

		// Unsuccessful price update attempt
		try {
			await issuanceController.updatePrices(
				ethUSD,
				havUSD,
				lastPriceUpdateTime + oracleFutureLimit,
				{
					from: oracle,
				}
			);
		} catch (error) {
			assert.include(error.message, 'revert');
		}

		const havUSDFromContract = await issuanceController.usdToHavPrice();
		const ethUSDFromContract = await issuanceController.usdToEthPrice();
		const lastPriceUpdateTimeFromContract = await issuanceController.lastPriceUpdateTime();

		assert.isTrue(havUSDFromContract.eq(havUSD));
		assert.isTrue(ethUSDFromContract.eq(ethUSD));
		assert.isTrue(lastPriceUpdateTimeFromContract.eq(lastPriceUpdateTime));
	});

	it('should not update prices when not invoked by oracle', async function() {
		const issuanceController = await IssuanceController.deployed();
		let now = Math.floor(Date.now() / 1000) + 1;
		let usdEth = '994957049546843687330';
		let usdHav = '157474638738934625';

		try {
			await issuanceController.updatePrices(usdEth, usdHav, now, {
				from: address1,
			});
		} catch (error) {
			assert.include(error.message, 'revert');
		}
	});

	describe('should not exchange ether for nomins', async function() {
		let issuanceController;
		let nomin;
		let fundsWalletFromContract;
		let fundsWalletEthBalanceBefore;
		let nominsBalance;
		let feePoolBalanceBefore;
		let issuanceControllerNominBalanceBefore;

		beforeEach(async function() {
			issuanceController = await IssuanceController.deployed();
			nomin = await Nomin.deployed();
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
			assert.equal(
				issuanceControllerNominBalanceCurrent.toString(),
				issuanceControllerNominBalanceBefore.toString()
			);
			const exchangerNominBalance = await nomin.balanceOf(address1);
			assert.equal(exchangerNominBalance.toNumber(), 0);
			const feePoolBalanceCurrent = await nomin.feePool();
			assert.equal(feePoolBalanceCurrent.toString(), feePoolBalanceBefore.toString());
			assert.equal(fundsWalletFromContract, fundsWallet);
			const fundsWalletEthBalanceCurrent = await getEthBalance(fundsWallet);
			assert.equal(fundsWalletEthBalanceCurrent.toString(), fundsWalletEthBalanceBefore.toString());
		});

		it('if the contract is paused', async function() {
			// Pause Contract
			const pausedContract = await issuanceController.setPaused(true, { from: owner });

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
			assert.equal(
				issuanceControllerNominBalanceCurrent.toString(),
				issuanceControllerNominBalanceBefore.toString()
			);
			const exchangerNominBalance = await nomin.balanceOf(address1);
			assert.equal(exchangerNominBalance.toNumber(), 0);
			const feePoolBalanceCurrent = await nomin.feePool();
			assert.equal(feePoolBalanceCurrent.toString(), feePoolBalanceBefore.toString());
			assert.equal(fundsWalletFromContract, fundsWallet);
			const fundsWalletEthBalanceCurrent = await getEthBalance(fundsWallet);
			assert.equal(fundsWalletEthBalanceCurrent.toString(), fundsWalletEthBalanceBefore.toString());
		});
	});

	describe('Ensure user can exchange ETH for Nomins where the amount', async function() {
		const depositor = address1;
		const depositor2 = address2;
		const purchaser = address3;
		let issuanceController;
		let nomin;
		let nominsBalance = web3.utils.toWei('1000');
		let usdEth = web3.utils.toWei('500');

		beforeEach(async function() {
			issuanceController = await IssuanceController.deployed();
			nomin = await Nomin.deployed();

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
			const nominsToDeposit = web3.utils.toWei('500');
			const ethToSend = web3.utils.toWei('1');
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
			assert.equal(totalSellableDeposits, nominsToDeposit);

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
			assert.equal(purchaserNominBalance.toString(), amountReceived);

			//We should have no deposit in the queue anymore
			assert.equal(await issuanceController.depositStartIndex(), 1);
			assert.equal(await issuanceController.depositEndIndex(), 1);

			// And our total should be 0 as the purchase amount was equal to the deposit
			assert.equal(await issuanceController.totalSellableDeposits(), 0);

			// The depositor should have received the ETH
			const depositorEndingBalance = await getEthBalance(depositor);
			assertBNEqual(
				web3.utils.toBN(depositorStartingBalance).add(web3.utils.toBN(ethToSend)),
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
			assert.equal(totalSellableDeposits.toString(), totalNominsDeposit);

			// Now purchase some.
			const txn = await issuanceController.exchangeEtherForNomins({
				from: purchaser,
				value: ethToSend,
			});

			// Exchange("ETH", msg.value, "nUSD", fulfilled);
			const exchangeEvent = txn.logs.find(log => log.event === 'Exchange');
			const nominsAmount = web3.utils.fromWei(ethToSend) * web3.utils.fromWei(usdEth);

			assert.eventEqual(exchangeEvent, 'Exchange', {
				fromCurrency: 'ETH',
				fromAmount: ethToSend,
				toCurrency: 'nUSD',
				toAmount: web3.utils.toWei(nominsAmount.toString()),
			});

			// We need to calculate the amount - fees the purchaser is supposed to get
			const amountReceived = await nomin.amountReceived(web3.utils.toWei(nominsAmount.toString()));

			// Purchaser should have received the Nomins
			const purchaserNominBalance = await nomin.balanceOf(purchaser);
			const issuanceControllerNominBalance = await nomin.balanceOf(issuanceController.address);
			const remainingNomins = web3.utils.fromWei(totalNominsDeposit) - nominsAmount;
			assert.equal(purchaserNominBalance.toString(), amountReceived.toString());

			assert.equal(
				issuanceControllerNominBalance.toString(),
				web3.utils.toWei(remainingNomins.toString())
			);

			//We should have one deposit left in the queue
			assert.equal(await issuanceController.depositStartIndex(), 1);
			assert.equal(await issuanceController.depositEndIndex(), 2);

			// And our total should be totalNominsDeposit - last purchase
			const totalRemainingSellableDeposits = await issuanceController.totalSellableDeposits();
			assert.equal(
				totalRemainingSellableDeposits.toString(),
				web3.utils.toWei(remainingNomins.toString())
			);
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
			assertBNEqual(
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
});
