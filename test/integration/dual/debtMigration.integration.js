// const ethers = require('ethers');
// const { assert } = require('../../contracts/common');
// const { bootstrapDual } = require('../utils/bootstrap');
// const { appendEscrows, retrieveEscrowParameters } = require('../utils/escrow');
// const { finalizationOnL2 } = require('../utils/optimism');
// const { approveIfNeeded } = require('../utils/approve');

describe('migrateDebt() integration tests (L1, L2)', () => {
	// const ctx = this;
	// bootstrapDual({ ctx });
	// const amountToDeposit = ethers.utils.parseEther('10');
	// let owner, user;
	// let DebtMigratorOnEthereum,
	// 	DebtMigratorOnOptimism,
	// 	RewardEscrowV2,
	// 	RewardEscrowV2L2,
	// 	Synthetix,
	// 	SynthetixL2,
	// 	SynthetixBridgeToOptimism,
	// 	SynthetixBridgeEscrow;
	// let ownerBalance, beneficiaryBalance, escrowBalance;
	// let initialParametersL1, initialParametersL2, initialUserL1Balance;
	// const snxAmount = ethers.utils.parseEther('100');
	// before('record initial state', async () => {
	// 	initialParametersL1 = await retrieveEscrowParameters({ ctx: ctx.l1 });
	// 	initialParametersL2 = await retrieveEscrowParameters({ ctx: ctx.l2 });
	// 	({ Synthetix } = ctx.l1.contracts);
	// 	user = ctx.l1.users.owner;
	// 	initialUserL1Balance = await Synthetix.balanceOf(user.address);
	// });
	// before('approve reward escrow if needed', async () => {
	// 	({ Synthetix, RewardEscrowV2 } = ctx.l1.contracts);
	// 	user = ctx.l1.users.owner;
	// 	await approveIfNeeded({
	// 		token: Synthetix,
	// 		owner: user,
	// 		beneficiary: RewardEscrowV2,
	// 		amount: snxAmount,
	// 	});
	// });
	// const escrowNum = 26;
	// const escrowBatches = 2;
	// const numExtraEntries = 0;
	// const totalEntriesCreated = escrowNum * escrowBatches + numExtraEntries;
	// describe(`when the user creates ${totalEntriesCreated} escrow entries`, () => {
	// 	let postParametersL1 = {};
	// 	let escrowEntriesData = {};
	// 	before('create and append escrow entries', async () => {
	// 		user = ctx.l1.users.owner;
	// 		escrowEntriesData = await appendEscrows({
	// 			ctx: ctx.l1,
	// 			user,
	// 			escrowBatches,
	// 			numExtraEntries,
	// 			escrowNum,
	// 			escrowEntryAmount: ethers.constants.One,
	// 		});
	// 	});
	// 	before('grab new states on L1', async () => {
	// 		postParametersL1 = await retrieveEscrowParameters({ ctx: ctx.l1 });
	// 	});
	// 	it('should update the L1 escrow state', () => {
	// 		assert.bnEqual(
	// 			postParametersL1.escrowedBalance,
	// 			initialParametersL1.escrowedBalance.add(escrowEntriesData.totalEscrowed)
	// 		);
	// 		assert.bnEqual(
	// 			postParametersL1.userNumVestingEntries,
	// 			initialParametersL1.userNumVestingEntries.add(totalEntriesCreated)
	// 		);
	// 		assert.bnEqual(
	// 			postParametersL1.userEscrowedBalance,
	// 			initialParametersL1.userEscrowedBalance.add(escrowEntriesData.totalEscrowed)
	// 		);
	// 		assert.bnEqual(
	// 			postParametersL1.userVestedAccountBalance,
	// 			initialParametersL1.userVestedAccountBalance
	// 		);
	// 	});
	// 	describe('when the user migrates their escrow and deposit SNX', () => {
	// 		let migrateDebtReceipt;
	// 		let userBalanceL2;
	// 		let totalSupplyL2;
	// 		let rewardEscrowBalanceL2;
	// 		before('approve L1 bridge if needed', async () => {
	// 			({ Synthetix, DebtMigratorOnEthereum } = ctx.l1.contracts);
	// 			user = ctx.l1.users.owner;
	// 			await approveIfNeeded({
	// 				token: Synthetix,
	// 				owner: user,
	// 				beneficiary: DebtMigratorOnEthereum,
	// 				amount: initialUserL1Balance,
	// 			});
	// 		});
	// 		before('target contracts and users', () => {
	// 			({ Synthetix, RewardEscrowV2 } = ctx.l2.contracts);
	// 			user = ctx.l2.users.owner;
	// 		});
	// 		before('record current values', async () => {
	// 			userBalanceL2 = await Synthetix.balanceOf(user.address);
	// 			totalSupplyL2 = await Synthetix.totalSupply();
	// 			rewardEscrowBalanceL2 = await Synthetix.balanceOf(RewardEscrowV2.address);
	// 		});
	// 		before('migrateDebt', async () => {
	// 			({ DebtMigratorOnEthereum } = ctx.l1.contracts);
	// 			DebtMigratorOnEthereum = DebtMigratorOnEthereum.connect(ctx.l1.users.owner);
	// 			// first test migrating a few entries using random extra invalid Ids!
	// 			const tx = await DebtMigratorOnEthereum.migrateDebt(
	// 				user.address,
	// 				escrowEntriesData.userEntryBatch
	// 			);
	// 			migrateDebtReceipt = await tx.wait();
	// 		});
	// 		it('should update the L1 escrow state', async () => {
	// 			postParametersL1 = await retrieveEscrowParameters({ ctx: ctx.l1 });
	// 			assert.bnEqual(postParametersL1.escrowedBalance, initialParametersL1.escrowedBalance);
	// 			assert.bnEqual(
	// 				postParametersL1.userNumVestingEntries,
	// 				initialParametersL1.userNumVestingEntries.add(totalEntriesCreated)
	// 			);
	// 			assert.bnEqual(postParametersL1.escrowedBalance, initialParametersL1.escrowedBalance);
	// 			assert.bnEqual(
	// 				postParametersL1.userEscrowedBalance,
	// 				initialParametersL1.userEscrowedBalance
	// 			);
	// 			assert.bnEqual(
	// 				postParametersL1.userVestedAccountBalance,
	// 				initialParametersL1.userVestedAccountBalance
	// 			);
	// 		});
	// 		it('should update the L1 Synthetix state', async () => {
	// 			({ Synthetix } = ctx.l1.contracts);
	// 			user = ctx.l1.users.owner;
	// 			assert.bnEqual(await Synthetix.balanceOf(user.address), 0);
	// 		});
	// 		// --------------------------
	// 		// Wait...
	// 		// --------------------------
	// 		describe('when the escrow gets picked up in L2', () => {
	// 			before('listen for completion', async () => {
	// 				await finalizationOnL2({
	// 					ctx,
	// 					transactionHash: migrateDebtReceipt.transactionHash,
	// 				});
	// 			});
	// 			it('should update the L2 escrow state', async () => {
	// 				const postParametersL2 = await retrieveEscrowParameters({ ctx: ctx.l2 });
	// 				assert.bnEqual(
	// 					postParametersL2.escrowedBalance,
	// 					initialParametersL2.escrowedBalance.add(escrowEntriesData.totalEscrowed)
	// 				);
	// 				assert.bnEqual(
	// 					postParametersL2.userNumVestingEntries,
	// 					initialParametersL2.userNumVestingEntries.add(totalEntriesCreated)
	// 				);
	// 				assert.bnEqual(
	// 					postParametersL2.userEscrowedBalance,
	// 					initialParametersL2.userEscrowedBalance.add(escrowEntriesData.totalEscrowed)
	// 				);
	// 				assert.bnEqual(
	// 					postParametersL2.userVestedAccountBalance,
	// 					initialParametersL2.userVestedAccountBalance
	// 				);
	// 			});
	// 			it('should update the L2 Synthetix state', async () => {
	// 				({ Synthetix, RewardEscrowV2 } = ctx.l2.contracts);
	// 				user = ctx.l2.users.owner;
	// 				assert.bnEqual(await Synthetix.balanceOf(user.address), userBalanceL2.add(depositAmount));
	// 				assert.bnEqual(
	// 					await Synthetix.balanceOf(RewardEscrowV2.address),
	// 					rewardEscrowBalanceL2.add(escrowEntriesData.totalEscrowed)
	// 				);
	// 				assert.bnEqual(
	// 					await Synthetix.totalSupply(),
	// 					totalSupplyL2.add(escrowEntriesData.totalEscrowed).add(depositAmount)
	// 				);
	// 			});
	// 		});
	// 	});
	// });
});
