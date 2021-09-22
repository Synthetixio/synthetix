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
		const amountOfsUSDRequired = parseEther('2000'); // sUSD
		const amountToDeposit = parseEther('1000'); // sUSD
		const amountToBorrow = parseEther('0.000001'); // sETH
		const amountToExchange = parseEther('100'); // sUSD

		let user;
		let CollateralShort,
			Synthetix,
			SynthsUSD,
			CollateralStateShort,
			CollateralShortAsOwner,
			interactionDelay;

		before('target contracts and users', () => {
			({ CollateralShort, Synthetix, SynthsUSD, CollateralStateShort } = ctx.contracts);

			user = ctx.users.someUser;

			CollateralShort = CollateralShort.connect(user);
			Synthetix = Synthetix.connect(user);
		});

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
			CollateralShortAsOwner = CollateralShort.connect(ctx.users.owner);
			interactionDelay = await CollateralShortAsOwner.interactionDelay();

			await CollateralShortAsOwner.setInteractionDelay('0');
		});

		after('restore waiting period', async () => {
			await CollateralShortAsOwner.setInteractionDelay(interactionDelay);
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
						amount: amountOfsUSDRequired,
					});
				});

				before('open the loan', async () => {
					tx = await CollateralShort.open(amountToDeposit, amountToBorrow, toBytes32('sETH'));

					const { events } = await tx.wait();
					const event = events.find(l => l.event === 'LoanCreated');
					loanId = event.args.id;

					loan = await CollateralStateShort.getLoan(user.address, loanId);
				});

				before('deposit more collateral (doubling it)', async () => {
					assert.bnEqual(loan.collateral, amountToDeposit);
					tx = await CollateralShort.deposit(user.address, loanId, amountToDeposit);

					const { events } = await tx.wait();

					const event = events.find(l => l.event === 'CollateralDeposited');
					loanId = event.args.id;

					loan = await CollateralStateShort.getLoan(user.address, loanId);
					assert.bnEqual(loan.collateral, amountToDeposit.mul(2));
				});

				before('withdraw some collateral (removing the added double)', async () => {
					tx = await CollateralShort.withdraw(loanId, amountToDeposit);

					const { events } = await tx.wait();

					const event = events.find(l => l.event === 'CollateralWithdrawn');
					loanId = event.args.id;

					loan = await CollateralStateShort.getLoan(user.address, loanId);
					assert.bnEqual(loan.collateral, amountToDeposit);
				});

				before('draw down the loan (doubling it)', async () => {
					assert.bnEqual(loan.amount, amountToBorrow);
					tx = await CollateralShort.draw(loanId, amountToBorrow);

					const { events } = await tx.wait();

					const event = events.find(l => l.event === 'LoanDrawnDown');
					loanId = event.args.id;

					loan = await CollateralStateShort.getLoan(user.address, loanId);
					assert.bnEqual(loan.amount, amountToBorrow.mul(2));
				});

				it('shows the loan amount and collateral are correct', async () => {
					assert.bnEqual(loan.amount, amountToBorrow.mul(2));
					assert.bnEqual(loan.collateral, amountToDeposit);
				});

				describe('closing a loan', () => {
					before('exchange synths', async () => {
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
						const tx = await Synthetix.settle(toBytes32('sETH'));
						await tx.wait();
					});

					before('close the loan', async () => {
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
