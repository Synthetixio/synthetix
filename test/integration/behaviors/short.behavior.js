const ethers = require('ethers');
const chalk = require('chalk');
const {
	utils: { parseEther },
} = ethers;
const { approveIfNeeded } = require('../utils/approve');
const { assert } = require('../../contracts/common');
const {
	toBytes32,
	constants: { ZERO_BYTES32 },
} = require('../../../index');
const { getLoan, getShortInteractionDelay, setShortInteractionDelay } = require('../utils/loans');
const { ensureBalance } = require('../utils/balances');
const { exchangeSynths } = require('../utils/exchanging');
const { updateCache } = require('../utils/rates');
const { skipWaitingPeriod } = require('../utils/skip');

function itCanOpenAndCloseShort({ ctx }) {
	describe('shorting', () => {
		const amountOfsUSDRequired = parseEther('5000'); // sUSD
		const amountToDeposit = parseEther('1000'); // sUSD
		const amountToBorrow = parseEther('0.000001'); // sETH
		const amountToExchange = parseEther('100'); // sUSD

		const shortableSynth = toBytes32('sETH');

		let user, owner;
		let CollateralShort, CollateralManager, Synthetix, SynthsUSD, interactionDelay;

		before('target contracts and users', () => {
			({ CollateralShort, CollateralManager, Synthetix, SynthsUSD } = ctx.contracts);

			user = ctx.users.someUser;
			owner = ctx.users.owner;

			CollateralManager = CollateralManager.connect(owner);
			CollateralShort = CollateralShort.connect(user);
			Synthetix = Synthetix.connect(user);
		});

		before('skip if opening shorts disabled', async function() {
			const canOpenLoans = await CollateralShort.canOpenLoans();

			if (!canOpenLoans) {
				console.log(chalk.yellow('> Skipping collateral checks because loan opening is closed.'));
				this.skip();
			}
		});

		describe('when opening is enabled', () => {
			before('ensure user should have sUSD', async () => {
				await ensureBalance({ ctx, symbol: 'sUSD', user, balance: amountOfsUSDRequired });
			});

			before('ensure sETH supply exists', async () => {
				// CollateralManager.getShortRate requires existing sETH else div by zero
				await exchangeSynths({
					ctx,
					src: 'sUSD',
					dest: 'sETH',
					amount: parseEther('1'),
					user: ctx.users.otherUser,
				});
			});

			before('skip waiting period by setting interaction delay to zero', async () => {
				interactionDelay = await getShortInteractionDelay({ ctx });

				await setShortInteractionDelay({ ctx, delay: 0 });
			});

			after('restore waiting period', async () => {
				await setShortInteractionDelay({ ctx, delay: interactionDelay });
			});

			describe('open, close, deposit, withdraw, and draw a short', async () => {
				let tx, loan, loanId;

				describe('open a loan, deposit and withdraw collateral, draw, and close the loan', () => {
					before('skip if max borrowing power reached', async function() {
						const maxBorrowingPower = await CollateralShort.maxLoan(
							amountToDeposit,
							shortableSynth
						);
						const maxBorrowingPowerReached = maxBorrowingPower <= amountToBorrow;

						if (maxBorrowingPowerReached) {
							console.log(
								chalk.yellow(
									'> Skipping collateral checks because max borrowing power has been reached.'
								)
							);
							this.skip();
						}
					});

					before('add the shortable synths if needed', async () => {
						const synthToTest = await CollateralShort.synthsByKey(shortableSynth);

						if (synthToTest === ZERO_BYTES32) {
							await CollateralShort.connect(owner).addSynths(
								[toBytes32(`SynthsETH`)],
								[shortableSynth]
							);

							await CollateralManager.addSynths([toBytes32(`SynthsETH`)], [shortableSynth]);

							await CollateralManager.addShortableSynths(
								[toBytes32(`SynthsETH`)],
								[shortableSynth]
							);
						}
					});

					before('approve the synths for collateral short', async () => {
						await approveIfNeeded({
							token: SynthsUSD,
							owner: user,
							beneficiary: CollateralShort,
							amount: amountOfsUSDRequired,
						});
					});

					before('open the loan', async () => {
						tx = await CollateralShort.open(amountToDeposit, amountToBorrow, shortableSynth);

						const { events } = await tx.wait();

						const event = events.find(l => l.event === 'LoanCreated');
						loanId = event.args.id;

						loan = await getLoan({ ctx, id: loanId, user });
					});

					before('deposit more collateral (doubling it)', async () => {
						assert.bnEqual(loan.collateral, amountToDeposit);
						tx = await CollateralShort.deposit(user.address, loanId, amountToDeposit);

						const { events } = await tx.wait();

						const event = events.find(l => l.event === 'CollateralDeposited');
						loanId = event.args.id;

						loan = await getLoan({ ctx, id: loanId, user });
						assert.bnEqual(loan.collateral, amountToDeposit.mul(2));
					});

					before('withdraw some collateral (removing the added double)', async () => {
						tx = await CollateralShort.withdraw(loanId, amountToDeposit);

						const { events } = await tx.wait();

						const event = events.find(l => l.event === 'CollateralWithdrawn');
						loanId = event.args.id;

						loan = await getLoan({ ctx, id: loanId, user });
						assert.bnEqual(loan.collateral, amountToDeposit);
					});

					before('draw down the loan (doubling it)', async () => {
						assert.bnEqual(loan.amount, amountToBorrow);
						tx = await CollateralShort.draw(loanId, amountToBorrow);

						const { events } = await tx.wait();

						const event = events.find(l => l.event === 'LoanDrawnDown');
						loanId = event.args.id;

						loan = await getLoan({ ctx, id: loanId, user });
						assert.bnEqual(loan.amount, amountToBorrow.mul(2));
					});

					it('shows the loan amount and collateral are correct', async () => {
						assert.bnEqual(loan.amount, amountToBorrow.mul(2));
						assert.bnEqual(loan.collateral, amountToDeposit);
					});

					describe('closing a loan', () => {
						before('exchange synths', async () => {
							await updateCache({ ctx });

							await exchangeSynths({
								ctx,
								src: 'sUSD',
								dest: 'sETH',
								amount: amountToExchange,
								user,
							});
						});

						before('skip waiting period', async () => {
							// Ignore settlement period for sUSD --> sETH closing the loan
							await skipWaitingPeriod({ ctx });
						});

						before('settle', async () => {
							const tx = await Synthetix.settle(shortableSynth);
							await tx.wait();
						});

						before('close the loan', async () => {
							tx = await CollateralShort.close(loanId);

							const { events } = await tx.wait();

							const event = events.find(l => l.event === 'LoanClosed');
							loanId = event.args.id;

							loan = await getLoan({ ctx, id: loanId, user });
						});

						it('shows the loan amount is zero when closed', async () => {
							assert.bnEqual(loan.amount, '0');
						});
					});
				});
			});
		});
	});
}

module.exports = {
	itCanOpenAndCloseShort,
};
