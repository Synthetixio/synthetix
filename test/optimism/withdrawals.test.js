const ethers = require('ethers');
const { assert } = require('../contracts/common');
const { assertRevertOptimism } = require('./utils/revertOptimism');
const { connectContract } = require('./utils/connectContract');
const { wait } = require('./utils/rpc');

const itCanPerformWithdrawals = ({ ctx }) => {
	describe('WITHDRAWALS - when migrating SNX from L2 to L1', () => {
		const amountToWithdraw = ethers.utils.parseEther('100');

		let user1L2;

		let SynthetixL1, SynthetixBridgeToOptimismL1;
		let SynthetixL2, SynthetixBridgeToBaseL2, IssuerL2;

		// --------------------------
		// Setup
		// --------------------------

		before('identify signers', async () => {
			user1L2 = new ethers.Wallet(ctx.user1PrivateKey, ctx.providerL2);
		});

		before('connect to contracts', async () => {
			// L1
			SynthetixL1 = connectContract({ contract: 'Synthetix', provider: ctx.providerL1 });
			SynthetixBridgeToOptimismL1 = connectContract({
				contract: 'SynthetixBridgeToOptimism',
				provider: ctx.providerL1,
			});

			// L2
			SynthetixL2 = connectContract({
				contract: 'Synthetix',
				source: 'MintableSynthetix',
				useOvm: true,
				provider: ctx.providerL2,
			});
			SynthetixBridgeToBaseL2 = connectContract({
				contract: 'SynthetixBridgeToBase',
				useOvm: true,
				provider: ctx.providerL2,
			});
			IssuerL2 = connectContract({
				contract: 'Issuer',
				useOvm: true,
				provider: ctx.providerL2,
			});
		});

		before('make a deposit', async () => {
			// Make a deposit so that
			// 1. There is SNX in the bridge for withdrawals,
			// 2. Counter a known bug in Optimism, where "now" is always 0 unless a message has been relayed

			SynthetixL1 = SynthetixL1.connect(ctx.ownerL1);
			await SynthetixL1.approve(
				SynthetixBridgeToOptimismL1.address,
				ethers.utils.parseEther(amountToWithdraw.toString())
			);

			SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(ctx.ownerL1);
			await SynthetixBridgeToOptimismL1.initiateDeposit(amountToWithdraw);
		});

		// --------------------------
		// Get SNX
		// --------------------------

		describe('when a user has the expected amount of SNX in L2', () => {
			let user1BalanceL2;

			before('record current values', async () => {
				user1BalanceL2 = await SynthetixL2.balanceOf(user1L2.address);
			});

			before('ensure that the user has the expected SNX balance', async () => {
				SynthetixL2 = SynthetixL2.connect(ctx.ownerL2);

				const tx = await SynthetixL2.transfer(user1L2.address, amountToWithdraw);
				await tx.wait();
			});

			it('shows the user has SNX', async () => {
				assert.bnEqual(
					await SynthetixL2.balanceOf(user1L2.address),
					user1BalanceL2.add(amountToWithdraw)
				);
			});

			// --------------------------
			// With debt
			// --------------------------

			// Not working because of Optimism's issues with "now"
			describe.skip('when a user has debt in L2', () => {
				before('issue sUSD', async () => {
					SynthetixL2 = SynthetixL2.connect(user1L2);

					const tx = await SynthetixL2.issueSynths(1);
					await tx.wait();
				});

				after('remove all debt', async () => {
					const time = (await IssuerL2.minimumStakeTime()).toString();
					await wait(time);

					SynthetixL2 = SynthetixL2.connect(user1L2);

					const debt = await IssuerL2.debtBalanceOf(
						user1L2.address,
						ethers.utils.formatBytes32String('sUSD')
					);
					console.log('debt', debt.toString());

					const tx = await SynthetixL2.burnSynths(debt);
					await tx.wait();
				});

				it('shows the user has debt', async () => {
					assert.bnGte(
						await IssuerL2.debtBalanceOf(user1L2.address, ethers.utils.formatBytes32String('sUSD')),
						1
					);
				});

				it('reverts if the user attemtps to withdraw to L1', async () => {
					SynthetixBridgeToBaseL2 = SynthetixBridgeToBaseL2.connect(user1L2);

					const tx = await SynthetixBridgeToBaseL2.initiateWithdrawal(1);

					await assertRevertOptimism({
						tx,
						reason: 'Cannot withdraw with debt',
						provider: ctx.providerL2,
					});
				});
			});

			// --------------------------
			// Without debt
			// --------------------------

			describe('when a user doesnt have debt in L2', () => {
				// TODO: Implement
				describe.skip('when the system is suspended in L2', () => {});

				it('shows that the user does not have debt', async () => {
					assert.bnEqual(
						await IssuerL2.debtBalanceOf(user1L2.address, ethers.utils.formatBytes32String('sUSD')),
						0
					);
				});

				describe('when a user initiates a withdrawal on L2', () => {
					let user1BalanceL1;

					before('record current values', async () => {
						user1BalanceL1 = await SynthetixL1.balanceOf(user1L2.address);
						user1BalanceL2 = await SynthetixL2.balanceOf(user1L2.address);
					});

					before('initiate withdrawal', async () => {
						SynthetixBridgeToBaseL2 = SynthetixBridgeToBaseL2.connect(user1L2);

						const tx = await SynthetixBridgeToBaseL2.initiateWithdrawal(amountToWithdraw);
						await tx.wait();
					});

					// TODO: Implement
					it.skip('emitted a Withdrawal event', async () => {});

					it('reduces the users balance', async () => {
						assert.bnEqual(
							await SynthetixL2.balanceOf(user1L2.address),
							user1BalanceL2.sub(amountToWithdraw)
						);
					});

					// TODO: Probably a service to query here too
					const time = 30;
					describe(`when ${time} seconds have elapsed`, () => {
						before('wait', async () => {
							await wait(time);
						});

						it('shows that the users L1 balance increased', async () => {
							assert.bnEqual(
								await SynthetixL1.balanceOf(user1L2.address),
								user1BalanceL1.add(amountToWithdraw)
							);
						});
					});
				});
			});
		});
	});
};

module.exports = {
	itCanPerformWithdrawals,
};
