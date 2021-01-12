const ethers = require('ethers');
const { assert } = require('../contracts/common');
const { connectContract } = require('./utils/connectContract');

const itCanPerformEscrowMigration = ({ ctx }) => {
	describe('[ESCROW_MIGRATION] when migrating L1 rewardEscrowV2 entries to L2', () => {
		const SECOND = 1000;
		const MINUTE = SECOND * 60;
		const HOUR = MINUTE * 60;

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

		let initialEntriesL1;
		let initialEscrowedBalanceL1;
		let initialEscrowedBalanceL2;
		let user1NumVestingEntriesL1;
		let user1NumVestingEntriesL2;
		let user1EscrowedBalanceL1;
		let user1EscrowedBalanceL2;
		let user1VestedAccountBalanceL1;
		let user1VestedAccountBalanceL2;

		before('record current escrow state', async () => {
			initialEntriesL1 = await RewardEscrowV2L1.nextEntryId();
			initialEscrowedBalanceL1 = await RewardEscrowV2L1.totalEscrowedBalance();
			initialEscrowedBalanceL2 = await RewardEscrowV2L2.totalEscrowedBalance();
			user1NumVestingEntriesL1 = await RewardEscrowV2L1.numVestingEntries(user1L1.address);
			user1NumVestingEntriesL2 = await RewardEscrowV2L2.numVestingEntries(user1L1.address);
			user1EscrowedBalanceL1 = await RewardEscrowV2L1.totalEscrowedAccountBalance(user1L1.address);
			user1EscrowedBalanceL2 = await RewardEscrowV2L2.totalEscrowedAccountBalance(user1L1.address);
			user1VestedAccountBalanceL1 = await RewardEscrowV2L1.totalVestedAccountBalance(
				user1L1.address
			);
			user1VestedAccountBalanceL2 = await RewardEscrowV2L2.totalVestedAccountBalance(
				user1L1.address
			);
		});

		describe('when a user owns enough SNX', () => {
			const snxAmount = ethers.utils.parseEther('100');

			let user1BalanceL1;

			before('record current values', async () => {
				user1BalanceL1 = await SynthetixL1.balanceOf(user1L1.address);
			});

			before('transfer SNX to the L1 user', async () => {
				SynthetixL1 = SynthetixL1.connect(ctx.ownerL1);

				const tx = await SynthetixL1.transfer(user1L1.address, snxAmount);
				await tx.wait();
			});

			it('updates user balance', async () => {
				assert.bnEqual(await SynthetixL1.balanceOf(user1L1.address), user1BalanceL1.add(snxAmount));
			});

			describe('when the user approves the reward escrow to transfer their SNX', () => {
				before('approve reward escrow ', async () => {
					SynthetixL1 = SynthetixL1.connect(user1L1);

					await SynthetixL1.approve(RewardEscrowV2L1.address, snxAmount);
				});

				const escrowNum = 26;
				const escrowBatches = 2;
				const totalEntriesCreated = escrowNum * escrowBatches;
				describe(`when the user creates ${totalEntriesCreated} escrow entries`, () => {
					const escrowEntryAmount = ethers.utils.parseEther('1');
					const duration = HOUR;
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

					it(`Should create ${totalEntriesCreated} new entry IDs`, async () => {
						assert.bnEqual(
							await RewardEscrowV2L1.nextEntryId(),
							initialEntriesL1.add(totalEntriesCreated)
						);
					});

					it('should update the L1 escrow state', async () => {
						assert.bnEqual(
							await RewardEscrowV2L1.totalEscrowedBalance(),
							initialEscrowedBalanceL1.add(totalEscrowed)
						);
						assert.bnEqual(
							await RewardEscrowV2L1.numVestingEntries(user1L1.address),
							user1NumVestingEntriesL1.add(totalEntriesCreated)
						);
						assert.bnEqual(
							await RewardEscrowV2L1.totalEscrowedAccountBalance(user1L1.address),
							user1EscrowedBalanceL1.add(totalEscrowed)
						);
						assert.bnEqual(
							await RewardEscrowV2L1.totalVestedAccountBalance(user1L1.address),
							user1VestedAccountBalanceL1
						);
					});

					describe('when the user has no outstanding debt on L1', () => {
						describe('when the user migrates their escrow', () => {
							let initiateEscrowMigrationReceipt;
							let user1BalanceL2;
							let totalSupplyL2;
							let rewardEscrowBalanceL2;

							const importedVestingEntriesEvents = [];

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
							});

							before('record current values', async () => {
								user1BalanceL2 = await SynthetixL2.balanceOf(user1L1.address);
								totalSupplyL2 = await SynthetixL2.totalSupply();
								rewardEscrowBalanceL2 = await SynthetixL2.balanceOf(RewardEscrowV2L2.address);
							});

							before('initiateEscrowMigration', async () => {
								SynthetixBridgeToOptimismL1 = SynthetixBridgeToOptimismL1.connect(user1L1);
								const tx = await SynthetixBridgeToOptimismL1.initiateEscrowMigration(
									userEntryBatch
								);
								initiateEscrowMigrationReceipt = await tx.wait();
							});

							it('emitted two ExportedVestingEntries events', async () => {
								const events = initiateEscrowMigrationReceipt.events.filter(
									e => e.event === 'ExportedVestingEntries'
								);
								assert.equal(events.length, 2);
								assert.equal(events[0].args.account, user1L1.address);
								assert.bnEqual(events[0].args.escrowedAccountBalance, batchEscrowAmounts[0]);
								assert.equal(events[1].args.account, user1L1.address);
								assert.bnEqual(events[1].args.escrowedAccountBalance, batchEscrowAmounts[1]);
							});

							it('should update the L1 escrow state', async () => {
								assert.bnEqual(
									await RewardEscrowV2L1.totalEscrowedBalance(),
									initialEscrowedBalanceL1
								);
								assert.bnEqual(
									await RewardEscrowV2L1.numVestingEntries(user1L1.address),
									user1NumVestingEntriesL1.add(totalEntriesCreated)
								);
								assert.bnEqual(
									await RewardEscrowV2L1.totalEscrowedAccountBalance(user1L1.address),
									user1EscrowedBalanceL1
								);
								assert.bnEqual(
									await RewardEscrowV2L1.totalVestedAccountBalance(user1L1.address),
									user1VestedAccountBalanceL1
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
										initiateEscrowMigrationReceipt.transactionHash
									);
									await ctx.watcher.getL2TransactionReceipt(messageHashL2ImportEntries);
									await ctx.watcher.getL2TransactionReceipt(messageHashL2Deposit);
								});

								before('stop listening to events on L2', async () => {
									SynthetixBridgeToBaseL2.off(
										'ImportedVestingEntries',
										importedVestingEntriesEventListener
									);
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

								it('should update the L2 escrow state', async () => {
									assert.bnEqual(
										await RewardEscrowV2L2.totalEscrowedBalance(),
										initialEscrowedBalanceL2.add(totalEscrowed)
									);
									assert.bnEqual(
										await RewardEscrowV2L2.numVestingEntries(user1L1.address),
										user1NumVestingEntriesL2.add(totalEntriesCreated)
									);
									assert.bnEqual(
										await RewardEscrowV2L2.totalEscrowedAccountBalance(user1L1.address),
										user1EscrowedBalanceL2.add(totalEscrowed)
									);
									assert.bnEqual(
										await RewardEscrowV2L2.totalVestedAccountBalance(user1L1.address),
										user1VestedAccountBalanceL2
									);
								});

								it('should update the L2 Synthetix state', async () => {
									// no change in user balance
									assert.bnEqual(await SynthetixL2.balanceOf(user1L1.address), user1BalanceL2);
									//
									assert.bnEqual(
										await SynthetixL2.balanceOf(RewardEscrowV2L2.address),
										rewardEscrowBalanceL2.add(totalEscrowed)
									);
									assert.bnEqual(await SynthetixL2.totalSupply(), totalSupplyL2.add(totalEscrowed));
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
