const ethers = require('ethers');
const chalk = require('chalk');
const {
	utils: { parseEther },
} = ethers;
const { approveIfNeeded } = require('../utils/approve');
const { assert } = require('../../contracts/common');
const { toBytes32 } = require('../../../index');
const { ensureBalance } = require('../utils/balances');
const { exchangeSynths } = require('../utils/exchanging');
const { skipWaitingPeriod } = require('../utils/skip');

function itCanOpenAndCloseShort({ ctx }) {
	describe('shorting', () => {
		const amountToDeposit = parseEther('10000'); // sUSD
		const amountToBorrow = parseEther('1'); // sETH

		let user;
		let CollateralShort, SynthsUSD, CollateralStateShort, CollateralShortAsOwner, interactionDelay;

		before('target contracts and users', () => {
			({ CollateralShort, SynthsUSD, CollateralStateShort } = ctx.contracts);

			user = ctx.users.someUser;

			CollateralShort = CollateralShort.connect(user);
		});

		before('ensure user should have sUSD', async () => {
			await ensureBalance({ ctx, symbol: 'sUSD', user, balance: parseEther('100000') });
		});

		before('ensure sETH supply exists', async () => {
			// CollateralManager.getShortRate requires existing sETH else div by zero
			await exchangeSynths({
				ctx,
				src: 'sUSD',
				dest: 'sETH',
				amount: parseEther('10'),
				user: ctx.users.otherUser,
			});
		});

		before('skip waiting period by setting interaction delay to zero', async () => {
			CollateralShortAsOwner = CollateralShort.connect(ctx.users.owner);
			interactionDelay = await CollateralShortAsOwner.interactionDelay();

			await CollateralShortAsOwner.setInteractionDelay('0');
		});

		after('restore waiting period', async () => {
			await CollateralShortAsOwner.setInteractionDelay(interactionDelay);
		});

		describe('open, close, deposit, withdraw, draw a short', async () => {
			let tx, loan, loanId;

			describe('open a loan, deposit and withdraw collateral, draw, and close the loan', () => {
				before('skip if max borrowing power reached', async function() {
					const maxBorrowingPower = await CollateralShort.maxLoan(
						amountToDeposit,
						toBytes32('sETH')
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

				before('approve the synths for collateral short', async () => {
					await approveIfNeeded({
						token: SynthsUSD,
						owner: user,
						beneficiary: CollateralShort,
						amount: parseEther('100000'), // sUSD
					});
				});

				before('open the loan', async () => {
					tx = await CollateralShort.open(amountToDeposit, amountToBorrow, toBytes32('sETH'));

					const { events } = await tx.wait();
					const event = events.find(l => l.event === 'LoanCreated');
					loanId = event.args.id;

					loan = await CollateralStateShort.getLoan(user.address, loanId);
				});

				before('deposit more collateral', async () => {
					assert.bnEqual(loan.collateral, parseEther('10000'));
					tx = await CollateralShort.deposit(user.address, loanId, amountToDeposit);

					const { events } = await tx.wait();

					const event = events.find(l => l.event === 'CollateralDeposited');
					loanId = event.args.id;

					loan = await CollateralStateShort.getLoan(user.address, loanId);
					assert.bnEqual(loan.collateral, parseEther('20000'));
				});

				before('withdraw some collateral', async () => {
					assert.bnEqual(loan.collateral, parseEther('20000'));
					tx = await CollateralShort.withdraw(loanId, parseEther('5000'));

					const { events } = await tx.wait();

					const event = events.find(l => l.event === 'CollateralWithdrawn');
					loanId = event.args.id;

					loan = await CollateralStateShort.getLoan(user.address, loanId);
					assert.bnEqual(loan.collateral, parseEther('15000'));
				});

				before('draw down the loan', async () => {
					assert.bnEqual(loan.amount, parseEther('1'));
					tx = await CollateralShort.draw(loanId, parseEther('1'));

					const { events } = await tx.wait();

					const event = events.find(l => l.event === 'LoanDrawnDown');
					loanId = event.args.id;

					loan = await CollateralStateShort.getLoan(user.address, loanId);
					assert.bnEqual(loan.amount, parseEther('2'));
				});

				it('shows the loan amount and collateral are correct', async () => {
					assert.bnEqual(loan.amount, parseEther('2'));
					assert.bnEqual(loan.collateral, parseEther('15000'));
				});

				describe('closing a loan', () => {
					before('close the loan', async () => {
						await exchangeSynths({
							ctx,
							src: 'sUSD',
							dest: 'sETH',
							amount: parseEther('10000'),
							user,
						});

						// Ignore settlement period for sUSD --> sETH closing the loan
						await skipWaitingPeriod({ ctx });

						tx = await CollateralShort.close(loanId);
						loan = await CollateralStateShort.getLoan(user.address, loanId);
					});

					it('shows the loan amount is zero when closed', async () => {
						assert.bnEqual(loan.amount, '0');
					});
				});
			});
		});
	});
}

module.exports = {
	itCanOpenAndCloseShort,
};
