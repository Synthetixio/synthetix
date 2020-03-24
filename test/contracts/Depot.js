require('.'); // import common test scaffolding

const {
	currentTime,
	fastForward,
	getEthBalance,
	toUnit,
	multiplyDecimal,
	divideDecimal,
} = require('../utils/testUtils');

const {
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
	setStatus,
} = require('../utils/setupUtils');

const { toBytes32 } = require('../../.');

const Synthetix = artifacts.require('Synthetix');
const Depot = artifacts.require('Depot');
const Synth = artifacts.require('Synth');
const AddressResolver = artifacts.require('AddressResolver');
const ExchangeRates = artifacts.require('ExchangeRates');

contract('Depot', async accounts => {
	let synthetix, synth, depot, addressResolver, exchangeRates;

	// const [sUSD, sETH] = ['sUSD', 'sETH'].map(toBytes32);

	const [deployerAccount, owner, oracle, fundsWallet, address1, address2, address3] = accounts;

	const [sUSD, sAUD, sEUR, sBTC, SNX, iBTC, sETH, ETH] = [
		'sUSD',
		'sAUD',
		'sEUR',
		'sBTC',
		'SNX',
		'iBTC',
		'sETH',
		'ETH',
	].map(toBytes32);

	const updateRatesWithDefaults = async () => {
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX, sBTC, iBTC, sETH, ETH],
			['0.5', '1.25', '0.1', '5000', '4000', '172', '172'].map(toUnit),
			timestamp,
			{
				from: oracle,
			}
		);
	};

	// const fastForwardAndUpdateRates = async seconds => {
	// 	console.log('fastForwardAndUpdateRates', seconds);
	// 	await fastForward(seconds);
	// 	await updateRatesWithDefaults();
	// };

	const approveAndDepositSynths = async (synthsToDeposit, depositor) => {
		// Approve Transaction
		// console.log('Approve Transaction on sUSD');
		await synth.approve(depot.address, synthsToDeposit, { from: depositor });

		// Deposit sUSD in Depot
		// console.log('Deposit sUSD in Depot amount', synthsToDeposit, depositor);
		const txn = await depot.depositSynths(synthsToDeposit, {
			from: depositor,
		});

		return txn;
	};

	beforeEach(async () => {
		synthetix = await Synthetix.deployed();
		synth = await Synth.at(await synthetix.synths(sUSD));
		depot = await Depot.deployed();
		addressResolver = await AddressResolver.deployed();
		exchangeRates = await ExchangeRates.deployed();
		await updateRatesWithDefaults();
	});

	it('should set constructor params on deployment', async () => {
		const instance = await Depot.new(owner, fundsWallet, addressResolver.address, {
			from: deployerAccount,
		});

		assert.equal(await instance.fundsWallet(), fundsWallet);
		assert.equal(await instance.resolver(), addressResolver.address);
	});

	describe('Restricted methods', () => {
		it('ensure only known functions are mutative', () => {
			ensureOnlyExpectedMutativeFunctions({
				abi: depot.abi,
				ignoreParents: ['SelfDestructible', 'Pausable', 'ReentrancyGuard', 'MixinResolver'],
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
			// We need the owner to issue synths
			await synthetix.issueMaxSynths({ from: owner });
			// Set up the depositor with an amount of synths to deposit.
			await synth.transfer(depositor, synthsBalance, {
				from: owner,
			});
		});

		describe('when the system is suspended', () => {
			beforeEach(async () => {
				await setStatus({ owner, section: 'System', suspend: true });
			});
			it('when depositSynths is invoked, it reverts with operation prohibited', async () => {
				await assert.revert(
					approveAndDepositSynths(toUnit('1'), depositor),
					'Operation prohibited'
				);
			});

			describe('when the system is resumed', () => {
				beforeEach(async () => {
					await setStatus({ owner, section: 'System', suspend: false });
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
			// We need the owner to issue synths
			await synthetix.issueMaxSynths({ from: owner });
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
			// We need the owner to issue synths
			await synthetix.issueMaxSynths({ from: owner });
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
				'Rate stale or not a synth'
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

			await setStatus({ owner, section: 'System', suspend: true });
			await assert.revert(
				depot.exchangeEtherForSynths({
					from: address1,
					value: toUnit('1'),
				}),
				'Operation prohibited'
			);
			// resume
			await setStatus({ owner, section: 'System', suspend: false });
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
		const synthsBalance = web3.utils.toWei('1000');
		const ethUsd = web3.utils.toWei('500');

		beforeEach(async () => {
			const timestamp = await currentTime();

			await exchangeRates.updateRates([ETH], [ethUsd], timestamp, {
				from: oracle,
			});

			// We need the owner to issue synths
			await synthetix.issueMaxSynths({ from: owner });

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
					let payload;
					let fnc;
					beforeEach(async () => {
						payload = { from: purchaser, value: toUnit('1') };
						fnc = isFallback ? 'sendTransaction' : 'exchangeEtherForSynths';
						// setup with deposits
						await approveAndDepositSynths(toUnit('1000'), depositor);

						await setStatus({ owner, section: 'System', suspend: true });
					});
					it(`when ${type} is invoked, it reverts with operation prohibited`, async () => {
						await assert.revert(depot[fnc](payload), 'Operation prohibited');
					});

					describe('when the system is resumed', () => {
						beforeEach(async () => {
							await setStatus({ owner, section: 'System', suspend: false });
						});
						it('when depositSynths is invoked, it works as expected', async () => {
							await depot[fnc](payload);
						});
					});
				});

				it('exactly matches one deposit (and that the queue is correctly updated) [ @cov-skip ]', async () => {
					const synthsToDeposit = ethUsd;
					const ethToSend = toUnit('1');
					const depositorStartingBalance = await getEthBalance(depositor);

					// Send the synths to the Depot.
					const approveTxn = await synth.approve(depot.address, synthsToDeposit, {
						from: depositor,
					});
					const gasPaidApprove = web3.utils.toBN(approveTxn.receipt.gasUsed * 20000000000);

					// Deposit sUSD in Depot
					const depositTxn = await depot.depositSynths(synthsToDeposit, {
						from: depositor,
					});

					const gasPaidDeposit = web3.utils.toBN(depositTxn.receipt.gasUsed * 20000000000);

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
						web3.utils.toBN(depositorStartingBalance).add(ethToSend),
						web3.utils
							.toBN(depositorEndingBalance)
							.add(gasPaidApprove)
							.add(gasPaidDeposit)
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
					const synthsToDeposit = web3.utils.toWei('600');
					const totalSynthsDeposit = web3.utils.toWei('1200');
					const ethToSend = web3.utils.toWei('2');

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

				it('exceeds available synths (and that the remainder of the ETH is correctly refunded) [ @cov-skip ]', async () => {
					const synthsToDeposit = web3.utils.toWei('400');
					const ethToSend = web3.utils.toWei('2');
					const purchaserInitialBalance = await getEthBalance(purchaser);

					// Send the synths to the Token Depot.
					await approveAndDepositSynths(synthsToDeposit, depositor);

					// Assert that there is now one deposit in the queue.
					assert.equal(await depot.depositStartIndex(), 0);
					assert.equal(await depot.depositEndIndex(), 1);

					// And assert that our total has increased by the right amount.
					const totalSellableDeposits = await depot.totalSellableDeposits();
					assert.equal(totalSellableDeposits.toString(), synthsToDeposit);

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
					assert.bnEqual(
						web3.utils.toBN(purchaserInitialBalance),
						web3.utils
							.toBN(purchaserEndingBalance)
							.add(gasPaid)
							.add(synthsAvailableInETH)
					);
				});
			});
		});

		describe('withdrawMyDepositedSynths()', () => {
			describe('when the system is suspended', () => {
				beforeEach(async () => {
					await approveAndDepositSynths(toUnit('100'), depositor);

					await setStatus({ owner, section: 'System', suspend: true });
				});
				it('when withdrawMyDepositedSynths() is invoked, it reverts with operation prohibited', async () => {
					await assert.revert(
						depot.withdrawMyDepositedSynths({ from: depositor }),
						'Operation prohibited'
					);
				});

				describe('when the system is resumed', () => {
					beforeEach(async () => {
						await setStatus({ owner, section: 'System', suspend: false });
					});
					it('when withdrawMyDepositedSynths() is invoked, it works as expected', async () => {
						await depot.withdrawMyDepositedSynths({ from: depositor });
					});
				});
			});

			it('Ensure user can withdraw their Synth deposit', async () => {
				const synthsToDeposit = web3.utils.toWei('500');
				// Send the synths to the Token Depot.
				await approveAndDepositSynths(synthsToDeposit, depositor);

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
			const deposit1 = web3.utils.toWei('100');
			const deposit2 = web3.utils.toWei('200');
			const deposit3 = web3.utils.toWei('300');
			const ethToSend = web3.utils.toWei('0.2');

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
			assert.equal(totalSellableDeposits.toString(), web3.utils.toWei(remainingSynths.toString()));
		});

		it('Ensure multiple users can make multiple Synth deposits', async () => {
			const deposit1 = web3.utils.toWei('100');
			const deposit2 = web3.utils.toWei('200');
			const deposit3 = web3.utils.toWei('300');
			const deposit4 = web3.utils.toWei('400');

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
			const deposit1 = web3.utils.toWei('100');
			const deposit2 = web3.utils.toWei('200');
			const deposit3 = web3.utils.toWei('300');
			const deposit4 = web3.utils.toWei('400');

			await approveAndDepositSynths(deposit1, depositor);
			await approveAndDepositSynths(deposit2, depositor);
			await approveAndDepositSynths(deposit3, depositor2);
			await approveAndDepositSynths(deposit4, depositor2);

			// Send the synths to the Token Depot.

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

	describe('Ensure user can exchange ETH for Synthetix', async () => {
		const purchaser = address1;
		let depot;
		let synthetix;
		const ethUSD = web3.utils.toWei('500');
		const snxUSD = web3.utils.toWei('.10');

		beforeEach(async () => {
			depot = await Depot.deployed();
			synthetix = await Synthetix.deployed();
			synth = await Synth.deployed();

			const timestamp = await currentTime();

			await exchangeRates.updateRates([SNX, ETH], [snxUSD, ethUSD], timestamp, {
				from: oracle,
			});

			// We need to send some SNX to the Token Depot contract
			await synthetix.transfer(depot.address, web3.utils.toWei('1000000'), {
				from: owner,
			});
		});

		describe('when the system is suspended', () => {
			beforeEach(async () => {
				await setStatus({ owner, section: 'System', suspend: true });
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
					await setStatus({ owner, section: 'System', suspend: false });
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

			const purchaseValueInSynths = multiplyDecimal(ethToSend, ethUSD);
			const purchaseValueInSynthetix = divideDecimal(purchaseValueInSynths, snxUSD);

			const purchaserSNXEndBalance = await synthetix.balanceOf(purchaser);

			// Purchaser SNX balance should be equal to the purchase value we calculated above
			assert.bnEqual(purchaserSNXEndBalance, purchaseValueInSynthetix);
		});
	});

	describe('Ensure user can exchange Synths for Synthetix', async () => {
		const purchaser = address1;
		const purchaserSynthAmount = toUnit('2000');
		const depotSNXAmount = toUnit('1000000');
		let depot;
		let synthetix;
		let synth;
		const snxUSD = toUnit('.10');
		const synthsToSend = toUnit('1');

		beforeEach(async () => {
			depot = await Depot.deployed();
			synthetix = await Synthetix.deployed();
			synth = await Synth.at(await synthetix.synths(sUSD));

			const timestamp = await currentTime();

			await exchangeRates.updateRates([SNX], [snxUSD], timestamp, {
				from: oracle,
			});

			// We need the owner to issue synths
			await synthetix.issueSynths(toUnit('50000'), { from: owner });
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
				await setStatus({ owner, section: 'System', suspend: true });
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
					await setStatus({ owner, section: 'System', suspend: false });
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

			const purchaseValueInSynthetix = divideDecimal(synthsToSend, snxUSD);

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
