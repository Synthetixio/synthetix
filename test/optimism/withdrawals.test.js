const ethers = require('ethers');
const { assert } = require('../contracts/common');
const { assertRevertOptimism } = require('./utils/revertOptimism');
const { connectContract } = require('./utils/connectContract');

const itCanPerformWithdrawals = ({ ctx }) => {
	describe('[WITHDRAW] when withdrawing SNX from L2 to L1', () => {
		const amountToWithdraw = ethers.utils.parseEther('10');

		let user1L2;

		let SynthetixL1, SynthetixBridgeToOptimismL1, SynthetixBridgeEscrowL1;
		let SynthetixL2, SynthetixBridgeToBaseL2;
		let depositReceipt;

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
			SynthetixBridgeEscrowL1 = connectContract({
				contract: 'SynthetixBridgeEscrow',
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

		before('make a deposit', async () => {
			let tx;

			SynthetixL1 = SynthetixL1.connect(ctx.ownerL1);
			await SynthetixL1.approve(
				SynthetixBridgeToOptimismL1.address,
				ethers.utils.parseEther(amountToWithdraw.toString())
			);

			SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(ctx.ownerL1);
			if ((await SynthetixBridgeToOptimismL1.initiationActive()) === false) {
				tx = await SynthetixBridgeToOptimismL1.resumeInitiation();
				await tx.wait();
			}

			tx = await SynthetixBridgeToOptimismL1.deposit(amountToWithdraw);
			depositReceipt = await tx.wait();
		});

		// --------------------------
		// Get SNX
		// --------------------------

		describe('when waiting for the tx to complete on L2', () => {
			before('listen for completion', async () => {
				const [transactionHashL2] = await ctx.watcher.getMessageHashesFromL1Tx(
					depositReceipt.transactionHash
				);
				await ctx.watcher.getL2TransactionReceipt(transactionHashL2);
			});

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
				// At least one issuance
				// --------------------------

				describe('when the SNX rate has been updated', () => {
					// --------------------------
					// Suspended
					// --------------------------

					describe('when initiation is suspended on L2', () => {
						before('suspend initiations on L2', async () => {
							SynthetixBridgeToBaseL2 = SynthetixBridgeToBaseL2.connect(ctx.ownerL2);
							const tx = await SynthetixBridgeToBaseL2.suspendInitiation();
							await tx.wait();
						});

						after('resume initiations on L2', async () => {
							SynthetixBridgeToBaseL2 = SynthetixBridgeToBaseL2.connect(ctx.ownerL2);
							const tx = await SynthetixBridgeToBaseL2.resumeInitiation();
							await tx.wait();
						});

						it('reverts when the user attempts to initiate a withdrawal', async () => {
							SynthetixBridgeToBaseL2 = SynthetixBridgeToBaseL2.connect(user1L2);
							await assertRevertOptimism({
								tx: SynthetixBridgeToBaseL2.withdraw(amountToWithdraw),
								reason: 'Initiation deactivated',
								provider: ctx.providerL2,
							});
						});
					});

					// --------------------------
					// Not suspended
					// --------------------------

					describe('before a user initiates a withdrawal on L2', () => {
						it('inititation is active on both layers', async () => {
							assert.equal(await SynthetixBridgeToOptimismL1.initiationActive(), true);
							assert.equal(await SynthetixBridgeToBaseL2.initiationActive(), true);
						});

						describe('when a user initiates a withdrawal on L2', () => {
							let user1BalanceL1;
							let escrowBalanceL1;
							let withdrawalReceipt;
							let withdrawalFinalizedEvent;

							// suspending initation should not affect withdrawals
							before('suspend initiation on L1', async () => {
								SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(ctx.ownerL1);
								const tx = await SynthetixBridgeToOptimismL1.suspendInitiation();
								await tx.wait();
							});

							// always resume afterwards so we keep a clean state
							after('resume initiation on L1', async () => {
								SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(ctx.ownerL1);
								const tx = await SynthetixBridgeToOptimismL1.resumeInitiation();
								await tx.wait();
							});

							const eventListener = (from, value, event) => {
								if (event && event.event === 'WithdrawalFinalized') {
									withdrawalFinalizedEvent = event;
								}
							};

							before('listen to events on l1', async () => {
								SynthetixBridgeToOptimismL1.on('WithdrawalFinalized', eventListener);
							});

							before('record current values', async () => {
								user1BalanceL1 = await SynthetixL1.balanceOf(user1L2.address);
								escrowBalanceL1 = await SynthetixL1.balanceOf(SynthetixBridgeEscrowL1.address);
								user1BalanceL2 = await SynthetixL2.balanceOf(user1L2.address);
							});

							before('initiate withdrawal', async () => {
								SynthetixBridgeToBaseL2 = SynthetixBridgeToBaseL2.connect(user1L2);

								const tx = await SynthetixBridgeToBaseL2.withdraw(amountToWithdraw);
								withdrawalReceipt = await tx.wait();
							});

							it('reduces the users balance', async () => {
								assert.bnEqual(
									await SynthetixL2.balanceOf(user1L2.address),
									user1BalanceL2.sub(amountToWithdraw)
								);
							});

							it('inititation is deactivated on L1', async () => {
								assert.equal(await SynthetixBridgeToBaseL2.initiationActive(), true);
								assert.equal(await SynthetixBridgeToOptimismL1.initiationActive(), false);
							});

							describe('when waiting for the tx to complete on L1', () => {
								before('listen for completion', async () => {
									const [messageHashL1] = await ctx.watcher.getMessageHashesFromL2Tx(
										withdrawalReceipt.transactionHash
									);
									console.log(messageHashL1);

									const blockNumber = await ctx.providerL1.getBlockNumber();
									const block = await ctx.providerL1.getBlock(blockNumber);
									console.log('Latest L1 block:', JSON.stringify(block, null, 2));

									const txs = await Promise.all(
										block.transactions.map(txHash => ctx.providerL1.getTransaction(txHash))
									);
									console.log('Txs in L1 block:', JSON.stringify(txs, null, 2));

									const tx = txs.find(tx => {
										// TODO: Actually compare the message hash, for now just returning the first tx
										return true;
										// const messageHash = ethers.utils.keccak256(tx.data);
										// console.log(messageHash);

										// return messageHash === messageHashL1;
									});

									const receipt = await ctx.providerL1.getTransactionReceipt(tx.hash);
									console.log('L1 receipt:', receipt);

									// TODO: Hangs here!
									await ctx.watcher.getL1TransactionReceipt(messageHashL1);
								});

								before('stop listening to events on L1', async () => {
									SynthetixBridgeToOptimismL1.off('WithdrawalFinalized', eventListener);
								});

								it('emitted a WithdrawalFinalized event', async () => {
									assert.exists(withdrawalFinalizedEvent);
									assert.bnEqual(withdrawalFinalizedEvent.args._amount, amountToWithdraw);
									assert.equal(withdrawalFinalizedEvent.args._to, user1L2.address);
								});

								it('shows that the users L1 balance increased', async () => {
									assert.bnEqual(
										await SynthetixL1.balanceOf(user1L2.address),
										user1BalanceL1.add(amountToWithdraw)
									);
								});

								it('shows that the escrow balance decreased', async () => {
									assert.bnEqual(
										await SynthetixL1.balanceOf(SynthetixBridgeEscrowL1.address),
										escrowBalanceL1.sub(amountToWithdraw)
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
	itCanPerformWithdrawals,
};
