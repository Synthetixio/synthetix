const ethers = require('ethers');
const { assert } = require('../contracts/common');
const { connectContract } = require('./utils/connectContract');
const { takeSnapshot, restoreSnapshot } = require('./utils/rpc');

const itCanPerformDeposits = ({ ctx }) => {
	describe('[DEPOSIT] when migrating SNX from L1 to L2', () => {
		const amountToDeposit = ethers.utils.parseEther('100');

		let user1L1;

		let SynthetixL1, SynthetixBridgeToOptimismL1, SystemStatusL1, SynthetixBridgeEscrowL1;
		let SynthetixL2, SynthetixBridgeToBaseL2;

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
			SynthetixBridgeEscrowL1 = connectContract({
				contract: 'SynthetixBridgeEscrow',
				provider: ctx.providerL1,
			});
			SystemStatusL1 = connectContract({
				contract: 'SystemStatus',
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
						SynthetixBridgeToOptimismL1.deposit(amountToDeposit),
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
						amountToDeposit
					);
					await tx.wait();
				});

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
							SynthetixBridgeToOptimismL1.deposit(amountToDeposit),
							'Cannot deposit or migrate with debt'
						);
					});
				});

				// --------------------------
				// No debt
				// --------------------------

				describe('when a user doesnt have debt in L1', () => {
					// --------------------------
					// Suspended
					// --------------------------

					describe('when the system is suspended in L1', () => {
						before('suspend the system', async () => {
							SystemStatusL1 = SystemStatusL1.connect(ctx.ownerL1);

							await SystemStatusL1.suspendSystem(1);
						});

						after('resume the system', async () => {
							SystemStatusL1 = SystemStatusL1.connect(ctx.ownerL1);

							await SystemStatusL1.resumeSystem();
						});

						it('reverts when the user attempts to initiate a deposit', async () => {
							SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(user1L1);

							await assert.revert(
								SynthetixBridgeToOptimismL1.deposit(amountToDeposit),
								'Synthetix is suspended'
							);
						});
					});

					describe('when initiation is suspended on L1', () => {
						before('suspend initiation on L1', async () => {
							SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(ctx.ownerL1);

							const tx = await SynthetixBridgeToOptimismL1.suspendInitiation();
							await tx.wait();
						});

						after('resume initiation on L1', async () => {
							SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(ctx.ownerL1);

							const tx = await SynthetixBridgeToOptimismL1.resumeInitiation();
							await tx.wait();
						});

						it('reverts when the user attempts to initiate a withdrawal', async () => {
							SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(user1L1);
							await assert.revert(
								SynthetixBridgeToOptimismL1.deposit(amountToDeposit),
								'Initiation deactivated'
							);
						});
					});

					// --------------------------
					// Not suspended
					// --------------------------

					describe('when a user deposits SNX in the L1 bridge', () => {
						let user1BalanceL2;
						let escrowBalanceL1;
						let depositFinalizedEvent;

						before('record current values', async () => {
							escrowBalanceL1 = await SynthetixL1.balanceOf(SynthetixBridgeEscrowL1.address);
							user1BalanceL1 = await SynthetixL1.balanceOf(user1L1.address);
							user1BalanceL2 = await SynthetixL2.balanceOf(user1L1.address);
						});

						// --------------------------
						// Deposit
						// --------------------------
						describe('initiation is suspended on L2', () => {
							let depositReceipt;
							// suspending initation should not affect deposits
							before('suspend initiation on L2', async () => {
								SynthetixBridgeToBaseL2 = SynthetixBridgeToBaseL2.connect(ctx.ownerL2);
								const tx = await SynthetixBridgeToBaseL2.suspendInitiation();
								await tx.wait();
							});

							// always resume afterwards so we keep a clean state
							after('suspend initiation on L2', async () => {
								SynthetixBridgeToBaseL2 = SynthetixBridgeToBaseL2.connect(ctx.ownerL2);
								const tx = await SynthetixBridgeToBaseL2.resumeInitiation();
								await tx.wait();
							});

							const eventListener = (from, value, event) => {
								if (event && event.event === 'DepositFinalized') {
									depositFinalizedEvent = event;
								}
							};

							before('listen to events on l2', async () => {
								SynthetixBridgeToBaseL2.on('DepositFinalized', eventListener);
							});

							before('deposit', async () => {
								SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(user1L1);

								const tx = await SynthetixBridgeToOptimismL1.deposit(amountToDeposit);
								depositReceipt = await tx.wait();
							});

							it('emitted a DepositInitiated event', async () => {
								const event = depositReceipt.events.find(e => e.event === 'DepositInitiated');
								assert.exists(event);
								assert.equal(event.args._from, user1L1.address);
								assert.equal(event.args._to, user1L1.address);
								assert.bnEqual(event.args._amount, amountToDeposit);
							});

							it('shows that the users new balance L1 is reduced', async () => {
								assert.bnEqual(
									await SynthetixL1.balanceOf(user1L1.address),
									user1BalanceL1.sub(amountToDeposit)
								);
							});

							it('shows that the bridge escrow received the SNX', async () => {
								assert.bnEqual(
									await SynthetixL1.balanceOf(SynthetixBridgeEscrowL1.address),
									escrowBalanceL1.add(amountToDeposit)
								);
							});

							// --------------------------
							// Wait...
							// --------------------------

							describe('when waiting for the tx to complete on L2', () => {
								before('listen for completion', async () => {
									const [transactionHashL2] = await ctx.watcher.getMessageHashesFromL1Tx(
										depositReceipt.transactionHash
									);
									await ctx.watcher.getL2TransactionReceipt(transactionHashL2);
								});

								before('stop listening to events on L2', async () => {
									SynthetixBridgeToBaseL2.off('DepositFinalized', eventListener);
								});

								it('emitted a DepositFinalized event', async () => {
									assert.exists(depositFinalizedEvent);
									assert.bnEqual(depositFinalizedEvent.args._amount, amountToDeposit);
									assert.equal(depositFinalizedEvent.args._to, user1L1.address);
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
	});
};

module.exports = {
	itCanPerformDeposits,
};
