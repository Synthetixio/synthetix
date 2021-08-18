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

		let user, owner;
		let CollateralShort, SynthsUSD, SystemSettings, interactionDelay;

		before('target contracts and users', () => {
			({ CollateralShort, SynthsUSD, SystemSettings } = ctx.contracts);

			user = ctx.users.someUser;
			owner = ctx.users.owner;

			CollateralShort = CollateralShort.connect(user);
			SystemSettings = SystemSettings.connect(owner);
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
			interactionDelay = await SystemSettings.interactionDelay(CollateralShort.address);

			await SystemSettings.setInteractionDelay(0, CollateralShort.address);
		});

		after('restore waiting period', async () => {
			await SystemSettings.setInteractionDelay(interactionDelay, CollateralShort.address);
		});

		describe('open, close, deposit, withdraw, and draw a short', async () => {
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

					loan = await CollateralShort.loans(loanId);
				});

				before('deposit more collateral', async () => {
					assert.bnEqual(loan.collateral, parseEther('10000'));
					tx = await CollateralShort.deposit(user.address, loanId, amountToDeposit);

					const { events } = await tx.wait();

					const event = events.find(l => l.event === 'CollateralDeposited');
					loanId = event.args.id;

					loan = await CollateralShort.loans(loanId);
					assert.bnEqual(loan.collateral, parseEther('20000'));
				});

				before('withdraw some collateral', async () => {
					assert.bnEqual(loan.collateral, parseEther('20000'));
					tx = await CollateralShort.withdraw(loanId, parseEther('5000'));

					const { events } = await tx.wait();

					const event = events.find(l => l.event === 'CollateralWithdrawn');
					loanId = event.args.id;

					loan = await CollateralShort.loans(loanId);
					assert.bnEqual(loan.collateral, parseEther('15000'));
				});

				before('draw down the loan', async () => {
					assert.bnEqual(loan.amount, parseEther('1'));
					tx = await CollateralShort.draw(loanId, parseEther('1'));

					const { events } = await tx.wait();

					const event = events.find(l => l.event === 'LoanDrawnDown');
					loanId = event.args.id;

					loan = await CollateralShort.loans(loanId);
					assert.bnEqual(loan.amount, parseEther('2'));
				});

				it('shows the loan amount and collateral are correct', async () => {
					assert.bnEqual(loan.amount, parseEther('2'));
					assert.bnEqual(loan.collateral, parseEther('15000'));
				});

				describe('closing a loan', () => {
					before('exchange synths', async () => {
						await exchangeSynths({
							ctx,
							src: 'sUSD',
							dest: 'sETH',
							amount: parseEther('50000'),
							user,
						});
					});

					before('close the loan', async () => {
						tx = await CollateralShort.close(loanId);

						const { events } = await tx.wait();

						const event = events.find(l => l.event === 'LoanClosed');
						loanId = event.args.id;

						loan = await CollateralShort.loans(loanId);
					});

					before('skip waiting period', async () => {
						// Ignore settlement period for sUSD --> sETH closing the loan
						await skipWaitingPeriod({ ctx });
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
