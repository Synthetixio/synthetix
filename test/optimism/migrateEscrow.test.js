const ethers = require('ethers');
const { assert } = require('../contracts/common');
const { connectContract } = require('./utils/connectContract');

const itCanPerformEscrowMigration = ({ ctx }) => {
	describe.only('[ESCROW_MIGRATION] when migrating L1 rewardEscrowV2 entries to L2', () => {
		const SECOND = 1000;
		const MINUTE = SECOND * 60;

		let user1L1;
		let RewardEscrowV2L1, SynthetixBridgeToOptimismL1, SynthetixL1;
		let RewardEscrowV2L2, SynthetixBridgeToBaseL2, SynthetixL2;

		// --------------------------
		// Setup
		// --------------------------

		before('identify signers', async () => {
			user1L1 = ctx.providerL1.getSigner(ctx.user1Address);
			user1L1.address = ctx.user1Address;
		});

		before('connect to contracts', async () => {
			SynthetixL1 = connectContract({ contract: 'Synthetix', provider: ctx.providerL1 });
			SynthetixL2 = connectContract({
				contract: 'Synthetix',
				source: 'MintableSynthetix',
				useOvm: true,
				provider: ctx.providerL2,
			});

			RewardEscrowV2L1 = connectContract({ contract: 'RewardEscrowV2', provider: ctx.providerL1 });
			RewardEscrowV2L2 = connectContract({
				contract: 'RewardEscrowV2',
				source: 'ImportableRewardEscrowV2',
				useOvm: true,
				provider: ctx.providerL2,
			});

			SynthetixBridgeToOptimismL1 = connectContract({
				contract: 'SynthetixBridgeToOptimism',
				provider: ctx.providerL1,
			});
			SynthetixBridgeToBaseL2 = connectContract({
				contract: 'SynthetixBridgeToBase',
				useOvm: true,
				provider: ctx.providerL2,
			});
		});

		describe('when no escrow has been created', () => {
			it('the initial state should be the expected one', async () => {
				assert.bnEqual(await RewardEscrowV2L1.totalEscrowedBalance(), '0');
				assert.bnEqual(await RewardEscrowV2L1.numVestingEntries(user1L1.address), '0');
				assert.bnEqual(await RewardEscrowV2L1.totalEscrowedAccountBalance(user1L1.address), '0');
				assert.bnEqual(await RewardEscrowV2L1.totalVestedAccountBalance(user1L1.address), '0');
			});
		});

		describe('when a user owns enough SNX', () => {
			const snxAmount = ethers.utils.parseEther('100');

			before('transfer SNX to the L1 user', async () => {
				SynthetixL1 = SynthetixL1.connect(ctx.ownerL1);

				const tx = await SynthetixL1.transfer(user1L1.address, snxAmount);
				await tx.wait();
			});

			it('updates user balance', async () => {
				assert.bnEqual(await SynthetixL1.balanceOf(user1L1.address), snxAmount);
			});

			describe('when the user approves the reward escrow to transfer their SNX', () => {
				before('approve reward escrow ', async () => {
					SynthetixL1 = SynthetixL1.connect(user1L1);

					await SynthetixL1.approve(RewardEscrowV2L1.address, snxAmount);
				});

				const escrowNum = 26;
				const escrowBatches = 2;
				describe(`when the user creates ${escrowNum} escrow entries`, () => {
					const escrowEntryAmount = ethers.utils.parseEther('1');
					const duration = MINUTE;
					let currentId;
					const batchEscrowAmounts = [];
					const userEntryBatch = [];
					let totalEscrowed;

					before('create and append escrow entries', async () => {
						RewardEscrowV2L1 = RewardEscrowV2L1.connect(user1L1);
						for (let i = 0; i < escrowBatches; i++) {
							batchEscrowAmounts[i] = ethers.BigNumber.from('0');
							const userEntries = [];
							for (let j = 0; j < escrowNum; j++) {
								currentId = await RewardEscrowV2L1.nextEntryId();
								const tx = await RewardEscrowV2L1.createEscrowEntry(
									user1L1.address,
									escrowEntryAmount,
									duration
								);
								await tx.wait();
								userEntries[j] = currentId;
								batchEscrowAmounts[i] = batchEscrowAmounts[i].add(escrowEntryAmount);
							}
							userEntryBatch.push(userEntries);
						}

						totalEscrowed = batchEscrowAmounts.reduce(
							(a, b) => a.add(b),
							ethers.BigNumber.from('0')
						);
					});

					// it(`Should create ${escrowNum} entry IDs`, async () => {
					// 	assert.equal(userEntries.length, escrowNum);
					// 	assert.bnEqual(await RewardEscrowV2L1.nextEntryId(), (escrowNum + 1).toString());
					// });

					it('should update the L1 escrow state', async () => {
						assert.bnEqual(await RewardEscrowV2L1.totalEscrowedBalance(), totalEscrowed);
						assert.bnEqual(
							await RewardEscrowV2L1.numVestingEntries(user1L1.address),
							(escrowNum * escrowBatches).toString()
						);
						assert.bnEqual(
							await RewardEscrowV2L1.totalEscrowedAccountBalance(user1L1.address),
							totalEscrowed
						);
						assert.bnEqual(await RewardEscrowV2L1.totalVestedAccountBalance(user1L1.address), '0');
					});

					describe('when the user has no outstanding debt on L1', () => {
						describe('when the user wants to migrate their escrow and deposit SNX', () => {
							describe('when the user has approved the L1 bridge to transfer their SNX', () => {
								let depositAndMigrateReceipt;
								const depositAmount = ethers.utils.parseEther('20');
								before('approve L1 bridge', async () => {
									SynthetixL1 = SynthetixL1.connect(user1L1);
									const tx = await SynthetixL1.approve(
										SynthetixBridgeToOptimismL1.address,
										depositAmount
									);
									await tx.wait();
								});

								describe('when the user deposits SNX along with the migration', () => {
									let mintedSecondaryEvent;
									const importedVestingEntriesEvents = [];

									const mintedSecondaryEventListener = (account, amount, event) => {
										if (event && event.event === 'MintedSecondary') {
											mintedSecondaryEvent = event;
										}
									};

									const importedVestingEntriesEventListener = (account, amount, entries, event) => {
										if (event && event.event === 'ImportedVestingEntries') {
											importedVestingEntriesEvents.push(event);
										}
									};

									before('listen to events on l2', async () => {
										SynthetixBridgeToBaseL2.on(
											'ImportedVestingEntries',
											importedVestingEntriesEventListener
										);
										SynthetixBridgeToBaseL2.on('MintedSecondary', mintedSecondaryEventListener);
									});

									before('depositAndMigrateEscrow', async () => {
										SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(user1L1);
										const tx = await SynthetixBridgeToOptimismL1.depositAndMigrateEscrow(
											depositAmount,
											userEntryBatch
										);
										depositAndMigrateReceipt = await tx.wait();
									});

									it('emitted a Deposit event', async () => {
										const event = depositAndMigrateReceipt.events.find(e => e.event === 'Deposit');
										assert.exists(event);
										assert.bnEqual(event.args.amount, depositAmount);
										assert.equal(event.args.account, user1L1.address);
									});

									it('emitted two ExportedVestingEntries events', async () => {
										const events = depositAndMigrateReceipt.events.filter(
											e => e.event === 'ExportedVestingEntries'
										);
										assert.exists(events);
										// assert.equal(event.args.account, user1L1.address);
										// assert.bnEqual(event.args.escrowedAccountBalance, totalEscrowed);
									});

									it('should update the L1 escrow state', async () => {
										assert.bnEqual(
											await RewardEscrowV2L1.numVestingEntries(user1L1.address),
											(escrowNum * escrowBatches).toString()
										);
										assert.bnEqual(
											await RewardEscrowV2L1.totalEscrowedAccountBalance(user1L1.address),
											'0'
										);
										assert.bnEqual(
											await RewardEscrowV2L1.totalVestedAccountBalance(user1L1.address),
											'0'
										);
									});

									// --------------------------
									// Wait...
									// --------------------------

									describe('when waiting for the tx to complete on L2', () => {
										before('listen for completion', async () => {
											const [
												messageHashL2ImportEntries,
												messageHashL2Deposit,
											] = await ctx.watcher.getMessageHashesFromL1Tx(
												depositAndMigrateReceipt.transactionHash
											);
											const importEntriesReceiptL2 = await ctx.watcher.getL2TransactionReceipt(
												messageHashL2ImportEntries
											);
											await ctx.watcher.getL2TransactionReceipt(messageHashL2Deposit);
										});

										before('stop listening to events on L2', async () => {
											SynthetixBridgeToBaseL2.off(
												'ImportedVestingEntries',
												importedVestingEntriesEventListener
											);
											SynthetixBridgeToBaseL2.off('MintedSecondary', mintedSecondaryEventListener);
										});

										it('emitted two ImportedVestingEntries events', async () => {
											assert.equal(importedVestingEntriesEvents.length, 2);
											assert.equal(importedVestingEntriesEvents[0].args.account, user1L1.address);
											assert.bnEqual(
												importedVestingEntriesEvents[0].args.escrowedAmount,
												batchEscrowAmounts[0]
											);
											assert.equal(importedVestingEntriesEvents[1].args.account, user1L1.address);
											assert.bnEqual(
												importedVestingEntriesEvents[1].args.escrowedAmount,
												batchEscrowAmounts[1]
											);
										});

										it('emitted a MintedSecondary event', async () => {
											assert.exists(mintedSecondaryEvent);
											assert.bnEqual(mintedSecondaryEvent.args.amount, depositAmount);
											assert.equal(mintedSecondaryEvent.args.account, user1L1.address);
										});

										it('should update the L2 escrow state', async () => {
											assert.bnEqual(await RewardEscrowV2L2.totalEscrowedBalance(), totalEscrowed);
											assert.bnEqual(
												await RewardEscrowV2L2.numVestingEntries(user1L1.address),
												(escrowNum * escrowBatches).toString()
											);
											assert.bnEqual(
												await RewardEscrowV2L2.totalEscrowedAccountBalance(user1L1.address),
												totalEscrowed
											);
											assert.bnEqual(
												await RewardEscrowV2L2.totalVestedAccountBalance(user1L1.address),
												'0'
											);
										});

										it('should update the L2 Synthetix state', async () => {
											assert.bnEqual(await SynthetixL2.balanceOf(user1L1.address), depositAmount);
											assert.bnEqual(
												await SynthetixL2.balanceOf(RewardEscrowV2L2.address),
												totalEscrowed
											);
										});
									});
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
	itCanPerformEscrowMigration,
};
