const fs = require('fs');
const path = require('path');
const { contract, config, artifacts } = require('@nomiclabs/buidler');
const { wrap, knownAccounts } = require('../..');
const { assert } = require('../contracts/common');
const { toUnit, multiplyDecimalRound, fastForward } = require('../utils')();
const Web3 = require('web3');
const {
	detectNetworkName,
	connectContracts,
	ensureAccountHasEther,
	ensureAccountHassUSD,
	ensureAccountHassETH,
	skipWaitingPeriod,
	simulateExchangeRates,
	takeDebtSnapshot,
	mockOptimismBridge,
	implementsMultiCollateral,
	resumeSystem,
} = require('./utils');

const { toBytes32 } = require('../..');

contract('MultiCollateral (prod tests)', accounts => {
	const [, user1] = accounts;

	let owner;

	let network, deploymentPath;

	let CollateralManager,
		CollateralManagerState,
		CollateralErc20,
		CollateralEth,
		CollateralShort,
		DebtCache,
		ReadProxyAddressResolver,
		SynthsUSD;

	before('prepare', async function() {
		network = await detectNetworkName();
		const { getUsers, getPathToNetwork } = wrap({ network, fs, path });

		owner = getUsers({ network, user: 'owner' }).address;

		deploymentPath = config.deploymentPath || getPathToNetwork(network);

		if (config.useOvm) {
			return this.skip();
		}

		await resumeSystem({ owner, network, deploymentPath });

		if (!(await implementsMultiCollateral({ network, deploymentPath }))) {
			this.skip();
		}

		if (config.patchFreshDeployment) {
			await simulateExchangeRates({ network, deploymentPath });
			await takeDebtSnapshot({ network, deploymentPath });
			await mockOptimismBridge({ network, deploymentPath });
		}

		({
			CollateralManager,
			CollateralManagerState,
			CollateralErc20,
			CollateralEth,
			CollateralShort,
			DebtCache,
			SynthsUSD,
			ReadProxyAddressResolver,
		} = await connectContracts({
			network,
			requests: [
				{ contractName: 'CollateralManagerState' },
				{ contractName: 'CollateralManager' },
				{ contractName: 'CollateralErc20' },
				{ contractName: 'CollateralEth' },
				{ contractName: 'CollateralShort' },
				{ contractName: 'DebtCache' },
				{ contractName: 'ReadProxyAddressResolver' },
				{ contractName: 'SynthsUSD', abiName: 'Synth' },
			],
		}));

		await skipWaitingPeriod({ network });

		await ensureAccountHasEther({
			amount: toUnit('1'),
			account: owner,
			fromAccount: accounts[7],
			network,
		});
		await ensureAccountHassUSD({
			amount: toUnit('1100'),
			account: user1,
			fromAccount: owner,
			network,
		});
		await ensureAccountHassETH({
			amount: toUnit('2'),
			account: user1,
			fromAccount: owner,
			network,
		});
	});

	describe('general multicollateral state', () => {
		it('has the expected resolver set', async () => {
			assert.equal(await CollateralManager.resolver(), ReadProxyAddressResolver.address);
		});

		it('CollateralManager has the expected owner set', async () => {
			assert.equal(await CollateralManager.owner(), owner);
		});

		it('CollateralErc20 hase the expected owner set', async () => {
			assert.equal(await CollateralErc20.owner(), owner);
		});

		it('CollateralEth hase the expected owner set', async () => {
			assert.equal(await CollateralEth.owner(), owner);
		});

		it('CollateralShort hase the expected owner set', async () => {
			assert.equal(await CollateralShort.owner(), owner);
		});
	});

	describe('when using multiple types of loans', () => {
		itCorrectlyManagesLoansWith({
			type: 'CollateralEth',
			collateralCurrency: 'ETH',
			amountToDeposit: toUnit('2'),
			borrowCurrency: 'sUSD',
			amountToBorrow: toUnit('0.5'),
		});

		itCorrectlyManagesLoansWith({
			type: 'CollateralErc20',
			collateralCurrency: 'renBTC',
			amountToDeposit: Web3.utils.toBN('1000000000'), // 10 renBTC (renBTC uses 8 decimals)
			borrowCurrency: 'sUSD',
			amountToBorrow: toUnit('0.5'),
		});

		itCorrectlyManagesLoansWith({
			type: 'CollateralShort',
			collateralCurrency: 'sUSD',
			amountToDeposit: toUnit('1000'),
			borrowCurrency: 'sETH',
			amountToBorrow: toUnit('0.01'),
		});
	});

	function itCorrectlyManagesLoansWith({
		type,
		collateralCurrency,
		amountToDeposit,
		borrowCurrency,
		amountToBorrow,
	}) {
		let CollateralContract, CollateralStateContract;

		const borrowCurrencyBytes = toBytes32(borrowCurrency);

		describe(`when using ${type} to deposit ${amountToDeposit.toString()} ${collateralCurrency} and borrow ${amountToBorrow.toString()} ${borrowCurrency}`, () => {
			let tx;

			before('retrieve the collateral/state contract pair', async () => {
				switch (type) {
					case 'CollateralEth':
						CollateralContract = CollateralEth;
						break;
					case 'CollateralErc20':
						CollateralContract = CollateralErc20;
						break;
					case 'CollateralShort':
						CollateralContract = CollateralShort;
						break;
					default:
						throw new Error(`Unsupported collateral type ${type}`);
				}

				CollateralStateContract = await artifacts
					.require('CollateralState')
					.at(await CollateralContract.state());
			});

			describe('when opening the loan', () => {
				let loan, loanId;
				let totalLoansBefore,
					longBefore,
					totalLongBefore,
					shortBefore,
					totalShortBefore,
					issueFeeRate,
					systemDebtBefore;

				before('record current values', async () => {
					issueFeeRate = await CollateralContract.issueFeeRate();
					totalLoansBefore = await CollateralManagerState.totalLoans();
					longBefore = await CollateralManager.long(borrowCurrencyBytes);
					totalLongBefore = (await CollateralManager.totalLong()).susdValue;
					shortBefore = await CollateralManager.short(borrowCurrencyBytes);
					totalShortBefore = (await CollateralManager.totalShort()).susdValue;
					systemDebtBefore = (await DebtCache.currentDebt()).debt;
				});

				before('open the loan', async () => {
					if (type === 'CollateralErc20') {
						const underlyingToken = await CollateralErc20.underlyingContract();
						const renBTC = await artifacts.require('ERC20').at(underlyingToken);

						let altHolder;
						if (network !== 'local') {
							const account = knownAccounts[network].find(a => a.name === 'renBTCWallet');
							if (account) {
								altHolder = account.address;
							}
						}

						const renHolder = network === 'local' ? owner : altHolder || owner;
						if (!renHolder) {
							throw new Error(`No known renBTC holder for network ${network}`);
						}

						// give them more, so they can deposit after opening
						const transferAmount = Web3.utils.toBN('10000000000');

						await renBTC.transfer(user1, transferAmount, {
							from: renHolder,
						});

						await renBTC.approve(CollateralContract.address, toUnit('10000'), { from: user1 });

						tx = await CollateralContract.open(
							amountToDeposit,
							amountToBorrow,
							borrowCurrencyBytes,
							{
								from: user1,
							}
						);
					} else if (type === 'CollateralShort') {
						await SynthsUSD.approve(CollateralContract.address, toUnit('10000'), { from: user1 });

						tx = await CollateralContract.open(
							amountToDeposit,
							amountToBorrow,
							borrowCurrencyBytes,
							{
								from: user1,
							}
						);
					} else {
						tx = await CollateralContract.open(amountToBorrow, borrowCurrencyBytes, {
							from: user1,
							value: amountToDeposit,
						});
					}

					const event = tx.receipt.logs.find(l => l.event === 'LoanCreated');
					loanId = event.args.id;

					loan = await CollateralStateContract.getLoan(user1, loanId);
				});

				it('emits a LoanCreated event with the expected parameters', async () => {
					const event = tx.receipt.logs.find(l => l.event === 'LoanCreated');

					assert.equal(event.args.account, user1);
					assert.bnEqual(event.args.id, totalLoansBefore.add(Web3.utils.toBN(1)));
					assert.bnEqual(event.args.amount, amountToBorrow);
					assert.equal(event.args.currency, borrowCurrencyBytes);
					assert.bnEqual(
						event.args.issuanceFee,
						multiplyDecimalRound(amountToBorrow, issueFeeRate)
					);

					if (type === 'CollateralErc20') {
						// Account for renBTC scaling
						assert.bnEqual(
							event.args.collateral,
							amountToDeposit.mul(Web3.utils.toBN('10000000000'))
						);
					} else {
						assert.bnEqual(event.args.collateral, amountToDeposit);
					}
				});

				it('updates the managers short/long values', async () => {
					if (type === 'CollateralShort') {
						const shortAfter = await CollateralManager.short(borrowCurrencyBytes);
						const totalShortAfter = (await CollateralManager.totalShort()).susdValue;

						assert.bnGt(shortAfter, shortBefore);
						assert.bnGt(totalShortAfter, totalShortBefore);
					} else {
						const longAfter = await CollateralManager.long(borrowCurrencyBytes);
						const totalLongAfter = (await CollateralManager.totalLong()).susdValue;

						assert.bnEqual(longAfter, longBefore.add(amountToBorrow));
						assert.bnEqual(totalLongAfter, totalLongBefore.add(amountToBorrow));
					}
				});

				it('does not increment the system debt', async () => {
					const systemDebtAfter = (await DebtCache.currentDebt()).debt;

					assert.bnEqual(systemDebtAfter, systemDebtBefore);
				});

				describe('when depositing more collateral', () => {
					let cratioBefore;

					before('skip waiting period', async () => {
						const period = await CollateralContract.interactionDelay();

						await fastForward(period.toString());
					});

					before('record current values', async () => {
						loan = await CollateralStateContract.getLoan(user1, loanId);
						cratioBefore = await CollateralContract.collateralRatio(loan);
					});

					before('deposit', async () => {
						if (type === 'CollateralErc20') {
							tx = await CollateralContract.deposit(user1, loanId, Web3.utils.toBN('1000000000'), {
								from: user1,
							});
						} else if (type === 'CollateralShort') {
							tx = await CollateralContract.deposit(user1, loanId, toUnit('200'), {
								from: user1,
							});
						} else {
							tx = await CollateralContract.deposit(user1, loanId, {
								from: user1,
								value: toUnit('1'),
							});
						}

						loan = await CollateralStateContract.getLoan(user1, loanId);
					});

					it('incrementes the cratio', async () => {
						const cratioAfter = await CollateralContract.collateralRatio(loan);

						assert.bnGt(cratioAfter, cratioBefore);
					});
				});

				describe('when removing collateral', () => {
					let cratioBefore;

					before('skip waiting period', async () => {
						const period = await CollateralContract.interactionDelay();

						await fastForward(period.toString());
					});

					before('record current values', async () => {
						loan = await CollateralStateContract.getLoan(user1, loanId);
						cratioBefore = await CollateralContract.collateralRatio(loan);
					});

					before('withdraw', async () => {
						tx = await CollateralContract.withdraw(loanId, Web3.utils.toBN('100'), {
							from: user1,
						});

						loan = await CollateralStateContract.getLoan(user1, loanId);
					});

					it('decrementes the cratio', async () => {
						const cratioAfter = await CollateralContract.collateralRatio(loan);

						assert.bnLt(cratioAfter, cratioBefore);
					});
				});

				describe('when repaying the loan', () => {
					before('skip waiting period', async () => {
						const period = await CollateralContract.interactionDelay();

						await fastForward(period.toString());
					});

					before('repay all debt', async () => {
						tx = await CollateralContract.repay(user1, loanId, amountToBorrow, {
							from: user1,
						});
					});

					describe('when closing the loan', () => {
						before('skip waiting period', async () => {
							const period = await CollateralContract.interactionDelay();

							await fastForward(period.toString());
						});

						before('close the loan', async () => {
							tx = await CollateralContract.close(loanId, {
								from: user1,
							});

							loan = await CollateralStateContract.getLoan(user1, loanId);
						});

						it('shows that the loan amount is zero', async () => {
							assert.bnEqual(loan.amount, '0');
						});
					});
				});
			});
		});
	}
});
