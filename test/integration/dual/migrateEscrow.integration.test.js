const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { bootstrapDual } = require('../utils/bootstrap');

describe('migrateEscrow() integration tests (L1, L2)', () => {
	const ctx = this;
	bootstrapDual({ ctx });

	const SECOND = 1000;
	const MINUTE = SECOND * 60;
	const HOUR = MINUTE * 60;

	let user;
	let SynthetixL1, RewardEscrowV2L1, SynthetixBridgeToOptimism;
	let SynthetixL2, RewardEscrowV2L2, SynthetixBridgeToBase;

	let initialEntriesL1;
	let initialEscrowedBalanceL1;
	let initialEscrowedBalanceL2;
	let userNumVestingEntriesL1;
	let userNumVestingEntriesL2;
	let userEscrowedBalanceL1;
	let userEscrowedBalanceL2;
	let userVestedAccountBalanceL1;
	let userVestedAccountBalanceL2;

	before('target contracts and users', () => {
		({
			Synthetix: SynthetixL1,
			RewardEscrowV2: RewardEscrowV2L1,
			SynthetixBridgeToOptimism,
		} = ctx.l1.contracts);
		({
			Synthetix: SynthetixL2,
			RewardEscrowV2: RewardEscrowV2L2,
			SynthetixBridgeToBase,
		} = ctx.l2.contracts);

		user = ctx.l1.user;
	});

	before('record current escrow state', async () => {
		initialEntriesL1 = await RewardEscrowV2L1.nextEntryId();
		initialEscrowedBalanceL1 = await RewardEscrowV2L1.totalEscrowedBalance();
		initialEscrowedBalanceL2 = await RewardEscrowV2L2.totalEscrowedBalance();
		userNumVestingEntriesL1 = await RewardEscrowV2L1.numVestingEntries(user.address);
		userNumVestingEntriesL2 = await RewardEscrowV2L2.numVestingEntries(user.address);
		userEscrowedBalanceL1 = await RewardEscrowV2L1.totalEscrowedAccountBalance(user.address);
		userEscrowedBalanceL2 = await RewardEscrowV2L2.totalEscrowedAccountBalance(user.address);
		userVestedAccountBalanceL1 = await RewardEscrowV2L1.totalVestedAccountBalance(user.address);
		userVestedAccountBalanceL2 = await RewardEscrowV2L2.totalVestedAccountBalance(user.address);
	});

	describe('when a user owns enough SNX', () => {
		let userBalanceL1;
		const snxAmount = ethers.utils.parseEther('100');

		before('record current values', async () => {
			userBalanceL1 = await SynthetixL1.balanceOf(user.address);
		});

		before('transfer SNX to the L1 user', async () => {
			SynthetixL1 = SynthetixL1.connect(ctx.l1.owner);

			const tx = await SynthetixL1.transfer(user.address, snxAmount);
			await tx.wait();
		});

		it('updates user balance', async () => {
			assert.bnEqual(await SynthetixL1.balanceOf(user.address), userBalanceL1.add(snxAmount));
		});

		describe('when the user approves the reward escrow to transfer their SNX', () => {
			before('approve reward escrow ', async () => {
				SynthetixL1 = SynthetixL1.connect(user);

				await SynthetixL1.approve(RewardEscrowV2L1.address, snxAmount);
			});

			const escrowNum = 26;
			const escrowBatches = 2;
			const numExtraEntries = 3;
			const totalEntriesCreated = escrowNum * escrowBatches + numExtraEntries;

			describe(`when the user creates ${totalEntriesCreated} escrow entries`, () => {
				const escrowEntryAmount = ethers.utils.parseEther('1');
				const duration = HOUR;
				let currentId;
				const batchEscrowAmounts = [];
				const userEntryBatch = [];
				let totalEscrowed = ethers.constants.Zero;
				const extraEntries = [];
				let extraEscrowAmount = ethers.constants.Zero;

				before('create and append escrow entries', async () => {
					RewardEscrowV2L1 = RewardEscrowV2L1.connect(user);
					for (let i = 0; i < escrowBatches; i++) {
						batchEscrowAmounts[i] = ethers.constants.Zero;
						const userEntries = [];
						for (let j = 0; j < escrowNum; j++) {
							currentId = await RewardEscrowV2L1.nextEntryId();
							const tx = await RewardEscrowV2L1.createEscrowEntry(
								user.address,
								escrowEntryAmount,
								duration
							);
							await tx.wait();
							userEntries[j] = currentId;
							batchEscrowAmounts[i] = batchEscrowAmounts[i].add(escrowEntryAmount);
						}
						userEntryBatch.push(userEntries);
					}

					totalEscrowed = batchEscrowAmounts.reduce((a, b) => a.add(b));

					// this loop creates entries [1-numExtraEntries], e.g. 1,2,3 if numExtraEntries = 3
					for (let i = 0; i < numExtraEntries; i++) {
						currentId = await RewardEscrowV2L1.nextEntryId();
						const tx = await RewardEscrowV2L1.createEscrowEntry(
							user.address,
							escrowEntryAmount,
							duration
						);
						await tx.wait();
						extraEscrowAmount = extraEscrowAmount.add(escrowEntryAmount);
						extraEntries.push(currentId);
					}
					totalEscrowed = totalEscrowed.add(extraEscrowAmount);
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
						await RewardEscrowV2L1.numVestingEntries(user.address),
						userNumVestingEntriesL1.add(totalEntriesCreated)
					);
					assert.bnEqual(
						await RewardEscrowV2L1.totalEscrowedAccountBalance(user.address),
						userEscrowedBalanceL1.add(totalEscrowed)
					);
					assert.bnEqual(
						await RewardEscrowV2L1.totalVestedAccountBalance(user.address),
						userVestedAccountBalanceL1
					);
				});

				describe('when the user has no outstanding debt on L1', () => {
					describe('when the user migrates their escrow', () => {
						let migrateEscrowReceipt, migrateEscrowReceiptExtra;
						let userBalanceL2;
						let totalSupplyL2;
						let rewardEscrowBalanceL2;

						const importedVestingEntriesEvents = [];

						const importedVestingEntriesEventListener = (account, amount, entries, event) => {
							if (event && event.event === 'ImportedVestingEntries') {
								importedVestingEntriesEvents.push(event);
							}
						};

						before('listen to events on l2', async () => {
							SynthetixBridgeToBase.on(
								'ImportedVestingEntries',
								importedVestingEntriesEventListener
							);
						});

						before('record current values', async () => {
							userBalanceL2 = await SynthetixL2.balanceOf(user.address);
							totalSupplyL2 = await SynthetixL2.totalSupply();
							rewardEscrowBalanceL2 = await SynthetixL2.balanceOf(RewardEscrowV2L2.address);
						});

						before('migrateEscrow', async () => {
							SynthetixBridgeToOptimism = SynthetixBridgeToOptimism.connect(user);
							// first test migrating a few entries using random extra invalid Ids!
							const randomEntries = [extraEntries, [0, 100, 3, 2]];
							let tx = await SynthetixBridgeToOptimism.migrateEscrow(userEntryBatch);
							migrateEscrowReceipt = await tx.wait();
							tx = await SynthetixBridgeToOptimism.migrateEscrow(randomEntries);
							migrateEscrowReceiptExtra = await tx.wait();
						});

						it('emitted three ExportedVestingEntries events', async () => {
							let events = migrateEscrowReceipt.events.filter(
								e => e.event === 'ExportedVestingEntries'
							);
							assert.equal(events.length, 2);
							assert.equal(events[0].args.account, user.address);
							assert.bnEqual(events[0].args.escrowedAccountBalance, batchEscrowAmounts[0]);
							assert.equal(events[1].args.account, user.address);
							assert.bnEqual(events[1].args.escrowedAccountBalance, batchEscrowAmounts[1]);

							events = migrateEscrowReceiptExtra.events.filter(
								e => e.event === 'ExportedVestingEntries'
							);
							assert.equal(events.length, 1);
							assert.equal(events[0].args.account, user.address);
							assert.bnEqual(events[0].args.escrowedAccountBalance, extraEscrowAmount);
						});

						it('should update the L1 escrow state', async () => {
							assert.bnEqual(
								await RewardEscrowV2L1.totalEscrowedBalance(),
								initialEscrowedBalanceL1
							);
							assert.bnEqual(
								await RewardEscrowV2L1.numVestingEntries(user.address),
								userNumVestingEntriesL1.add(totalEntriesCreated)
							);
							assert.bnEqual(
								await RewardEscrowV2L1.totalEscrowedAccountBalance(user.address),
								userEscrowedBalanceL1
							);
							assert.bnEqual(
								await RewardEscrowV2L1.totalVestedAccountBalance(user.address),
								userVestedAccountBalanceL1
							);
						});

						// --------------------------
						// Wait...
						// --------------------------

						describe('when waiting for the tx to complete on L2', () => {
							before('listen for completion', async () => {
								const [messageHashL2ImportEntries] = await ctx.watcher.getMessageHashesFromL1Tx(
									migrateEscrowReceipt.transactionHash
								);
								await ctx.watcher.getL2TransactionReceipt(messageHashL2ImportEntries);
								const [
									messageHashL2ImportEntriesExtra,
								] = await ctx.watcher.getMessageHashesFromL1Tx(
									migrateEscrowReceiptExtra.transactionHash
								);
								await ctx.watcher.getL2TransactionReceipt(messageHashL2ImportEntriesExtra);
							});

							before('stop listening to events on L2', async () => {
								SynthetixBridgeToBase.off(
									'ImportedVestingEntries',
									importedVestingEntriesEventListener
								);
							});

							it('emitted three ImportedVestingEntries events', async () => {
								assert.equal(importedVestingEntriesEvents.length, 3);
								assert.equal(importedVestingEntriesEvents[0].args.account, user.address);
								assert.bnEqual(
									importedVestingEntriesEvents[0].args.escrowedAmount,
									batchEscrowAmounts[0]
								);
								assert.equal(importedVestingEntriesEvents[1].args.account, user.address);
								assert.bnEqual(
									importedVestingEntriesEvents[1].args.escrowedAmount,
									batchEscrowAmounts[1]
								);
								assert.equal(importedVestingEntriesEvents[2].args.account, user.address);
								assert.bnEqual(
									importedVestingEntriesEvents[2].args.escrowedAmount,
									extraEscrowAmount
								);
							});

							it('should update the L2 escrow state', async () => {
								assert.bnEqual(
									await RewardEscrowV2L2.totalEscrowedBalance(),
									initialEscrowedBalanceL2.add(totalEscrowed)
								);
								assert.bnEqual(
									await RewardEscrowV2L2.numVestingEntries(user.address),
									userNumVestingEntriesL2.add(totalEntriesCreated)
								);
								assert.bnEqual(
									await RewardEscrowV2L2.totalEscrowedAccountBalance(user.address),
									userEscrowedBalanceL2.add(totalEscrowed)
								);
								assert.bnEqual(
									await RewardEscrowV2L2.totalVestedAccountBalance(user.address),
									userVestedAccountBalanceL2
								);
							});

							it('should update the L2 Synthetix state', async () => {
								// no change in user balance
								assert.bnEqual(await SynthetixL2.balanceOf(user.address), userBalanceL2);
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
