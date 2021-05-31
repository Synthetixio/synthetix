const ethers = require('ethers');
const { assert } = require('../../contracts/common');
const { bootstrapDual } = require('../utils/bootstrap');
const { appendEscrows, retrieveEscrowParameters } = require('../utils/escrow');
const { approveIfNeeded } = require('../utils/approve');

describe('migrateEscrow() integration tests (L1, L2)', () => {
	const ctx = this;
	bootstrapDual({ ctx });

	let user;
	let Synthetix, RewardEscrowV2, SynthetixBridgeToOptimism, SynthetixBridgeToBase;

	let initialParametersL1, initialParametersL2;

	before('target contracts and users', () => {
		({ Synthetix, RewardEscrowV2, SynthetixBridgeToOptimism } = ctx.l1.contracts);

		user = ctx.l1.users.owner;
	});

	before('record current escrow state', async () => {
		initialParametersL1 = await retrieveEscrowParameters({ ctx: ctx.l1 });
		initialParametersL2 = await retrieveEscrowParameters({ ctx: ctx.l2 });
	});

	describe('when the user approves the reward escrow to transfer their SNX', () => {
		const snxAmount = ethers.utils.parseEther('100');

		before('approve reward escrow if needed', async () => {
			await approveIfNeeded({
				token: Synthetix,
				owner: user,
				beneficiary: RewardEscrowV2,
				amount: snxAmount,
			});
		});

		const escrowNum = 26;
		const escrowBatches = 2;
		const numExtraEntries = 3;
		const totalEntriesCreated = escrowNum * escrowBatches + numExtraEntries;
		describe(`when the user creates ${totalEntriesCreated} escrow entries`, () => {
			let postParametersL1 = {};
			let escrowEntriesData = {};

			before('create and append escrow entries', async () => {
				escrowEntriesData = await appendEscrows({
					ctx: ctx.l1,
					user,
					escrowBatches,
					numExtraEntries,
					escrowNum,
					escrowEntryAmount: ethers.constants.One,
				});
			});

			before('grab new states on L1', async () => {
				postParametersL1 = await retrieveEscrowParameters({ ctx: ctx.l1 });
			});

			it('should update the L1 escrow state', async () => {
				assert.bnEqual(
					postParametersL1.escrowedBalance,
					initialParametersL1.escrowedBalance.add(escrowEntriesData.totalEscrowed)
				);
				assert.bnEqual(
					postParametersL1.userNumVestingEntries,
					initialParametersL1.userNumVestingEntries.add(totalEntriesCreated)
				);
				assert.bnEqual(
					postParametersL1.userEscrowedBalance,
					initialParametersL1.userEscrowedBalance.add(escrowEntriesData.totalEscrowed)
				);
				assert.bnEqual(
					postParametersL1.userVestedAccountBalance,
					initialParametersL1.userVestedAccountBalance
				);
			});

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

				before('target contracts and users L2 ', () => {
					({ Synthetix, RewardEscrowV2, SynthetixBridgeToBase } = ctx.l2.contracts);

					user = ctx.l2.users.owner;
				});

				before('listen to events on L2', async () => {
					SynthetixBridgeToBase.on('ImportedVestingEntries', importedVestingEntriesEventListener);
				});

				before('record current values', async () => {
					userBalanceL2 = await Synthetix.balanceOf(user.address);
					totalSupplyL2 = await Synthetix.totalSupply();
					rewardEscrowBalanceL2 = await Synthetix.balanceOf(RewardEscrowV2.address);
				});

				before('migrateEscrow', async () => {
					SynthetixBridgeToOptimism = SynthetixBridgeToOptimism.connect(ctx.l1.users.owner);
					// first test migrating a few entries using random extra invalid Ids!
					const randomEntries = [escrowEntriesData.extraEntries, [0, 100, 3, 2]];
					let tx = await SynthetixBridgeToOptimism.migrateEscrow(escrowEntriesData.userEntryBatch);
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
					assert.bnEqual(
						events[0].args.escrowedAccountBalance,
						escrowEntriesData.batchEscrowAmounts[0]
					);
					assert.equal(events[1].args.account, user.address);
					assert.bnEqual(
						events[1].args.escrowedAccountBalance,
						escrowEntriesData.batchEscrowAmounts[1]
					);

					events = migrateEscrowReceiptExtra.events.filter(
						e => e.event === 'ExportedVestingEntries'
					);
					assert.equal(events.length, 1);
					assert.equal(events[0].args.account, user.address);
					assert.bnEqual(
						events[0].args.escrowedAccountBalance,
						escrowEntriesData.extraEscrowAmount
					);
				});

				it('should update the L1 escrow state', async () => {
					postParametersL1 = await retrieveEscrowParameters({ ctx: ctx.l1 });

					assert.bnEqual(postParametersL1.escrowedBalance, initialParametersL1.escrowedBalance);

					assert.bnEqual(
						postParametersL1.userNumVestingEntries,
						initialParametersL1.userNumVestingEntries.add(totalEntriesCreated)
					);

					assert.bnEqual(
						postParametersL1.escrowedBalance,
						initialParametersL1.escrowedBalance.add(escrowEntriesData.totalEscrowed)
					);
					assert.bnEqual(
						postParametersL1.userEscrowedBalance,
						initialParametersL1.userEscrowedBalance
					);

					assert.bnEqual(
						postParametersL1.userVestedAccountBalance,
						initialParametersL1.userVestedAccountBalance
					);
				});

				// --------------------------
				// Wait...
				// --------------------------

				describe('when waiting for the tx to complete on L2', () => {
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
							escrowEntriesData.batchEscrowAmounts[0]
						);
						assert.equal(importedVestingEntriesEvents[1].args.account, user.address);
						assert.bnEqual(
							importedVestingEntriesEvents[1].args.escrowedAmount,
							escrowEntriesData.batchEscrowAmounts[1]
						);
						assert.equal(importedVestingEntriesEvents[2].args.account, user.address);
						assert.bnEqual(
							importedVestingEntriesEvents[2].args.escrowedAmount,
							escrowEntriesData.extraEscrowAmount
						);
					});

					it('should update the L2 escrow state', async () => {
						const postParametersL2 = await retrieveEscrowParameters({ ctx: ctx.l2 });
						assert.bnEqual(
							postParametersL2.escrowedBalance,
							initialParametersL2.escrowedBalance.add(escrowEntriesData.totalEscrowed)
						);
						assert.bnEqual(
							postParametersL2.userNumVestingEntries,
							initialParametersL2.userNumVestingEntries.add(totalEntriesCreated)
						);
						assert.bnEqual(
							postParametersL2.userEscrowedBalance,
							initialParametersL2.userEscrowedBalance.add(escrowEntriesData.totalEscrowed)
						);
						assert.bnEqual(
							postParametersL2.userVestedAccountBalance,
							initialParametersL2.userVestedAccountBalance
						);
					});

					it('should update the L2 Synthetix state', async () => {
						({ Synthetix, RewardEscrowV2 } = ctx.l2.contracts);

						user = ctx.l2.users.owner;

						// no change in user balance
						assert.bnEqual(await Synthetix.balanceOf(user.address), userBalanceL2);
						//
						assert.bnEqual(
							await Synthetix.balanceOf(RewardEscrowV2.address),
							rewardEscrowBalanceL2.add(escrowEntriesData.totalEscrowed)
						);
						assert.bnEqual(
							await Synthetix.totalSupply(),
							totalSupplyL2.add(escrowEntriesData.totalEscrowed)
						);
					});
				});
			});
		});
	});
});
