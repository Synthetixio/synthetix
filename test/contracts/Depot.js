'use strict';

const { contract, web3 } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const {
	currentTime,
	fastForward,
	getEthBalance,
	toUnit,
	multiplyDecimal,
	divideDecimal,
} = require('../utils')();

const {
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
	setStatus,
} = require('./helpers');

const { mockToken, setupAllContracts } = require('./setup');

const { toBytes32 } = require('../..');

contract('Depot', async accounts => {
	let synthetix, synth, depot, addressResolver, systemStatus, exchangeRates, ethRate, snxRate;

	const [, owner, oracle, fundsWallet, address1, address2, address3] = accounts;

	const [SNX, ETH] = ['SNX', 'ETH'].map(toBytes32);

	const approveAndDepositSynths = async (synthsToDeposit, depositor) => {
		// Approve Transaction
		await synth.approve(depot.address, synthsToDeposit, { from: depositor });

		// Deposit sUSD in Depot
		// console.log('Deposit sUSD in Depot amount', synthsToDeposit, depositor);
		const txn = await depot.depositSynths(synthsToDeposit, {
			from: depositor,
		});

		return txn;
	};

	// Run once at beginning - snapshots will take care of resetting this before each test
	before(async () => {
		// Mock sUSD as Depot only needs its ERC20 methods (System Pause will not work for suspending sUSD transfers)
		[{ token: synth }] = await Promise.all([
			mockToken({ accounts, synth: 'sUSD', name: 'Synthetic USD', symbol: 'sUSD' }),
		]);

		({
			Depot: depot,
			AddressResolver: addressResolver,
			ExchangeRates: exchangeRates,
			SystemStatus: systemStatus,
			Synthetix: synthetix,
		} = await setupAllContracts({
			accounts,
			mocks: {
				// mocks necessary for address resolver imports
				SynthsUSD: synth,
			},
			contracts: [
				'Depot',
				'AddressResolver',
				'ExchangeRates',
				'SystemStatus',
				'Synthetix',
				'Issuer',
			],
		}));
	});

	addSnapshotBeforeRestoreAfterEach();

	beforeEach(async () => {
		const timestamp = await currentTime();

		snxRate = toUnit('0.1');
		ethRate = toUnit('172');

		await exchangeRates.updateRates([SNX, ETH], [snxRate, ethRate], timestamp, {
			from: oracle,
		});
	});

	it('should set constructor params on deployment', async () => {
		assert.equal(await depot.fundsWallet(), fundsWallet);
		assert.equal(await depot.resolver(), addressResolver.address);
	});

	describe('Restricted methods', () => {
		it('ensure only known functions are mutative', () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: depot.abi,
				hasFallback: true,
				ignoreParents: ['Pausable', 'ReentrancyGuard', 'MixinResolver'],
				expected: [
					'depositSynths',
					'exchangeEtherForSNX',
					'exchangeEtherForSNXAtRate',
					'exchangeEtherForSynths',
					'exchangeEtherForSynthsAtRate',
					'exchangeSynthsForSNX',
					'exchangeSynthsForSNXAtRate',
					'setFundsWallet',
					'setMaxEthPurchase',
					'setMinimumDepositAmount',
					'withdrawMyDepositedSynths',
					'withdrawSynthetix',
				],
			});
		});

		describe('setMaxEthPurchase()', () => {
			it('can only be invoked by the owner', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: depot.setMaxEthPurchase,
					args: [toUnit('25')],
					accounts,
					address: owner,
					reason: 'Only the contract owner may perform this action',
				});
			});
			it('when invoked by the owner, changes the expected property', async () => {
				const maxEthPurchase = toUnit('20');
				await depot.setMaxEthPurchase(maxEthPurchase, { from: owner });
				assert.bnEqual(await depot.maxEthPurchase(), maxEthPurchase);
			});
		});

		describe('setFundsWallet()', () => {
			it('can only be invoked by the owner', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: depot.setFundsWallet,
					args: [address1],
					accounts,
					address: owner,
					reason: 'Only the contract owner may perform this action',
				});
			});
			it('when invoked by the owner, changes the expected property', async () => {
				const transaction = await depot.setFundsWallet(address1, { from: owner });
				assert.eventEqual(transaction, 'FundsWalletUpdated', { newFundsWallet: address1 });

				assert.equal(await depot.fundsWallet(), address1);
			});
		});

		describe('setMinimumDepositAmount()', () => {
			it('can only be invoked by the owner', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: depot.setMinimumDepositAmount,
					args: [toUnit('100')],
					accounts,
					address: owner,
					reason: 'Only the contract owner may perform this action',
				});
			});
			it('can only be invoked by the owner, and with less than a unit', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: depot.setMinimumDepositAmount,
					args: [toUnit('0.1')],
					accounts,
					address: owner,
					reason: 'Only the contract owner may perform this action',
					skipPassCheck: true,
				});
			});
			it('when invoked by the owner, changes the expected property', async () => {
				const minimumDepositAmount = toUnit('100');
				const setMinimumDepositAmountTx = await depot.setMinimumDepositAmount(
					minimumDepositAmount,
					{
						from: owner,
					}
				);
				assert.eventEqual(setMinimumDepositAmountTx, 'MinimumDepositAmountUpdated', {
					amount: minimumDepositAmount,
				});
				const newMinimumDepositAmount = await depot.minimumDepositAmount();
				assert.bnEqual(newMinimumDepositAmount, minimumDepositAmount);
			});
			it('when invoked by the owner for less than a unit, reverts', async () => {
				await assert.revert(
					depot.setMinimumDepositAmount(toUnit('0.1'), { from: owner }),
					'Minimum deposit amount must be greater than UNIT'
				);
				await assert.revert(
					depot.setMinimumDepositAmount('0', { from: owner }),
					'Minimum deposit amount must be greater than UNIT'
				);
			});
		});
	});

	describe('should increment depositor smallDeposits balance', async () => {
		const synthsBalance = toUnit('100');
		const depositor = address1;

		beforeEach(async () => {
			// Set up the depositor with an amount of synths to deposit.
			await synth.transfer(depositor, synthsBalance, {
				from: owner,
			});
		});

		describe('when the system is suspended', () => {
			beforeEach(async () => {
				await setStatus({ owner, systemStatus, section: 'System', suspend: true });
			});
			it('when depositSynths is invoked, it reverts with operation prohibited', async () => {
				await assert.revert(
					approveAndDepositSynths(toUnit('1'), depositor),
					'Operation prohibited'
				);
			});

			describe('when the system is resumed', () => {
				beforeEach(async () => {
					await setStatus({ owner, systemStatus, section: 'System', suspend: false });
				});
				it('when depositSynths is invoked, it works as expected', async () => {
					await approveAndDepositSynths(toUnit('1'), depositor);
				});
			});
		});

		it('if the deposit synth amount is a tiny amount', async () => {
			const synthsToDeposit = toUnit('0.01');
			// Depositor should initially have a smallDeposits balance of 0
			const initialSmallDepositsBalance = await depot.smallDeposits(depositor);
			assert.equal(initialSmallDepositsBalance, 0);

			await approveAndDepositSynths(synthsToDeposit, depositor);

			// Now balance should be equal to the amount we just sent
			const smallDepositsBalance = await depot.smallDeposits(depositor);
			assert.bnEqual(smallDepositsBalance, synthsToDeposit);
		});

		it('if the deposit synth of 10 amount is less than the minimumDepositAmount', async () => {
			const synthsToDeposit = toUnit('10');
			// Depositor should initially have a smallDeposits balance of 0
			const initialSmallDepositsBalance = await depot.smallDeposits(depositor);
			assert.equal(initialSmallDepositsBalance, 0);

			await approveAndDepositSynths(synthsToDeposit, depositor);

			// Now balance should be equal to the amount we just sent
			const smallDepositsBalance = await depot.smallDeposits(depositor);
			assert.bnEqual(smallDepositsBalance, synthsToDeposit);
		});

		it('if the deposit synth amount of 49.99 is less than the minimumDepositAmount', async () => {
			const synthsToDeposit = toUnit('49.99');
			// Depositor should initially have a smallDeposits balance of 0
			const initialSmallDepositsBalance = await depot.smallDeposits(depositor);
			assert.equal(initialSmallDepositsBalance, 0);

			await approveAndDepositSynths(synthsToDeposit, depositor);

			// Now balance should be equal to the amount we just sent
			const smallDepositsBalance = await depot.smallDeposits(depositor);
			assert.bnEqual(smallDepositsBalance, synthsToDeposit);
		});
	});

	describe('should accept synth deposits', async () => {
		const synthsBalance = toUnit('100');
		const depositor = address1;

		beforeEach(async () => {
			// Set up the depositor with an amount of synths to deposit.
			await synth.transfer(depositor, synthsBalance, {
				from: owner,
			});
		});

		it('if the deposit synth amount of 50 is the minimumDepositAmount', async () => {
			const synthsToDeposit = toUnit('50');

			await approveAndDepositSynths(synthsToDeposit, depositor);

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

			await approveAndDepositSynths(synthsToDeposit, depositor);

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
		let depotSynthBalanceBefore;

		beforeEach(async () => {
			fundsWalletFromContract = await depot.fundsWallet();
			fundsWalletEthBalanceBefore = await getEthBalance(fundsWallet);
			// Set up the depot so it contains some synths to convert Ether for
			synthsBalance = await synth.balanceOf(owner, { from: owner });

			await approveAndDepositSynths(synthsBalance, owner);

			depotSynthBalanceBefore = await synth.balanceOf(depot.address);
		});

		it('if the price is stale', async () => {
			const rateStalePeriod = await exchangeRates.rateStalePeriod();
			await fastForward(Number(rateStalePeriod) + 1);

			// Attempt exchange
			await assert.revert(
				depot.exchangeEtherForSynths({
					from: address1,
					value: 10,
				}),
				'Rate invalid or not a synth'
			);
			const depotSynthBalanceCurrent = await synth.balanceOf(depot.address);
			assert.bnEqual(depotSynthBalanceCurrent, depotSynthBalanceBefore);
			assert.bnEqual(await synth.balanceOf(address1), 0);
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
					value: 10,
				}),
				'This action cannot be performed while the contract is paused'
			);

			const depotSynthBalanceCurrent = await synth.balanceOf(depot.address);
			assert.bnEqual(depotSynthBalanceCurrent, depotSynthBalanceBefore);
			assert.bnEqual(await synth.balanceOf(address1), 0);
			assert.equal(fundsWalletFromContract, fundsWallet);
			assert.bnEqual(await getEthBalance(fundsWallet), fundsWalletEthBalanceBefore.toString());
		});

		it('if the system is suspended', async () => {
			const depositStartIndex = await depot.depositStartIndex();
			const depositEndIndex = await depot.depositEndIndex();

			// Assert that there is now one deposit in the queue.
			assert.equal(depositStartIndex, 0);
			assert.equal(depositEndIndex, 1);

			await setStatus({ owner, systemStatus, section: 'System', suspend: true });
			await assert.revert(
				depot.exchangeEtherForSynths({
					from: address1,
					value: toUnit('1'),
				}),
				'Operation prohibited'
			);
			// resume
			await setStatus({ owner, systemStatus, section: 'System', suspend: false });
			// no errors
			await depot.exchangeEtherForSynths({
				from: address1,
				value: 10,
			});
		});
	});

	describe('Ensure user can exchange ETH for Synths where the amount', async () => {
		const depositor = address1;
		const depositor2 = address2;
		const purchaser = address3;
		const synthsBalance = toUnit('1000');
		let ethUsd;

		beforeEach(async () => {
			ethUsd = await exchangeRates.rateForCurrency(ETH);

			// Assert that there are no deposits already.
			const depositStartIndex = await depot.depositStartIndex();
			const depositEndIndex = await depot.depositEndIndex();

			assert.equal(depositStartIndex, 0);
			assert.equal(depositEndIndex, 0);

			// Set up the depositor with an amount of synths to deposit.
			await synth.transfer(depositor, synthsBalance.toString(), {
				from: owner,
			});
			await synth.transfer(depositor2, synthsBalance.toString(), {
				from: owner,
			});
		});

		['exchangeEtherForSynths function directly', 'fallback function'].forEach(type => {
			const isFallback = type === 'fallback function';

			describe(`using the ${type}`, () => {
				describe('when the system is suspended', () => {
					const ethToSendFromPurchaser = { from: purchaser, value: toUnit('1') };
					let fnc;
					beforeEach(async () => {
						fnc = isFallback ? 'sendTransaction' : 'exchangeEtherForSynths';
						// setup with deposits
						await approveAndDepositSynths(toUnit('1000'), depositor);

						await setStatus({ owner, systemStatus, section: 'System', suspend: true });
					});
					it(`when ${type} is invoked, it reverts with operation prohibited`, async () => {
						await assert.revert(depot[fnc](ethToSendFromPurchaser), 'Operation prohibited');
					});

					describe('when the system is resumed', () => {
						beforeEach(async () => {
							await setStatus({ owner, systemStatus, section: 'System', suspend: false });
						});
						it('when depositSynths is invoked, it works as expected', async () => {
							await depot[fnc](ethToSendFromPurchaser);
						});
					});
				});
			});

			it('exactly matches one deposit (and that the queue is correctly updated) [ @cov-skip ]', async () => {
				const gasPrice = 1e9;

				const synthsToDeposit = ethUsd;
				const ethToSend = toUnit('1');
				const depositorStartingBalance = await getEthBalance(depositor);

				// Send the synths to the Depot.
				const approveTxn = await synth.approve(depot.address, synthsToDeposit, {
					from: depositor,
					gasPrice,
				});
				const gasPaidApprove = web3.utils.toBN(approveTxn.receipt.gasUsed * gasPrice);

				// Deposit sUSD in Depot
				const depositTxn = await depot.depositSynths(synthsToDeposit, {
					from: depositor,
					gasPrice,
				});

				const gasPaidDeposit = web3.utils.toBN(depositTxn.receipt.gasUsed * gasPrice);

				const depositStartIndex = await depot.depositStartIndex();
				const depositEndIndex = await depot.depositEndIndex();

				// Assert that there is now one deposit in the queue.
				assert.equal(depositStartIndex, 0);
				assert.equal(depositEndIndex, 1);

				// And assert that our total has increased by the right amount.
				const totalSellableDeposits = await depot.totalSellableDeposits();
				assert.bnEqual(totalSellableDeposits, synthsToDeposit);

				// Now purchase some.
				let txn;

				if (isFallback) {
					txn = await depot.sendTransaction({
						from: purchaser,
						value: ethToSend,
					});
				} else {
					txn = await depot.exchangeEtherForSynths({
						from: purchaser,
						value: ethToSend,
					});
				}

				// Exchange("ETH", msg.value, "sUSD", fulfilled);
				const exchangeEvent = txn.logs.find(log => log.event === 'Exchange');
				assert.eventEqual(exchangeEvent, 'Exchange', {
					fromCurrency: 'ETH',
					fromAmount: ethToSend,
					toCurrency: 'sUSD',
					toAmount: synthsToDeposit,
				});

				// Purchaser should have received the Synths
				const purchaserSynthBalance = await synth.balanceOf(purchaser);
				assert.bnEqual(purchaserSynthBalance, synthsToDeposit);

				// Depot should no longer have the synths
				const depotSynthBalance = await synth.balanceOf(depot.address);
				assert.equal(depotSynthBalance, 0);

				// We should have no deposit in the queue anymore
				assert.equal(await depot.depositStartIndex(), 1);
				assert.equal(await depot.depositEndIndex(), 1);

				// And our total should be 0 as the purchase amount was equal to the deposit
				assert.equal(await depot.totalSellableDeposits(), 0);

				// The depositor should have received the ETH
				const depositorEndingBalance = await getEthBalance(depositor);
				assert.bnEqual(
					web3.utils
						.toBN(depositorEndingBalance)
						.add(gasPaidApprove)
						.add(gasPaidDeposit),
					web3.utils.toBN(depositorStartingBalance).add(ethToSend)
				);
			});

			it('is less than one deposit (and that the queue is correctly updated)', async () => {
				const synthsToDeposit = web3.utils.toBN(ethUsd); // ETH Price
				const ethToSend = toUnit('0.5');

				// Send the synths to the Token Depot.
				await approveAndDepositSynths(synthsToDeposit, depositor);

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
				let txn;

				if (isFallback) {
					txn = await depot.sendTransaction({
						from: purchaser,
						value: ethToSend,
					});
				} else {
					txn = await depot.exchangeEtherForSynths({
						from: purchaser,
						value: ethToSend,
					});
				}

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
				const synthsToDeposit = toUnit('172'); // 1 ETH worth
				const totalSynthsDeposit = toUnit('344'); // 2 ETH worth
				const ethToSend = toUnit('1.5');

				// Send the synths to the Token Depot.
				await approveAndDepositSynths(synthsToDeposit, depositor);
				await approveAndDepositSynths(synthsToDeposit, depositor2);

				const depositStartIndex = await depot.depositStartIndex();
				const depositEndIndex = await depot.depositEndIndex();

				// Assert that there is now two deposits in the queue.
				assert.equal(depositStartIndex, 0);
				assert.equal(depositEndIndex, 2);

				// And assert that our total has increased by the right amount.
				const totalSellableDeposits = await depot.totalSellableDeposits();
				assert.bnEqual(totalSellableDeposits, totalSynthsDeposit);

				// Now purchase some.
				let transaction;
				if (isFallback) {
					transaction = await depot.sendTransaction({
						from: purchaser,
						value: ethToSend,
					});
				} else {
					transaction = await depot.exchangeEtherForSynths({
						from: purchaser,
						value: ethToSend,
					});
				}

				// Exchange("ETH", msg.value, "sUSD", fulfilled);
				const exchangeEvent = transaction.logs.find(log => log.event === 'Exchange');
				const synthsAmount = multiplyDecimal(ethToSend, ethUsd);

				assert.eventEqual(exchangeEvent, 'Exchange', {
					fromCurrency: 'ETH',
					fromAmount: ethToSend,
					toCurrency: 'sUSD',
					toAmount: synthsAmount,
				});

				// Purchaser should have received the Synths
				const purchaserSynthBalance = await synth.balanceOf(purchaser);
				const depotSynthBalance = await synth.balanceOf(depot.address);
				const remainingSynths = web3.utils.toBN(totalSynthsDeposit).sub(synthsAmount);
				assert.bnEqual(purchaserSynthBalance, synthsAmount);

				assert.bnEqual(depotSynthBalance, remainingSynths);

				// We should have one deposit left in the queue
				assert.equal(await depot.depositStartIndex(), 1);
				assert.equal(await depot.depositEndIndex(), 2);

				// And our total should be totalSynthsDeposit - last purchase
				assert.bnEqual(await depot.totalSellableDeposits(), remainingSynths);
			});

			xit('exceeds available synths (and that the remainder of the ETH is correctly refunded)', async () => {
				const gasPrice = 1e9;

				const ethToSend = toUnit('2');
				const synthsToDeposit = multiplyDecimal(ethToSend, ethRate); // 344
				const purchaserInitialBalance = await getEthBalance(purchaser);

				// Send the synths to the Token Depot.
				await approveAndDepositSynths(synthsToDeposit, depositor);

				// Assert that there is now one deposit in the queue.
				assert.equal(await depot.depositStartIndex(), 0);
				assert.equal(await depot.depositEndIndex(), 1);

				// And assert that our total has increased by the right amount.
				const totalSellableDeposits = await depot.totalSellableDeposits();
				assert.equal(totalSellableDeposits.toString(), synthsToDeposit);

				// Now purchase some
				let txn;

				if (isFallback) {
					txn = await depot.sendTransaction({
						from: purchaser,
						value: ethToSend,
						gasPrice,
					});
				} else {
					txn = await depot.exchangeEtherForSynths({
						from: purchaser,
						value: ethToSend,
						gasPrice,
					});
				}

				const gasPaid = web3.utils.toBN(txn.receipt.gasUsed * gasPrice);

				// Exchange("ETH", msg.value, "sUSD", fulfilled);
				const exchangeEvent = txn.logs.find(log => log.event === 'Exchange');

				assert.eventEqual(exchangeEvent, 'Exchange', {
					fromCurrency: 'ETH',
					fromAmount: ethToSend,
					toCurrency: 'sUSD',
					toAmount: synthsToDeposit,
				});

				// We need to calculate the amount - fees the purchaser is supposed to get
				const synthsAvailableInETH = divideDecimal(synthsToDeposit, ethUsd);

				// Purchaser should have received the total available synths
				const purchaserSynthBalance = await synth.balanceOf(purchaser);
				assert.equal(synthsToDeposit.toString(), purchaserSynthBalance.toString());

				// Token Depot should have 0 synths left
				const depotSynthBalance = await synth.balanceOf(depot.address);
				assert.equal(depotSynthBalance, 0);

				// The purchaser should have received the refund
				// which can be checked by initialBalance = endBalance + fees + amount of synths bought in ETH
				const purchaserEndingBalance = await getEthBalance(purchaser);

				// Note: currently failing under coverage via:
				// AssertionError: expected '10000000000000002397319999880134' to equal '10000000000000000000000000000000'
				// 		+ expected - actual
				// 		-10000000000000002397319999880134
				// 		+10000000000000000000000000000000
				assert.bnEqual(
					web3.utils
						.toBN(purchaserEndingBalance)
						.add(gasPaid)
						.add(synthsAvailableInETH),
					web3.utils.toBN(purchaserInitialBalance)
				);
			});
		});

		describe('exchangeEtherForSynthsAtRate', () => {
			const ethToSend = toUnit('1');
			let synthsToPurchase;
			let payload;
			let txn;

			beforeEach(async () => {
				synthsToPurchase = multiplyDecimal(ethToSend, ethRate);
				payload = { from: purchaser, value: ethToSend };
				await approveAndDepositSynths(toUnit('1000'), depositor);
			});

			describe('when the purchaser supplies a rate', () => {
				it('when exchangeEtherForSynthsAtRate is invoked, it works as expected', async () => {
					txn = await depot.exchangeEtherForSynthsAtRate(ethRate, payload);
					const exchangeEvent = txn.logs.find(log => log.event === 'Exchange');
					assert.eventEqual(exchangeEvent, 'Exchange', {
						fromCurrency: 'ETH',
						fromAmount: ethToSend,
						toCurrency: 'sUSD',
						toAmount: synthsToPurchase,
					});
				});
				it('when purchaser supplies a rate lower than the current rate', async () => {
					await assert.revert(
						depot.exchangeEtherForSynthsAtRate('99', payload),
						'Guaranteed rate would not be received'
					);
				});
				it('when purchaser supplies a rate higher than the current rate', async () => {
					await assert.revert(
						depot.exchangeEtherForSynthsAtRate('9999', payload),
						'Guaranteed rate would not be received'
					);
				});
				it('when the purchaser supplies a rate and the rate is changed in by the oracle', async () => {
					const timestamp = await currentTime();
					await exchangeRates.updateRates([SNX, ETH], ['0.1', '134'].map(toUnit), timestamp, {
						from: oracle,
					});
					await assert.revert(
						depot.exchangeEtherForSynthsAtRate(ethRate, payload),
						'Guaranteed rate would not be received'
					);
				});
			});
		});

		describe('exchangeEtherForSNXAtRate', () => {
			const ethToSend = toUnit('1');
			const ethToSendFromPurchaser = { from: purchaser, value: ethToSend };
			let snxToPurchase;
			let txn;

			beforeEach(async () => {
				const purchaseValueDollars = multiplyDecimal(ethToSend, ethRate);
				snxToPurchase = divideDecimal(purchaseValueDollars, snxRate);
				// Send some SNX to the Depot contract
				await synthetix.transfer(depot.address, toUnit('1000000'), {
					from: owner,
				});
			});

			describe('when the purchaser supplies a rate', () => {
				it('when exchangeEtherForSNXAtRate is invoked, it works as expected', async () => {
					txn = await depot.exchangeEtherForSNXAtRate(ethRate, snxRate, ethToSendFromPurchaser);
					const exchangeEvent = txn.logs.find(log => log.event === 'Exchange');

					assert.eventEqual(exchangeEvent, 'Exchange', {
						fromCurrency: 'ETH',
						fromAmount: ethToSend,
						toCurrency: 'SNX',
						toAmount: snxToPurchase,
					});
				});
				it('when purchaser supplies a rate lower than the current rate', async () => {
					await assert.revert(
						depot.exchangeEtherForSNXAtRate(ethRate, '99', ethToSendFromPurchaser),
						'Guaranteed synthetix rate would not be received'
					);
				});
				it('when purchaser supplies a rate higher than the current rate', async () => {
					await assert.revert(
						depot.exchangeEtherForSNXAtRate(ethRate, '9999', ethToSendFromPurchaser),
						'Guaranteed synthetix rate would not be received'
					);
				});
				it('when the purchaser supplies a rate and the rate is changed in by the oracle', async () => {
					const timestamp = await currentTime();
					await exchangeRates.updateRates([SNX, ETH], ['0.1', '134'].map(toUnit), timestamp, {
						from: oracle,
					});
					await assert.revert(
						depot.exchangeEtherForSNXAtRate(ethRate, snxRate, ethToSendFromPurchaser),
						'Guaranteed ether rate would not be received'
					);
				});
			});
		});

		describe('exchangeSynthsForSNXAtRate', () => {
			const purchaser = address1;
			const purchaserSynthAmount = toUnit('2000');
			const depotSNXAmount = toUnit('1000000');
			const synthsToSend = toUnit('1');
			const fromPurchaser = { from: purchaser };
			let snxToPurchase;
			let txn;

			beforeEach(async () => {
				// Send the purchaser some synths
				await synth.transfer(purchaser, purchaserSynthAmount, {
					from: owner,
				});
				// Send some SNX to the Token Depot contract
				await synthetix.transfer(depot.address, depotSNXAmount, {
					from: owner,
				});

				await synth.approve(depot.address, synthsToSend, fromPurchaser);

				const depotSNXBalance = await synthetix.balanceOf(depot.address);
				assert.bnEqual(depotSNXBalance, depotSNXAmount);

				snxToPurchase = divideDecimal(synthsToSend, snxRate);
			});

			describe('when the purchaser supplies a rate', () => {
				it('when exchangeSynthsForSNXAtRate is invoked, it works as expected', async () => {
					txn = await depot.exchangeSynthsForSNXAtRate(synthsToSend, snxRate, fromPurchaser);
					const exchangeEvent = txn.logs.find(log => log.event === 'Exchange');

					assert.eventEqual(exchangeEvent, 'Exchange', {
						fromCurrency: 'sUSD',
						fromAmount: synthsToSend,
						toCurrency: 'SNX',
						toAmount: snxToPurchase,
					});
				});
				it('when purchaser supplies a rate lower than the current rate', async () => {
					await assert.revert(
						depot.exchangeSynthsForSNXAtRate(synthsToSend, '99', fromPurchaser),
						'Guaranteed rate would not be received'
					);
				});
				it('when purchaser supplies a rate higher than the current rate', async () => {
					await assert.revert(
						depot.exchangeSynthsForSNXAtRate(synthsToSend, '9999', fromPurchaser),
						'Guaranteed rate would not be received'
					);
				});
				it('when the purchaser supplies a rate and the rate is changed in by the oracle', async () => {
					const timestamp = await currentTime();
					await exchangeRates.updateRates([SNX], ['0.05'].map(toUnit), timestamp, {
						from: oracle,
					});
					await assert.revert(
						depot.exchangeSynthsForSNXAtRate(synthsToSend, snxRate, fromPurchaser),
						'Guaranteed rate would not be received'
					);
				});
			});
		});

		describe('withdrawMyDepositedSynths()', () => {
			describe('when the system is suspended', () => {
				beforeEach(async () => {
					await approveAndDepositSynths(toUnit('100'), depositor);
					await setStatus({ owner, systemStatus, section: 'System', suspend: true });
				});
				it('when withdrawMyDepositedSynths() is invoked, it reverts with operation prohibited', async () => {
					await assert.revert(
						depot.withdrawMyDepositedSynths({ from: depositor }),
						'Operation prohibited'
					);
				});

				describe('when the system is resumed', () => {
					beforeEach(async () => {
						await setStatus({ owner, systemStatus, section: 'System', suspend: false });
					});
					it('when withdrawMyDepositedSynths() is invoked, it works as expected', async () => {
						await depot.withdrawMyDepositedSynths({ from: depositor });
					});
				});
			});

			it('Ensure user can withdraw their Synth deposit', async () => {
				const synthsToDeposit = toUnit('500');
				// Send the synths to the Token Depot.
				await approveAndDepositSynths(synthsToDeposit, depositor);

				const events = await depot.getPastEvents();
				const synthDepositEvent = events.find(log => log.event === 'SynthDeposit');
				const synthDepositIndex = synthDepositEvent.args.depositIndex.toString();

				// And assert that our total has increased by the right amount.
				const totalSellableDeposits = await depot.totalSellableDeposits();
				assert.bnEqual(totalSellableDeposits, synthsToDeposit);

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

				await approveAndDepositSynths(synthsToDeposit, depositor);

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

				await approveAndDepositSynths(synthsToDeposit1, depositor);

				await approveAndDepositSynths(synthsToDeposit2, depositor);

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
		});

		it('Ensure user can exchange ETH for Synths after a withdrawal and that the queue correctly skips the empty entry', async () => {
			//   - e.g. Deposits of [1, 2, 3], user withdraws 2, so [1, (empty), 3], then
			//      - User can exchange for 1, and queue is now [(empty), 3]
			//      - User can exchange for 2 and queue is now [2]
			const deposit1 = toUnit('172');
			const deposit2 = toUnit('200');
			const deposit3 = toUnit('300');

			// Send the synths to the Token Depot.
			await approveAndDepositSynths(deposit1, depositor);
			await approveAndDepositSynths(deposit2, depositor2);
			await approveAndDepositSynths(deposit3, depositor);

			// Assert that there is now three deposits in the queue.
			assert.equal(await depot.depositStartIndex(), 0);
			assert.equal(await depot.depositEndIndex(), 3);

			// Depositor 2 withdraws Synths
			await depot.withdrawMyDepositedSynths({ from: depositor2 });

			// Queue should be  [1, (empty), 3]
			const queueResultForDeposit2 = await depot.deposits(1);
			assert.equal(queueResultForDeposit2.amount, 0);

			// User exchange ETH for Synths (same amount as first deposit)
			const ethToSend = divideDecimal(deposit1, ethRate);
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
				web3.utils.fromWei(deposit3) - web3.utils.fromWei(ethToSend) * web3.utils.fromWei(ethUsd);
			assert.equal(await depot.depositStartIndex(), 2);
			assert.equal(await depot.depositEndIndex(), 3);
			const totalSellableDeposits = await depot.totalSellableDeposits();
			assert.equal(totalSellableDeposits.toString(), toUnit(remainingSynths.toString()));
		});

		it('Ensure multiple users can make multiple Synth deposits', async () => {
			const deposit1 = toUnit('100');
			const deposit2 = toUnit('200');
			const deposit3 = toUnit('300');
			const deposit4 = toUnit('400');

			// Send the synths to the Token Depot.
			await approveAndDepositSynths(deposit1, depositor);
			await approveAndDepositSynths(deposit2, depositor2);
			await approveAndDepositSynths(deposit3, depositor);
			await approveAndDepositSynths(deposit4, depositor2);

			// We should have now 4 deposits
			assert.equal(await depot.depositStartIndex(), 0);
			assert.equal(await depot.depositEndIndex(), 4);
		});

		it('Ensure multiple users can make multiple Synth deposits and multiple withdrawals (and that the queue is correctly updated)', async () => {
			const deposit1 = toUnit('100');
			const deposit2 = toUnit('200');
			const deposit3 = toUnit('300');
			const deposit4 = toUnit('400');

			// Send the synths to the Token Depot.
			await approveAndDepositSynths(deposit1, depositor);
			await approveAndDepositSynths(deposit2, depositor);
			await approveAndDepositSynths(deposit3, depositor2);
			await approveAndDepositSynths(deposit4, depositor2);

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

	describe('Ensure user can exchange ETH for SNX', async () => {
		const purchaser = address1;

		beforeEach(async () => {
			// Send some SNX to the Depot contract
			await synthetix.transfer(depot.address, toUnit('1000000'), {
				from: owner,
			});
		});

		describe('when the system is suspended', () => {
			beforeEach(async () => {
				await setStatus({ owner, systemStatus, section: 'System', suspend: true });
			});
			it('when exchangeEtherForSNX() is invoked, it reverts with operation prohibited', async () => {
				await assert.revert(
					depot.exchangeEtherForSNX({
						from: purchaser,
						value: toUnit('10'),
					}),
					'Operation prohibited'
				);
			});

			describe('when the system is resumed', () => {
				beforeEach(async () => {
					await setStatus({ owner, systemStatus, section: 'System', suspend: false });
				});
				it('when exchangeEtherForSNX() is invoked, it works as expected', async () => {
					await depot.exchangeEtherForSNX({
						from: purchaser,
						value: toUnit('10'),
					});
				});
			});
		});

		it('ensure user get the correct amount of SNX after sending ETH', async () => {
			const ethToSend = toUnit('10');

			const purchaserSNXStartBalance = await synthetix.balanceOf(purchaser);
			// Purchaser should not have SNX yet
			assert.equal(purchaserSNXStartBalance, 0);

			// Purchaser sends ETH
			await depot.exchangeEtherForSNX({
				from: purchaser,
				value: ethToSend,
			});

			const purchaseValueInSynths = multiplyDecimal(ethToSend, ethRate);
			const purchaseValueInSynthetix = divideDecimal(purchaseValueInSynths, snxRate);

			const purchaserSNXEndBalance = await synthetix.balanceOf(purchaser);

			// Purchaser SNX balance should be equal to the purchase value we calculated above
			assert.bnEqual(purchaserSNXEndBalance, purchaseValueInSynthetix);
		});
	});

	describe('Ensure user can exchange Synths for Synthetix', async () => {
		const purchaser = address1;
		const purchaserSynthAmount = toUnit('2000');
		const depotSNXAmount = toUnit('1000000');
		const synthsToSend = toUnit('1');

		beforeEach(async () => {
			// Send the purchaser some synths
			await synth.transfer(purchaser, purchaserSynthAmount, {
				from: owner,
			});
			// We need to send some SNX to the Token Depot contract
			await synthetix.transfer(depot.address, depotSNXAmount, {
				from: owner,
			});

			await synth.approve(depot.address, synthsToSend, { from: purchaser });

			const depotSNXBalance = await synthetix.balanceOf(depot.address);
			const purchaserSynthBalance = await synth.balanceOf(purchaser);
			assert.bnEqual(depotSNXBalance, depotSNXAmount);
			assert.bnEqual(purchaserSynthBalance, purchaserSynthAmount);
		});

		describe('when the system is suspended', () => {
			beforeEach(async () => {
				await setStatus({ owner, systemStatus, section: 'System', suspend: true });
			});
			it('when exchangeSynthsForSNX() is invoked, it reverts with operation prohibited', async () => {
				await assert.revert(
					depot.exchangeSynthsForSNX(synthsToSend, {
						from: purchaser,
					}),
					'Operation prohibited'
				);
			});

			describe('when the system is resumed', () => {
				beforeEach(async () => {
					await setStatus({ owner, systemStatus, section: 'System', suspend: false });
				});
				it('when exchangeSynthsForSNX() is invoked, it works as expected', async () => {
					await depot.exchangeSynthsForSNX(synthsToSend, {
						from: purchaser,
					});
				});
			});
		});

		it('ensure user gets the correct amount of SNX after sending 10 sUSD', async () => {
			const purchaserSNXStartBalance = await synthetix.balanceOf(purchaser);
			// Purchaser should not have SNX yet
			assert.equal(purchaserSNXStartBalance, 0);

			// Purchaser sends sUSD
			const txn = await depot.exchangeSynthsForSNX(synthsToSend, {
				from: purchaser,
			});

			const purchaseValueInSynthetix = divideDecimal(synthsToSend, snxRate);

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

	describe('withdrawSynthetix', () => {
		const snxAmount = toUnit('1000000');

		beforeEach(async () => {
			// Send some SNX to the Depot contract
			await synthetix.transfer(depot.address, snxAmount, {
				from: owner,
			});
		});

		it('when non owner withdrawSynthetix calls then revert', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: depot.withdrawSynthetix,
				args: [snxAmount],
				accounts,
				address: owner,
				reason: 'Only the contract owner may perform this action',
			});
		});

		it('when owner calls withdrawSynthetix then withdrawSynthetix', async () => {
			const depotSNXBalanceBefore = await synthetix.balanceOf(depot.address);

			assert.bnEqual(depotSNXBalanceBefore, snxAmount);

			await depot.withdrawSynthetix(snxAmount, { from: owner });

			const depotSNXBalanceAfter = await synthetix.balanceOf(depot.address);
			assert.bnEqual(depotSNXBalanceAfter, toUnit('0'));
		});
	});
});
