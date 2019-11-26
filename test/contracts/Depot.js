const {
	currentTime,
	fastForward,
	getEthBalance,
	toUnit,
	multiplyDecimal,
	divideDecimal,
} = require('../utils/testUtils');

const { toBytes32 } = require('../../.');

const Synthetix = artifacts.require('Synthetix');
const Depot = artifacts.require('Depot');
const Synth = artifacts.require('Synth');
const FeePool = artifacts.require('FeePool');

contract('Depot', async accounts => {
	let synthetix, synth, depot, feePool;
	const sUsdHex = toBytes32('sUSD');

	beforeEach(async () => {
		synthetix = await Synthetix.deployed();
		synth = await Synth.at(await synthetix.synths(sUsdHex));
		depot = await Depot.deployed();
		feePool = await FeePool.deployed();
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

	it('should set constructor params on deployment', async () => {
		const usdEth = '274957049546843687330';
		const usdSnx = '127474638738934625';

		const instance = await Depot.new(
			owner,
			fundsWallet,
			synthetix.address,
			synth.address,
			feePool.address,
			oracle,
			usdEth,
			usdSnx,
			{
				from: deployerAccount,
			}
		);

		assert.equal(await instance.synthetix(), synthetix.address);
		assert.equal(await instance.synth(), synth.address);
		assert.equal(await instance.fundsWallet(), fundsWallet);
		assert.equal(await instance.oracle(), oracle);
		assert.bnEqual(await instance.usdToSnxPrice(), usdSnx);
		assert.bnEqual(await instance.usdToEthPrice(), usdEth);
	});

	it('should set funds wallet when invoked by owner', async () => {
		const transaction = await depot.setFundsWallet(address1, { from: owner });
		assert.eventEqual(transaction, 'FundsWalletUpdated', { newFundsWallet: address1 });

		assert.equal(await depot.fundsWallet(), address1);
	});

	it('should not set funds wallet when not invoked by owner', async () => {
		await assert.revert(depot.setFundsWallet(address2, { from: deployerAccount }));
	});

	it('should set oracle when invoked by owner', async () => {
		const txn = await depot.setOracle(address2, { from: owner });
		assert.eventEqual(txn, 'OracleUpdated', { newOracle: address2 });

		assert.equal(await depot.oracle(), address2);
	});

	it('should not set oracle when not invoked by owner', async () => {
		await assert.revert(depot.setOracle(address3, { from: deployerAccount }));
	});

	it('should set synth when invoked by owner', async () => {
		const transaction = await depot.setSynth(address3, { from: owner });
		assert.eventEqual(transaction, 'SynthUpdated', { newSynthContract: address3 });

		assert.equal(await depot.synth(), address3);
	});

	it('should not set synth when not invoked by owner', async () => {
		await assert.revert(depot.setSynth(address4, { from: deployerAccount }));
	});

	it('should set synthetix when invoked by owner', async () => {
		const transaction = await depot.setSynthetix(address4, { from: owner });
		assert.eventEqual(transaction, 'SynthetixUpdated', { newSynthetixContract: address4 });

		assert.equal(await depot.synthetix(), address4);
	});

	it('should not set synthetix when not invoked by owner', async () => {
		await assert.revert(depot.setSynthetix(owner, { from: deployerAccount }));
	});

	it('should not set price stale period when not invoked by owner', async () => {
		await assert.revert(depot.setPriceStalePeriod(60, { from: deployerAccount }));
	});

	it('should set price stale period when invoked by owner', async () => {
		const stalePeriod = 5 * 60 * 60; // Five hours

		const txn = await depot.setPriceStalePeriod(stalePeriod, { from: owner });
		assert.eventEqual(txn, 'PriceStalePeriodUpdated', { priceStalePeriod: stalePeriod });

		assert.bnEqual(await depot.priceStalePeriod(), stalePeriod);
	});

	it('should update prices when invoked by oracle', async () => {
		const now = await currentTime();
		const usdEth = '994957049546843687330';
		const usdSnx = '157474638738934625';

		const txn = await depot.updatePrices(usdEth, usdSnx, now, {
			from: oracle,
		});

		assert.eventEqual(txn, 'PricesUpdated', {
			newEthPrice: usdEth,
			newSynthetixPrice: usdSnx,
			timeSent: now,
		});

		const snxUSDFromContract = await depot.usdToSnxPrice();
		const ethUSDFromContract = await depot.usdToEthPrice();
		const lastPriceUpdateTimeFromContract = await depot.lastPriceUpdateTime();

		assert.equal(snxUSDFromContract.toString(), usdSnx);
		assert.equal(ethUSDFromContract.toString(), usdEth);
		assert.equal(lastPriceUpdateTimeFromContract.toString(), now.toString());
	});

	it('should not update prices if time sent is lesser than last updated price time', async () => {
		// Send a price update through, just like the above test so we know our values.
		const now = await currentTime();
		const usdEth = '100';
		const usdSnx = '200';

		await depot.updatePrices(usdEth, usdSnx, now, {
			from: oracle,
		});

		// Unsuccessful price update attempt
		await assert.revert(
			depot.updatePrices('300', '400', now - 1, {
				from: oracle,
			})
		);

		const snxUSDFromContract = await depot.usdToSnxPrice();
		const EthUSDFromContract = await depot.usdToEthPrice();
		const lastPriceUpdateTimeFromContract = await depot.lastPriceUpdateTime();

		assert.bnEqual(EthUSDFromContract, usdEth);
		assert.bnEqual(snxUSDFromContract, usdSnx);
		assert.bnEqual(lastPriceUpdateTimeFromContract, now);
	});

	it('should not update prices if time sent is more than (current time stamp + ORACLE_FUTURE_LIMIT)', async () => {
		const lastPriceUpdateTime = await depot.lastPriceUpdateTime();
		const oracleFutureLimit = await depot.ORACLE_FUTURE_LIMIT();
		const snxUSD = await depot.usdToSnxPrice();
		const ethUSD = await depot.usdToEthPrice();

		// Unsuccessful price update attempt
		await assert.revert(
			depot.updatePrices(ethUSD, snxUSD, lastPriceUpdateTime + oracleFutureLimit, {
				from: oracle,
			})
		);

		const snxUSDFromContract = await depot.usdToSnxPrice();
		const ethUSDFromContract = await depot.usdToEthPrice();
		const lastPriceUpdateTimeFromContract = await depot.lastPriceUpdateTime();

		assert.bnEqual(snxUSDFromContract, snxUSD);
		assert.bnEqual(ethUSDFromContract, ethUSD);
		assert.bnEqual(lastPriceUpdateTimeFromContract, lastPriceUpdateTime);
	});

	it('should not update prices when not invoked by oracle', async () => {
		const now = await currentTime();
		const usdEth = '994957049546843687330';
		const usdSnx = '157474638738934625';

		await assert.revert(
			depot.updatePrices(usdEth, usdSnx, now, {
				from: address1,
			})
		);
	});

	it('should allow the owner to set the minimum deposit amount', async () => {
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

	it('should not allow someone other than owner to set the minimum deposit amount', async () => {
		const minimumDepositAmount = toUnit('100');
		await assert.revert(depot.setMinimumDepositAmount(minimumDepositAmount, { from: address1 }));
	});

	it('should not allow the owner to set the minimum deposit amount to be less than 1 sUSD', async () => {
		const minimumDepositAmount = toUnit('.5');
		await assert.revert(depot.setMinimumDepositAmount(minimumDepositAmount, { from: address1 }));
	});

	it('should not allow the owner to set the minimum deposit amount to be zero', async () => {
		const minimumDepositAmount = toUnit('0');
		await assert.revert(depot.setMinimumDepositAmount(minimumDepositAmount, { from: address1 }));
	});

	describe('should increment depositor smallDeposits balance', async () => {
		const synthsBalance = toUnit('100');
		const depositor = address1;

		beforeEach(async () => {
			// We need the owner to issue synths
			await synthetix.issueMaxSynths({ from: owner });
			// Set up the depositor with an amount of synths to deposit.
			await synth.methods['transfer(address,uint256)'](depositor, synthsBalance, {
				from: owner,
			});
		});

		it('if the deposit synth amount is a tiny amount', async () => {
			const synthsToDeposit = toUnit('0.01');
			// Depositor should initially have a smallDeposits balance of 0
			const initialSmallDepositsBalance = await depot.smallDeposits(depositor);
			assert.equal(initialSmallDepositsBalance, 0);
			await synth.methods['transfer(address,uint256)'](depot.address, synthsToDeposit, {
				from: depositor,
			});
			// Now balance should be equal to the amount we just sent minus the fees
			const smallDepositsBalance = await depot.smallDeposits(depositor);
			const amountDepotReceived = await feePool.amountReceivedFromTransfer(synthsToDeposit);
			assert.bnEqual(smallDepositsBalance, amountDepotReceived);
		});

		it('if the deposit synth of 10 amount is less than the minimumDepositAmount', async () => {
			const synthsToDeposit = toUnit('10');
			// Depositor should initially have a smallDeposits balance of 0
			const initialSmallDepositsBalance = await depot.smallDeposits(depositor);
			assert.equal(initialSmallDepositsBalance, 0);

			await synth.methods['transfer(address,uint256)'](depot.address, synthsToDeposit, {
				from: depositor,
			});

			// Now balance should be equal to the amount we just sent minus the fees
			const smallDepositsBalance = await depot.smallDeposits(depositor);
			const amountDepotReceived = await feePool.amountReceivedFromTransfer(synthsToDeposit);
			assert.bnEqual(smallDepositsBalance, amountDepotReceived);
		});

		it('if the deposit synth amount of 49.99 is less than the minimumDepositAmount', async () => {
			const synthsToDeposit = toUnit('49.99');
			// Depositor should initially have a smallDeposits balance of 0
			const initialSmallDepositsBalance = await depot.smallDeposits(depositor);
			assert.equal(initialSmallDepositsBalance, 0);

			await synth.methods['transfer(address,uint256)'](depot.address, synthsToDeposit, {
				from: depositor,
			});

			// Now balance should be equal to the amount we just sent minus the fees
			const smallDepositsBalance = await depot.smallDeposits(depositor);
			const amountDepotReceived = await feePool.amountReceivedFromTransfer(synthsToDeposit);
			assert.bnEqual(smallDepositsBalance, amountDepotReceived);
		});
	});

	describe('should accept synth deposits', async () => {
		const synthsBalance = toUnit('100');
		const depositor = address1;

		beforeEach(async () => {
			// We need the owner to issue synths
			await synthetix.issueMaxSynths({ from: owner });
			// Set up the depositor with an amount of synths to deposit.
			await synth.methods['transfer(address,uint256)'](depositor, synthsBalance, {
				from: owner,
			});
		});

		it('if the deposit synth amount of 50 is the minimumDepositAmount', async () => {
			const synthsToDeposit = toUnit('50');

			await synth.methods['transfer(address,uint256)'](depot.address, synthsToDeposit, {
				from: depositor,
			});

			const events = await depot.getPastEvents();
			const synthDepositEvent = events.find(log => log.event === 'SynthDeposit');
			const synthDepositIndex = synthDepositEvent.args.depositIndex.toString();

			assert.eventEqual(synthDepositEvent, 'SynthDeposit', {
				user: depositor,
				amount: synthsToDeposit,
				depositIndex: synthDepositIndex,
			});

			const depotSynthBalanceCurrent = await synth.balanceOf(depot.address);
			assert.bnEqual(depotSynthBalanceCurrent, synthsToDeposit);

			const depositStartIndexAfter = await depot.depositStartIndex();
			const synthDeposit = await depot.deposits.call(depositStartIndexAfter);
			assert.equal(synthDeposit.user, depositor);
			assert.bnEqual(synthDeposit.amount, synthsToDeposit);
		});

		it('if the deposit synth amount of 51 is more than the minimumDepositAmount', async () => {
			const synthsToDeposit = toUnit('51');
			await synth.methods['transfer(address,uint256)'](depot.address, synthsToDeposit, {
				from: depositor,
			});

			const events = await depot.getPastEvents();
			const synthDepositEvent = events.find(log => log.event === 'SynthDeposit');
			const synthDepositIndex = synthDepositEvent.args.depositIndex.toString();

			assert.eventEqual(synthDepositEvent, 'SynthDeposit', {
				user: depositor,
				amount: synthsToDeposit,
				depositIndex: synthDepositIndex,
			});

			const depotSynthBalanceCurrent = await synth.balanceOf(depot.address);
			assert.bnEqual(depotSynthBalanceCurrent, synthsToDeposit);

			const depositStartIndexAfter = await depot.depositStartIndex();
			const synthDeposit = await depot.deposits.call(depositStartIndexAfter);
			assert.equal(synthDeposit.user, depositor);
			assert.bnEqual(synthDeposit.amount, synthsToDeposit);
		});
	});

	describe('should not exchange ether for synths', async () => {
		let fundsWalletFromContract;
		let fundsWalletEthBalanceBefore;
		let synthsBalance;
		let feePoolProxy;
		let depotSynthBalanceBefore;

		beforeEach(async () => {
			fundsWalletFromContract = await depot.fundsWallet();
			fundsWalletEthBalanceBefore = await getEthBalance(fundsWallet);
			// We need the owner to issue synths
			await synthetix.issueMaxSynths({ from: owner });
			// Set up the depot so it contains some synths to convert Ether for
			synthsBalance = await synth.balanceOf(owner, { from: owner });
			await synth.methods['transfer(address,uint256)'](depot.address, synthsBalance.toString(), {
				from: owner,
			});
			feePoolProxy = await synth.feePoolProxy();
			depotSynthBalanceBefore = await synth.balanceOf(depot.address);
		});

		it('if the price is stale', async () => {
			const priceStalePeriod = await depot.priceStalePeriod();
			await fastForward(priceStalePeriod);

			// Attempt exchange
			await assert.revert(
				depot.exchangeEtherForSynths({
					from: address1,
					amount: 10,
				})
			);
			const depotSynthBalanceCurrent = await synth.balanceOf(depot.address);
			assert.bnEqual(depotSynthBalanceCurrent, depotSynthBalanceBefore);
			assert.bnEqual(await synth.balanceOf(address1), 0);
			assert.bnEqual(await synth.feePoolProxy(), feePoolProxy);
			assert.equal(fundsWalletFromContract, fundsWallet);
			assert.bnEqual(await getEthBalance(fundsWallet), fundsWalletEthBalanceBefore);
		});

		it('if the contract is paused', async () => {
			// Pause Contract
			await depot.setPaused(true, { from: owner });

			// Attempt exchange
			await assert.revert(
				depot.exchangeEtherForSynths({
					from: address1,
					amount: 10,
				})
			);

			const depotSynthBalanceCurrent = await synth.balanceOf(depot.address);
			assert.bnEqual(depotSynthBalanceCurrent, depotSynthBalanceBefore);
			assert.bnEqual(await synth.balanceOf(address1), 0);
			assert.equal(fundsWalletFromContract, fundsWallet);
			assert.bnEqual(await getEthBalance(fundsWallet), fundsWalletEthBalanceBefore.toString());
		});
	});

	describe('Ensure user can exchange ETH for Synths where the amount', async () => {
		const depositor = address1;
		const depositor2 = address2;
		const purchaser = address3;
		const synthsBalance = web3.utils.toWei('1000');
		const usdEth = web3.utils.toWei('500');

		beforeEach(async () => {
			// We need the owner to issue synths
			await synthetix.issueMaxSynths({ from: owner });

			// Assert that there are no deposits already.
			const depositStartIndex = await depot.depositStartIndex();
			const depositEndIndex = await depot.depositEndIndex();

			assert.equal(depositStartIndex, 0);
			assert.equal(depositEndIndex, 0);

			// Set up the depositor with an amount of synths to deposit.
			await synth.methods['transfer(address,uint256)'](depositor, synthsBalance.toString(), {
				from: owner,
			});
			await synth.methods['transfer(address,uint256)'](depositor2, synthsBalance.toString(), {
				from: owner,
			});
		});

		it('exactly matches one deposit (and that the queue is correctly updated)', async () => {
			const synthsToDeposit = toUnit('500');
			const ethToSend = toUnit('1');
			const depositorStartingBalance = await getEthBalance(depositor);

			// Send the synths to the Token Depot.
			const depositTxn = await synth.methods['transfer(address,uint256)'](
				depot.address,
				synthsToDeposit,
				{
					from: depositor,
				}
			);

			const gasPaid = web3.utils.toBN(depositTxn.receipt.gasUsed * 20000000000);

			const depositStartIndex = await depot.depositStartIndex();
			const depositEndIndex = await depot.depositEndIndex();

			// Assert that there is now one deposit in the queue.
			assert.equal(depositStartIndex, 0);
			assert.equal(depositEndIndex, 1);

			// And assert that our total has increased by the right amount.
			const totalSellableDeposits = await depot.totalSellableDeposits();
			assert.bnEqual(totalSellableDeposits, synthsToDeposit);

			// Now purchase some.
			const txn = await depot.exchangeEtherForSynths({
				from: purchaser,
				value: ethToSend,
			});

			// Exchange("ETH", msg.value, "sUSD", fulfilled);
			const exchangeEvent = txn.logs.find(log => log.event === 'Exchange');
			assert.eventEqual(exchangeEvent, 'Exchange', {
				fromCurrency: 'ETH',
				fromAmount: ethToSend,
				toCurrency: 'sUSD',
				toAmount: synthsToDeposit,
			});

			// We need to calculate the amount - fees the purchaser is supposed to get
			const amountReceived = await feePool.amountReceivedFromTransfer(synthsToDeposit);

			// Purchaser should have received the Synths
			const purchaserSynthBalance = await synth.balanceOf(purchaser);
			const depotSynthBalance = await synth.balanceOf(depot.address);

			assert.equal(depotSynthBalance, 0);
			assert.bnEqual(purchaserSynthBalance, amountReceived);

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

		it('is less than one deposit (and that the queue is correctly updated)', async () => {
			const synthsToDeposit = toUnit('500');
			const ethToSend = toUnit('0.5');

			// Send the synths to the Token Depot.
			await synth.methods['transfer(address,uint256)'](depot.address, synthsToDeposit, {
				from: depositor,
			});

			const depositStartIndex = await depot.depositStartIndex();
			const depositEndIndex = await depot.depositEndIndex();

			// Assert that there is now one deposit in the queue.
			assert.equal(depositStartIndex, 0);
			assert.equal(depositEndIndex, 1);

			// And assert that our total has increased by the right amount.
			const totalSellableDeposits = await depot.totalSellableDeposits();
			assert.bnEqual(totalSellableDeposits, synthsToDeposit);

			assert.bnEqual(await depot.totalSellableDeposits(), (await depot.deposits(0)).amount);

			// Now purchase some.
			const txn = await depot.exchangeEtherForSynths({
				from: purchaser,
				value: ethToSend,
			});

			// Exchange("ETH", msg.value, "sUSD", fulfilled);
			const exchangeEvent = txn.logs.find(log => log.event === 'Exchange');
			assert.eventEqual(exchangeEvent, 'Exchange', {
				fromCurrency: 'ETH',
				fromAmount: ethToSend,
				toCurrency: 'sUSD',
				toAmount: synthsToDeposit.div(web3.utils.toBN('2')),
			});

			// We should have one deposit in the queue with half the amount
			assert.equal(await depot.depositStartIndex(), 0);
			assert.equal(await depot.depositEndIndex(), 1);

			assert.bnEqual(await depot.totalSellableDeposits(), (await depot.deposits(0)).amount);

			assert.bnEqual(
				await depot.totalSellableDeposits(),
				synthsToDeposit.div(web3.utils.toBN('2'))
			);
		});

		it('exceeds one deposit (and that the queue is correctly updated)', async () => {
			const synthsToDeposit = web3.utils.toWei('600');
			const totalSynthsDeposit = web3.utils.toWei('1200');
			const ethToSend = web3.utils.toWei('2');

			// Send the synths to the Token Depot.
			await synth.methods['transfer(address,uint256)'](depot.address, synthsToDeposit, {
				from: depositor,
			});
			await synth.methods['transfer(address,uint256)'](depot.address, synthsToDeposit, {
				from: depositor2,
			});

			const depositStartIndex = await depot.depositStartIndex();
			const depositEndIndex = await depot.depositEndIndex();

			// Assert that there is now two deposits in the queue.
			assert.equal(depositStartIndex, 0);
			assert.equal(depositEndIndex, 2);

			// And assert that our total has increased by the right amount.
			const totalSellableDeposits = await depot.totalSellableDeposits();
			assert.bnEqual(totalSellableDeposits, totalSynthsDeposit);

			// Now purchase some.
			const transaction = await depot.exchangeEtherForSynths({
				from: purchaser,
				value: ethToSend,
			});

			// Exchange("ETH", msg.value, "sUSD", fulfilled);
			const exchangeEvent = transaction.logs.find(log => log.event === 'Exchange');
			const synthsAmount = multiplyDecimal(ethToSend, usdEth);

			assert.eventEqual(exchangeEvent, 'Exchange', {
				fromCurrency: 'ETH',
				fromAmount: ethToSend,
				toCurrency: 'sUSD',
				toAmount: synthsAmount,
			});

			// We need to calculate the amount - fees the purchaser is supposed to get
			const amountReceived = await feePool.amountReceivedFromTransfer(synthsAmount);

			// Purchaser should have received the Synths
			const purchaserSynthBalance = await synth.balanceOf(purchaser);
			const depotSynthBalance = await synth.balanceOf(depot.address);
			const remainingSynths = web3.utils.toBN(totalSynthsDeposit).sub(synthsAmount);
			assert.bnEqual(purchaserSynthBalance, amountReceived);

			assert.bnEqual(depotSynthBalance, remainingSynths);

			// We should have one deposit left in the queue
			assert.equal(await depot.depositStartIndex(), 1);
			assert.equal(await depot.depositEndIndex(), 2);

			// And our total should be totalSynthsDeposit - last purchase
			assert.bnEqual(await depot.totalSellableDeposits(), remainingSynths);
		});

		it('exceeds available synths (and that the remainder of the ETH is correctly refunded)', async () => {
			const synthsToDeposit = web3.utils.toWei('400');
			const ethToSend = web3.utils.toWei('2');
			const purchaserInitialBalance = await getEthBalance(purchaser);
			// Send the synths to the Token Depot.
			await synth.methods['transfer(address,uint256)'](depot.address, synthsToDeposit, {
				from: depositor,
			});

			// Assert that there is now one deposit in the queue.
			assert.equal(await depot.depositStartIndex(), 0);
			assert.equal(await depot.depositEndIndex(), 1);

			// And assert that our total has increased by the right amount.
			const totalSellableDeposits = await depot.totalSellableDeposits();
			assert.equal(totalSellableDeposits.toString(), synthsToDeposit);

			// Now purchase some.
			const txn = await depot.exchangeEtherForSynths({
				from: purchaser,
				value: ethToSend,
			});

			const gasPaid = web3.utils.toBN(txn.receipt.gasUsed * 20000000000);

			// Exchange("ETH", msg.value, "sUSD", fulfilled);
			const exchangeEvent = txn.logs.find(log => log.event === 'Exchange');

			assert.eventEqual(exchangeEvent, 'Exchange', {
				fromCurrency: 'ETH',
				fromAmount: ethToSend,
				toCurrency: 'sUSD',
				toAmount: synthsToDeposit,
			});

			// We need to calculate the amount - fees the purchaser is supposed to get
			const amountReceived = await feePool.amountReceivedFromTransfer(synthsToDeposit);
			const synthsAvailableInETH = divideDecimal(synthsToDeposit, usdEth);

			// Purchaser should have received the total available synths
			const purchaserSynthBalance = await synth.balanceOf(purchaser);
			assert.equal(amountReceived.toString(), purchaserSynthBalance.toString());

			// Token Depot should have 0 synths left
			const depotSynthBalance = await synth.balanceOf(depot.address);
			assert.equal(depotSynthBalance, 0);

			// The purchaser should have received the refund
			// which can be checked by initialBalance = endBalance + fees + amount of synths bought in ETH
			const purchaserEndingBalance = await getEthBalance(purchaser);
			assert.bnEqual(
				web3.utils.toBN(purchaserInitialBalance),
				web3.utils
					.toBN(purchaserEndingBalance)
					.add(gasPaid)
					.add(synthsAvailableInETH)
			);
		});

		it('Ensure user can withdraw their Synth deposit', async () => {
			const synthsToDeposit = web3.utils.toWei('500');
			// Send the synths to the Token Depot.
			await synth.methods['transfer(address,uint256)'](depot.address, synthsToDeposit, {
				from: depositor,
			});

			const events = await depot.getPastEvents();
			const synthDepositEvent = events.find(log => log.event === 'SynthDeposit');
			const synthDepositIndex = synthDepositEvent.args.depositIndex.toString();

			// And assert that our total has increased by the right amount.
			const totalSellableDeposits = await depot.totalSellableDeposits();
			assert.equal(totalSellableDeposits, synthsToDeposit);

			// Wthdraw the deposited synths
			const txn = await depot.withdrawMyDepositedSynths({ from: depositor });
			const depositRemovedEvent = txn.logs[0];
			const withdrawEvent = txn.logs[1];

			// The sent synths should be equal the initial deposit
			assert.eventEqual(depositRemovedEvent, 'SynthDepositRemoved', {
				user: depositor,
				amount: synthsToDeposit,
				depositIndex: synthDepositIndex,
			});

			// Tells the DApps the deposit is removed from the fifi queue
			assert.eventEqual(withdrawEvent, 'SynthWithdrawal', {
				user: depositor,
				amount: synthsToDeposit,
			});
		});

		it('Ensure user can withdraw their Synth deposit even if they sent an amount smaller than the minimum required', async () => {
			const synthsToDeposit = toUnit('10');

			await synth.methods['transfer(address,uint256)'](depot.address, synthsToDeposit, {
				from: depositor,
			});

			// Now balance should be equal to the amount we just sent minus the fees
			const smallDepositsBalance = await depot.smallDeposits(depositor);
			assert.bnEqual(smallDepositsBalance, synthsToDeposit);

			// Wthdraw the deposited synths
			const txn = await depot.withdrawMyDepositedSynths({ from: depositor });
			const withdrawEvent = txn.logs[0];

			// The sent synths should be equal the initial deposit
			assert.eventEqual(withdrawEvent, 'SynthWithdrawal', {
				user: depositor,
				amount: synthsToDeposit,
			});
		});

		it('Ensure user can withdraw their multiple Synth deposits when they sent amounts smaller than the minimum required', async () => {
			const synthsToDeposit1 = toUnit('10');
			const synthsToDeposit2 = toUnit('15');
			const totalSynthDeposits = synthsToDeposit1.add(synthsToDeposit2);

			await synth.methods['transfer(address,uint256)'](depot.address, synthsToDeposit1, {
				from: depositor,
			});

			await synth.methods['transfer(address,uint256)'](depot.address, synthsToDeposit2, {
				from: depositor,
			});

			// Now balance should be equal to the amount we just sent minus the fees
			const smallDepositsBalance = await depot.smallDeposits(depositor);
			assert.bnEqual(smallDepositsBalance, synthsToDeposit1.add(synthsToDeposit2));

			// Wthdraw the deposited synths
			const txn = await depot.withdrawMyDepositedSynths({ from: depositor });
			const withdrawEvent = txn.logs[0];

			// The sent synths should be equal the initial deposit
			assert.eventEqual(withdrawEvent, 'SynthWithdrawal', {
				user: depositor,
				amount: totalSynthDeposits,
			});
		});

		it('Ensure user can exchange ETH for Synths after a withdrawal and that the queue correctly skips the empty entry', async () => {
			//   - e.g. Deposits of [1, 2, 3], user withdraws 2, so [1, (empty), 3], then
			//      - User can exchange for 1, and queue is now [(empty), 3]
			//      - User can exchange for 2 and queue is now [2]
			const deposit1 = web3.utils.toWei('100');
			const deposit2 = web3.utils.toWei('200');
			const deposit3 = web3.utils.toWei('300');
			const ethToSend = web3.utils.toWei('0.2');

			// Send the synths to the Token Depot.
			await synth.methods['transfer(address,uint256)'](depot.address, deposit1, {
				from: depositor,
			});
			await synth.methods['transfer(address,uint256)'](depot.address, deposit2, {
				from: depositor2,
			});
			await synth.methods['transfer(address,uint256)'](depot.address, deposit3, {
				from: depositor,
			});

			// Assert that there is now three deposits in the queue.
			assert.equal(await depot.depositStartIndex(), 0);
			assert.equal(await depot.depositEndIndex(), 3);

			// Depositor 2 withdraws Synths
			await depot.withdrawMyDepositedSynths({ from: depositor2 });

			// Queue should be  [1, (empty), 3]
			const queueResultForDeposit2 = await depot.deposits(1);
			assert.equal(queueResultForDeposit2.amount, 0);

			// User exchange ETH for Synths (same amount as first deposit)
			await depot.exchangeEtherForSynths({
				from: purchaser,
				value: ethToSend,
			});

			// Queue should now be [(empty), 3].
			assert.equal(await depot.depositStartIndex(), 1);
			assert.equal(await depot.depositEndIndex(), 3);
			const queueResultForDeposit1 = await depot.deposits(1);
			assert.equal(queueResultForDeposit1.amount, 0);

			// User exchange ETH for Synths
			await depot.exchangeEtherForSynths({
				from: purchaser,
				value: ethToSend,
			});

			// Queue should now be [(deposit3 - synthsPurchasedAmount )]
			const remainingSynths =
				web3.utils.fromWei(deposit3) - web3.utils.fromWei(ethToSend) * web3.utils.fromWei(usdEth);
			assert.equal(await depot.depositStartIndex(), 2);
			assert.equal(await depot.depositEndIndex(), 3);
			const totalSellableDeposits = await depot.totalSellableDeposits();
			assert.equal(totalSellableDeposits.toString(), web3.utils.toWei(remainingSynths.toString()));
		});

		it('Ensure multiple users can make multiple Synth deposits', async () => {
			const deposit1 = web3.utils.toWei('100');
			const deposit2 = web3.utils.toWei('200');
			const deposit3 = web3.utils.toWei('300');
			const deposit4 = web3.utils.toWei('400');

			// Send the synths to the Token Depot.
			await synth.methods['transfer(address,uint256)'](depot.address, deposit1, {
				from: depositor,
			});
			await synth.methods['transfer(address,uint256)'](depot.address, deposit2, {
				from: depositor2,
			});
			await synth.methods['transfer(address,uint256)'](depot.address, deposit3, {
				from: depositor,
			});
			await synth.methods['transfer(address,uint256)'](depot.address, deposit4, {
				from: depositor2,
			});

			// We should have now 4 deposits
			assert.equal(await depot.depositStartIndex(), 0);
			assert.equal(await depot.depositEndIndex(), 4);
		});

		it('Ensure multiple users can make multiple Synth deposits and multiple withdrawals (and that the queue is correctly updated)', async () => {
			const deposit1 = web3.utils.toWei('100');
			const deposit2 = web3.utils.toWei('200');
			const deposit3 = web3.utils.toWei('300');
			const deposit4 = web3.utils.toWei('400');

			// Send the synths to the Token Depot.
			await synth.methods['transfer(address,uint256)'](depot.address, deposit1, {
				from: depositor,
			});
			await synth.methods['transfer(address,uint256)'](depot.address, deposit2, {
				from: depositor,
			});
			await synth.methods['transfer(address,uint256)'](depot.address, deposit3, {
				from: depositor2,
			});
			await synth.methods['transfer(address,uint256)'](depot.address, deposit4, {
				from: depositor2,
			});

			// We should have now 4 deposits
			assert.equal(await depot.depositStartIndex(), 0);
			assert.equal(await depot.depositEndIndex(), 4);

			// Depositors withdraws all his deposits
			await depot.withdrawMyDepositedSynths({ from: depositor });

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

	describe('Ensure user can exchange ETH for Synthetix', async function() {
		const purchaser = address1;
		let depot;
		let synthetix;
		const ethUSD = web3.utils.toWei('500');
		const snxUSD = web3.utils.toWei('.10');

		this.beforeEach(async () => {
			depot = await Depot.deployed();
			synthetix = await Synthetix.deployed();
			synth = await Synth.deployed();
			// We need to send some SNX to the Token Depot contract
			await synthetix.methods['transfer(address,uint256)'](
				depot.address,
				web3.utils.toWei('1000000'),
				{
					from: owner,
				}
			);
		});

		it('ensure user get the correct amount of SNX after sending ETH', async () => {
			const ethToSend = toUnit('10');

			const purchaserSNXStartBalance = await synthetix.balanceOf(purchaser);
			// Purchaser should not have SNX yet
			assert.equal(purchaserSNXStartBalance, 0);

			// Purchaser sends ETH
			await depot.exchangeEtherForSynthetix({
				from: purchaser,
				value: ethToSend,
			});

			const purchaseValueInSynths = multiplyDecimal(ethToSend, ethUSD);
			const purchaseValueInSynthsAfterFees = await feePool.amountReceivedFromTransfer(
				purchaseValueInSynths
			);
			const purchaseValueInSynthetix = divideDecimal(purchaseValueInSynthsAfterFees, snxUSD);

			const purchaserSNXEndBalance = await synthetix.balanceOf(purchaser);

			// Purchaser SNX balance should be equal to the purchase value we calculated above
			assert.bnEqual(purchaserSNXEndBalance, purchaseValueInSynthetix);
		});
	});

	describe('Ensure user can exchange Synths for Synthetix', async function() {
		const purchaser = address1;
		const purchaserSynthAmount = toUnit('2000');
		const depotSNXAmount = toUnit('1000000');
		let depot;
		let synthetix;
		let synth;
		const snxUSD = toUnit('.10');
		const synthsToSend = toUnit('1');

		this.beforeEach(async () => {
			depot = await Depot.deployed();
			synthetix = await Synthetix.deployed();
			synth = await Synth.at(await synthetix.synths(sUsdHex));

			// We need the owner to issue synths
			await synthetix.issueSynths(toUnit('50000'), { from: owner });
			// Send the purchaser some synths
			await synth.methods['transfer(address,uint256)'](purchaser, purchaserSynthAmount, {
				from: owner,
			});
			// We need to send some SNX to the Token Depot contract
			await synthetix.methods['transfer(address,uint256)'](depot.address, depotSNXAmount, {
				from: owner,
			});

			await synth.approve(depot.address, synthsToSend, { from: purchaser });

			const depotSNXBalance = await synthetix.balanceOf(depot.address);
			const purchaserSynthBalance = await synth.balanceOf(purchaser);
			assert.bnEqual(depotSNXBalance, depotSNXAmount);
			assert.bnEqual(purchaserSynthBalance, purchaserSynthAmount);
		});

		it('ensure user gets the correct amount of SNX after sending 10 sUSD', async () => {
			const purchaserSNXStartBalance = await synthetix.balanceOf(purchaser);
			// Purchaser should not have SNX yet
			assert.equal(purchaserSNXStartBalance, 0);

			// Purchaser sends sUSD
			const txn = await depot.exchangeSynthsForSynthetix(synthsToSend, {
				from: purchaser,
			});

			const purchaseValueInSynthsAfterFees = await feePool.amountReceivedFromTransfer(synthsToSend);
			const purchaseValueInSynthetix = divideDecimal(purchaseValueInSynthsAfterFees, snxUSD);

			const purchaserSNXEndBalance = await synthetix.balanceOf(purchaser);

			// Purchaser SNX balance should be equal to the purchase value we calculated above
			assert.bnEqual(purchaserSNXEndBalance, purchaseValueInSynthetix);

			// assert the exchange event
			const exchangeEvent = txn.logs.find(log => log.event === 'Exchange');

			assert.eventEqual(exchangeEvent, 'Exchange', {
				fromCurrency: 'sUSD',
				fromAmount: synthsToSend,
				toCurrency: 'SNX',
				toAmount: purchaseValueInSynthetix,
			});
		});
	});
});
