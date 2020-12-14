const ethers = require('ethers');
const { assert } = require('../contracts/common');
const { connectContract } = require('./utils/connectContract');
const { wait, takeSnapshot, restoreSnapshot } = require('./utils/rpc');

const itCanPerformDeposits = ({ ctx }) => {
	describe('DEPOSITS - when migrating SNX from L1 to L2', () => {
		const amountToDeposit = ethers.utils.parseEther('100');

		let user1L1;

		let SynthetixL1, SynthetixBridgeToOptimismL1;
		let SynthetixL2;

		let snapshotId;

		// --------------------------
		// Setup
		// --------------------------

		before('identify signers', async () => {
			user1L1 = ctx.providerL1.getSigner(ctx.user1Address);
			user1L1.address = ctx.user1Address;
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
		});

		// --------------------------
		// Get SNX
		// --------------------------

		describe('when a user has the expected amount of SNX in L1', () => {
			let user1BalanceL1;

			before('record current values', async () => {
				user1BalanceL1 = await SynthetixL1.balanceOf(user1L1.address);
			});

			before('ensure that the user has the expected SNX balance', async () => {
				SynthetixL1 = SynthetixL1.connect(ctx.ownerL1);

				const tx = await SynthetixL1.transfer(user1L1.address, amountToDeposit);
				await tx.wait();
			});

			it('shows the user has SNX', async () => {
				assert.bnEqual(
					await SynthetixL1.balanceOf(user1L1.address),
					user1BalanceL1.add(amountToDeposit)
				);
			});

			// --------------------------
			// No approval
			// --------------------------

			describe('before a user approves the L1 bridge to transfer its SNX', () => {
				before('make sure approval is zero', async () => {
					SynthetixL1 = SynthetixL1.connect(user1L1);

					const tx = await SynthetixL1.approve(
						SynthetixBridgeToOptimismL1.address,
						ethers.utils.parseEther('0')
					);
					await tx.wait();
				});

				it('reverts if the user attempts to initiate a deposit', async () => {
					SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(user1L1);

					await assert.revert(
						SynthetixBridgeToOptimismL1.initiateDeposit(amountToDeposit),
						'subtraction overflow'
					);
				});
			});

			// --------------------------
			// Approval
			// --------------------------

			describe('when a user approves the L1 bridge to transfer its SNX', () => {
				before('approve', async () => {
					SynthetixL1 = SynthetixL1.connect(user1L1);

					const tx = await SynthetixL1.approve(
						SynthetixBridgeToOptimismL1.address,
						ethers.utils.parseEther('100000000')
					);
					await tx.wait();
				});

				// --------------------------
				// Suspended
				// --------------------------

				// TODO: Implement
				describe.skip('when the system is suspended in L1', () => {});

				// --------------------------
				// With debt
				// --------------------------

				describe('when a user has debt in L1', () => {
					before('take snapshot in L1', async () => {
						snapshotId = await takeSnapshot({ provider: ctx.providerL1 });
					});

					after('restore snapshot in L1', async () => {
						await restoreSnapshot({ id: snapshotId, provider: ctx.providerL1 });
					});

					before('issue sUSD', async () => {
						SynthetixL1 = SynthetixL1.connect(user1L1);

						const tx = await SynthetixL1.issueSynths(1);
						await tx.wait();
					});

					it('reverts when the user attempts to deposit', async () => {
						SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(user1L1);

						await assert.revert(
							SynthetixBridgeToOptimismL1.initiateDeposit(amountToDeposit),
							'Cannot deposit with debt'
						);
					});
				});

				// --------------------------
				// No debt
				// --------------------------

				describe('when a user doesnt have debt in L1', () => {
					describe('when a user deposits SNX in the L1 bridge', () => {
						let user1BalanceL2;
						let bridgeBalanceL1;

						before('record current values', async () => {
							bridgeBalanceL1 = await SynthetixL1.balanceOf(SynthetixBridgeToOptimismL1.address);

							user1BalanceL1 = await SynthetixL1.balanceOf(user1L1.address);
							user1BalanceL2 = await SynthetixL2.balanceOf(user1L1.address);
						});

						// --------------------------
						// Deposit
						// --------------------------

						before('deposit', async () => {
							SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(user1L1);

							const tx = await SynthetixBridgeToOptimismL1.initiateDeposit(amountToDeposit);
							await tx.wait();
						});

						// TODO: Implement
						it.skip('emitted a Deposit event', async () => {});

						it('shows that the users new balance L1 is reduced', async () => {
							assert.bnEqual(
								await SynthetixL1.balanceOf(user1L1.address),
								user1BalanceL1.sub(amountToDeposit)
							);
						});

						it('shows that the L1 bridge received the SNX', async () => {
							assert.bnEqual(
								await SynthetixL1.balanceOf(SynthetixBridgeToOptimismL1.address),
								bridgeBalanceL1.add(amountToDeposit)
							);
						});

						// --------------------------
						// Wait...
						// --------------------------

						// TODO: Use watcher instead of random wait
						const time = 15;
						describe(`when ${time} seconds have elapsed`, () => {
							before('wait', async () => {
								await wait(time);
							});

							it('shows that the users L2 balance increased', async () => {
								assert.bnEqual(
									await SynthetixL2.balanceOf(user1L1.address),
									user1BalanceL2.add(amountToDeposit)
								);
							});
						});
					});
				});
			});
		});
	});
};

module.exports = {
	itCanPerformDeposits,
};
