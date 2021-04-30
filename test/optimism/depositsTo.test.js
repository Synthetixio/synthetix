const ethers = require('ethers');
const { assert } = require('../contracts/common');
const { connectContract } = require('./utils/connectContract');
const { takeSnapshot, restoreSnapshot } = require('./utils/rpc');

const itCanPerformDepositsTo = ({ ctx }) => {
	describe('[DEPOSIT TO] when migrating SNX from L1 to a separate address on L2', () => {
		const amountToDeposit = ethers.utils.parseEther('100');

		let user1L1;

		let SynthetixL1, SynthetixBridgeToOptimismL1, SynthetixBridgeEscrowL1, SystemStatusL1;
		let SynthetixL2, SynthetixBridgeToBaseL2;

		let snapshotId;

		const randomAddress = ethers.Wallet.createRandom().address;

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
						SynthetixBridgeToOptimismL1.depositTo(randomAddress, amountToDeposit),
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
							SynthetixBridgeToOptimismL1.depositTo(randomAddress, amountToDeposit),
							'Cannot deposit or migrate with debt'
						);
					});
				});

				// --------------------------
				// No debt
				// --------------------------

				describe('when a user doesnt have debt in L1', () => {
					let depositReceipt;

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

						it('reverts when the user attempts to deposit to a an different account', async () => {
							SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(user1L1);

							await assert.revert(
								SynthetixBridgeToOptimismL1.depositTo(randomAddress, amountToDeposit),
								'Synthetix is suspended'
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
						let randomAddressBalanceL2;

						before('record current values', async () => {
							escrowBalanceL1 = await SynthetixL1.balanceOf(SynthetixBridgeEscrowL1.address);
							user1BalanceL1 = await SynthetixL1.balanceOf(user1L1.address);
							user1BalanceL2 = await SynthetixL2.balanceOf(user1L1.address);
							randomAddressBalanceL2 = await SynthetixL2.balanceOf(randomAddress);
						});

						// --------------------------
						// Deposit
						// --------------------------

						const eventListener = (from, value, event) => {
							if (event && event.event === 'DepositFinalized') {
								depositFinalizedEvent = event;
							}
						};

						before('listen to events on l2', async () => {
							SynthetixBridgeToBaseL2.on('DepositFinalized', eventListener);
						});

						before('depositTo', async () => {
							SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(user1L1);

							const tx = await SynthetixBridgeToOptimismL1.depositTo(
								randomAddress,
								amountToDeposit
							);
							depositReceipt = await tx.wait();
						});

						it('emitted a DepositInitiated event', async () => {
							const event = depositReceipt.events.find(e => e.event === 'DepositInitiated');
							assert.exists(event);

							assert.equal(event.args._from, user1L1.address);
							assert.equal(event.args._to, randomAddress);
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
								assert.equal(depositFinalizedEvent.args._to, randomAddress);
							});

							it('shows that the L2 balances are updated', async () => {
								assert.bnEqual(await SynthetixL2.balanceOf(user1L1.address), user1BalanceL2);
								assert.bnEqual(
									await SynthetixL2.balanceOf(randomAddress),
									randomAddressBalanceL2.add(amountToDeposit)
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
	itCanPerformDepositsTo,
};
