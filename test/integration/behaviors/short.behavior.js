const ethers = require('ethers');
const {
	utils: { parseEther },
} = ethers;
const { approveIfNeeded } = require('../utils/approve');
const { assert } = require('../../contracts/common');
const { toBytes32 } = require('../../../index');
const { ensureBalance } = require('../utils/balances');
const { exchangeSynths, ignoreWaitingPeriod } = require('../utils/exchanging');

function itCanOpenAndCloseShort({ ctx }) {
	describe('shorting', () => {
		const amountToDeposit = parseEther('1000'); // sUSD
		const amountToBorrow = parseEther('1'); // sETH

		let user;
		let CollateralShort, SynthsUSD, CollateralStateShort;

		before('target contracts and users', () => {
			({ CollateralShort, SynthsUSD, CollateralStateShort } = ctx.contracts);

			user = ctx.users.someUser;
		});

		before('ensure user should have sUSD', async () => {
			await ensureBalance({ ctx, symbol: 'sUSD', user, balance: parseEther('10000') });
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

		describe('open and close a short', async () => {
			let tx, loan, loanId;

			describe('opening a loan', () => {
				before('approve the synths for collateral short', async () => {
					await approveIfNeeded({
						token: SynthsUSD,
						owner: user,
						beneficiary: CollateralShort,
						amount: parseEther('10000'), // sUSD
					});
				});

				before('open the loan', async () => {
					CollateralShort = CollateralShort.connect(user);

					tx = await CollateralShort.open(amountToDeposit, amountToBorrow, toBytes32('sETH'));

					const { events } = await tx.wait();
					const event = events.find(l => l.event === 'LoanCreated');
					loanId = event.args.id;

					loan = await CollateralStateShort.getLoan(user.address, loanId);
				});

				it('shows the loan amount is non zero when opened', async () => {
					assert.bnEqual(loan.amount, parseEther('1'));
				});

				describe('closing a loan', () => {
					let interactionDelay, CollateralShortAsOwner;

					// Ignore settlement period for sUSD --> sETH closing the loan
					ignoreWaitingPeriod({ ctx });

					before('skip waiting period by setting interaction delay to zero', async () => {
						CollateralShortAsOwner = CollateralShort.connect(ctx.users.owner);
						interactionDelay = await CollateralShortAsOwner.interactionDelay();

						await CollateralShortAsOwner.setInteractionDelay('0');
					});

					before('close the loan', async () => {
						await exchangeSynths({
							ctx,
							src: 'sUSD',
							dest: 'sETH',
							amount: parseEther('1000'),
							user,
						});

						tx = await CollateralShort.close(loanId);
						loan = await CollateralStateShort.getLoan(user.address, loanId);
					});

					after('restore waiting period', async () => {
						await CollateralShortAsOwner.setInteractionDelay(interactionDelay);
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
