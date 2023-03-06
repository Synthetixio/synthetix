const ethers = require('ethers');
const { toBytes32 } = require('../../../index');
const { appendEscrows, retrieveEscrowParameters } = require('../utils/escrow');
const { approveIfNeeded } = require('../utils/approve');
const { assert } = require('../../contracts/common');
const { bootstrapDual } = require('../utils/bootstrap');
const { ensureBalance } = require('../utils/balances');
const { finalizationOnL2 } = require('../utils/optimism');

describe('migrateDebt() integration tests (L1, L2)', () => {
	const ctx = this;
	bootstrapDual({ ctx });

	let owner, user, mockMigrator;
	let AddressResolver, DebtMigratorOnEthereum, RewardEscrowV2, Synthetix, SynthetixDebtShare;

	let initialParametersL1,
		initialParametersL2,
		initialCollateralBalanceL1,
		initialLiquidBalanceL1,
		initialDebtShareBalanceL1;

	let postParametersL1 = {};
	let escrowEntriesData = {};
	const escrowNum = 26;
	const escrowBatches = 2;
	const numExtraEntries = 0;
	const totalEntriesCreated = escrowNum * escrowBatches + numExtraEntries;
	const SNXAmount = ethers.utils.parseEther('1000');
	const amountToIssue = ethers.utils.parseEther('100');

	before('target contracts and users', () => {
		({
			AddressResolver,
			DebtMigratorOnEthereum,
			RewardEscrowV2,
			Synthetix,
			SynthetixDebtShare,
		} = ctx.l1.contracts);
		user = ctx.l1.users.someUser;
		owner = ctx.l1.users.owner;
	});

	before('setup mock debt migrator on L2', async () => {
		AddressResolver = AddressResolver.connect(owner);
		await (
			await AddressResolver.importAddresses(
				[toBytes32('ovm:DebtMigratorOnOptimism')],
				[mockMigrator.address]
			)
		).wait();
		await (await DebtMigratorOnEthereum.connect(owner).rebuildCache()).wait();
	});

	before('ensure the user has enough SNX', async () => {
		await ensureBalance({ ctx: ctx.l1, symbol: 'SNX', user, balance: SNXAmount });
	});

	before('approve reward escrow if needed', async () => {
		await approveIfNeeded({
			token: Synthetix,
			owner: user,
			beneficiary: RewardEscrowV2,
			amount: SNXAmount,
		});
	});

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

	before('stake some SNX', async () => {
		Synthetix = Synthetix.connect(user);

		const tx = await Synthetix.issueSynths(amountToIssue);
		const { gasUsed } = await tx.wait();
		console.log(`debtMigration: issueSynths() gas used: ${Math.round(gasUsed / 1000).toString()}k`);
	});

	before('record initial state', async () => {
		initialParametersL1 = await retrieveEscrowParameters({ ctx: ctx.l1, user: user });
		initialParametersL2 = await retrieveEscrowParameters({ ctx: ctx.l2, user: user });
		initialCollateralBalanceL1 = await Synthetix.collateral(user.address);
		initialLiquidBalanceL1 = await Synthetix.balanceOf(user.address);
		initialDebtShareBalanceL1 = await SynthetixDebtShare.balanceOf(user.address);
	});

	describe('when the user migrates their debt', () => {
		let migrateDebtReceipt;
		let userLiquidBalanceL2;
		let userCollateralBalanceL2;
		let userDebtShareBalanceL2;
		let rewardEscrowBalanceL2;

		before('record current values', async () => {
			userLiquidBalanceL2 = await Synthetix.balanceOf(user.address);
			userCollateralBalanceL2 = await Synthetix.collateral(user.address);
			userDebtShareBalanceL2 = await SynthetixDebtShare.balanceOf(user.address);
			rewardEscrowBalanceL2 = await Synthetix.balanceOf(RewardEscrowV2.address);
		});

		before('when initiation is active', async () => {
			await DebtMigratorOnEthereum.connect(owner).resumeInitiation();
		});

		before('migrateDebt()', async () => {
			DebtMigratorOnEthereum = DebtMigratorOnEthereum.connect(user);
			const tx = await DebtMigratorOnEthereum.migrateDebt(user.address);
			migrateDebtReceipt = await tx.wait();
			console.log(
				`migrateDebt() gas used: ${Math.round(migrateDebtReceipt.gasUsed / 1000).toString()}k`
			);
		});

		it('should update the L1 escrow state', async () => {
			postParametersL1 = await retrieveEscrowParameters({ ctx: ctx.l1, user: user });

			assert.bnEqual(
				postParametersL1.escrowedBalance,
				postParametersL1.escrowedBalance.sub(initialParametersL1.escrowedBalance)
			);
			assert.bnEqual(postParametersL1.userNumVestingEntries, 0);
			assert.bnEqual(postParametersL1.userEscrowedBalance, 0);
			assert.bnEqual(postParametersL1.userVestedAccountBalance, 0);
		});

		it('should update the L1 Synthetix state', async () => {
			assert.bnEqual(await Synthetix.collateral(user.address), 0);
			assert.bnEqual(await Synthetix.balanceOf(user.address), 0);
			assert.bnEqual(await SynthetixDebtShare.balanceOf(user.address), 0);
		});

		// --------------------------
		// Wait...
		// --------------------------

		describe('when the escrow gets picked up in L2', () => {
			before('listen for completion', async () => {
				await finalizationOnL2({
					ctx,
					transactionHash: migrateDebtReceipt.transactionHash,
				});
			});

			before('target contracts and users', () => {
				({ Synthetix, RewardEscrowV2, SynthetixDebtShare } = ctx.l2.contracts);
				user = ctx.l2.users.someUser;
			});

			it('should update the L2 escrow state', async () => {
				const postParametersL2 = await retrieveEscrowParameters({ ctx: ctx.l2, user: user });
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
				assert.bnEqual(
					await Synthetix.balanceOf(user.address),
					userLiquidBalanceL2.add(initialLiquidBalanceL1)
				);
				assert.bnEqual(
					await Synthetix.balanceOf(RewardEscrowV2.address),
					rewardEscrowBalanceL2.add(escrowEntriesData.totalEscrowed)
				);
				assert.bnEqual(
					await Synthetix.collateral(user.address),
					userCollateralBalanceL2.add(initialCollateralBalanceL1)
				);
				assert.bnEqual(
					await SynthetixDebtShare.balanceOf(user.address),
					userDebtShareBalanceL2.add(initialDebtShareBalanceL1)
				);
			});
		});
	});
});
