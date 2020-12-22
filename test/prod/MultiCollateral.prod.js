const fs = require('fs');
const path = require('path');
const { contract, config, artifacts } = require('@nomiclabs/buidler');
const { wrap } = require('../../index.js');
const { assert } = require('../contracts/common');
const { toUnit, fastForward } = require('../utils')();
const Web3 = require('web3');
const {
	detectNetworkName,
	connectContracts,
	ensureAccountHasEther,
	ensureAccountHassUSD,
	skipWaitingPeriod,
	simulateExchangeRates,
	takeDebtSnapshot,
	mockOptimismBridge,
	implementsMultiCollateral,
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
				{ contractName: 'SynthsETH', abiName: 'Synth' },
				{ contractName: 'SynthsUSD', abiName: 'Synth' },
			],
		}));

		await skipWaitingPeriod({ network });

		// await ensureAccountHasEther({
		// 	amount: toUnit('1'),
		// 	account: owner,
		// 	fromAccount: accounts[7],
		// 	network,
		// });
		await ensureAccountHassUSD({
			amount: toUnit('1000'),
			account: user1,
			fromAccount: owner,
			network,
		});
	});

	describe('misc state', () => {
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

	// ------------------------------------------------------------
	// START
	// ------------------------------------------------------------

	const itCorrectlyManagesLoansWith = ({
		type,
		amountToDeposit,
		borrowCurrency,
		amountToBorrow,
	}) => {
		let CollateralContract, CollateralStateContract;

		const borrowCurrencyBytes = toBytes32(borrowCurrency);

		describe(`when depositing ${amountToDeposit.toString()} ${type} to borrow ${amountToBorrow.toString()} ${borrowCurrency}`, () => {
			let tx;
			let issueFeeRate;

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

			before('record current values', async () => {
				issueFeeRate = await CollateralContract.issueFeeRate();
			});

			describe('when opening the loan', () => {
				let loan, loanId;
				let totalLoansBefore,
					longBefore,
					totalLongBefore,
					shortBefore,
					totalShortBefore,
					systemDebtBefore;

				before('record current values', async () => {
					totalLoansBefore = await CollateralManagerState.totalLoans();
					longBefore = await CollateralManager.long(borrowCurrencyBytes);
					totalLongBefore = (await CollateralManager.totalLong()).susdValue;
					shortBefore = await CollateralManager.short(borrowCurrencyBytes);
					totalShortBefore = (await CollateralManager.totalShort()).susdValue;
					systemDebtBefore = (await DebtCache.currentDebt()).debt;
				});

				before('open the loan', async () => {
					if (type === 'CollateralErc20') {
						// TODO: Move elswhere or clean up where addresses are retrieved from?
						const renbtc = '0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D';
						const renHolder = '0x53463cd0b074E5FDafc55DcE7B1C82ADF1a43B2E';

						const renBTC = await artifacts.require('ERC20').at(renbtc);

						await renBTC.transfer(user1, amountToDeposit, {
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
					assert.bnEqual(event.args.collateral, amountToDeposit);
					assert.equal(event.args.currency, borrowCurrencyBytes);
					assert.bnEqual(event.args.issuanceFee, amountToBorrow.mul(issueFeeRate));
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

					before('record current values', async () => {
						cratioBefore = await CollateralContract.collateralRatio(loan);
					});

					before('skip waiting period', async () => {
						const period = await CollateralContract.interactionDelay();

						await fastForward(period.toString());
					});

					before('deposit', async () => {
						if (type === 'CollateralErc20' || type === 'CollateralShort') {
							tx = await CollateralContract.deposit(user1, loanId, Web3.utils.toBN('1000000'), {
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

					before('record current values', async () => {
						cratioBefore = await CollateralContract.collateralRatio(loan);
					});

					before('skip waiting period', async () => {
						const period = await CollateralContract.interactionDelay();

						await fastForward(period.toString());
					});

					before('withdraw', async () => {
						tx = await CollateralContract.withdraw(loanId, toUnit('1'), {
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
	};

	// itCorrectlyManagesLoansWith({
	// 	type: 'CollateralEth',
	// 	amountToDeposit: toUnit('1'),
	// 	borrowCurrency: 'sUSD',
	// 	amountToBorrow: toUnit('10'),
	// });

	// itCorrectlyManagesLoansWith({
	// 	type: 'CollateralErc20',
	// 	amountToDeposit: Web3.utils.toBN('100000000'), // 1 renBTC (renBTC uses 8 decimals)
	// 	borrowCurrency: 'sUSD',
	// 	amountToBorrow: toUnit('10'),
	// });

	itCorrectlyManagesLoansWith({
		type: 'CollateralShort',
		amountToDeposit: toUnit('1000'),
		borrowCurrency: 'sETH',
		amountToBorrow: toUnit('1'),
	});

	// ------------------------------------------------------------
	// END
	// ------------------------------------------------------------

	describe.skip('renBTC loans work correctly and interact with the manager and system debt properly', async () => {
		let tx, id, longBefore, totalLongBefore;
		const oneHundressUSD = toUnit('100');
		const oneRenBTC = 100000000;
		const sUSD = toBytes32('sUSD');
		const renbtc = '0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D';
		const renHolder = '0x53463cd0b074E5FDafc55DcE7B1C82ADF1a43B2E';

		it('on mainnet it works properly', async () => {
			if (network === 'mainnet') {
				longBefore = await CollateralManager.long(sUSD);
				totalLongBefore = (await CollateralManager.totalLong()).susdValue;

				const RENBTC = await artifacts.require('ERC20').at(renbtc);
				await RENBTC.approve(CollateralErc20.address, oneRenBTC, { from: renHolder });

				tx = await CollateralErc20.open(oneRenBTC, oneHundressUSD, sUSD, {
					from: renHolder,
				});

				({ id } = tx.receipt.logs.find(log => log.event === 'LoanCreated').args);
				assert.notEqual(id.toString(), '0');

				assert.bnGt(await CollateralManager.long(sUSD), longBefore);
				assert.bnGt((await CollateralManager.totalLong()).susdValue, totalLongBefore);
			}
		});
	});

	describe.skip('sUSD shorts work correctly and interact with the manager and system debt properly', async () => {
		let tx, id, shortBefore, totalShortBefore;
		const oneThousandsUSD = toUnit('1000');
		const sETH = toBytes32('sETH');
		const shortAmount = toUnit('0.5');

		before(async () => {
			await SynthsUSD.approve(CollateralShort.address, oneThousandsUSD, { from: user1 });

			shortBefore = await CollateralManager.short(sETH);
			totalShortBefore = (await CollateralManager.totalShort()).susdValue;

			tx = await CollateralShort.open(oneThousandsUSD, shortAmount, sETH, {
				from: user1,
			});

			({ id } = tx.receipt.logs.find(log => log.event === 'LoanCreated').args);
		});

		it('produces a valid loan id', async () => {
			assert.notEqual(id.toString(), '0');
		});

		it('updates the managers short and total short', async () => {
			assert.bnGt(await CollateralManager.short(sETH), shortBefore);
			assert.bnGt((await CollateralManager.totalShort()).susdValue, totalShortBefore);
		});
	});
});
