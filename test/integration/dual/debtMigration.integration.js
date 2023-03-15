const ethers = require('ethers');
const { toBytes32 } = require('../../../index');
const { appendEscrows, retrieveEscrowParameters } = require('../utils/escrow');
const { approveIfNeeded } = require('../utils/approve');
const { assert, addSnapshotBeforeRestoreAfterEach } = require('../../contracts/common');
const { bootstrapDual } = require('../utils/bootstrap');
const { ensureBalance } = require('../utils/balances');
const { finalizationOnL2 } = require('../utils/optimism');

const toUnit = v => ethers.utils.parseUnits(v.toString());
const unit = toUnit(1);
const multiplyDecimal = (a, b) => a.mul(b).div(unit);

describe('migrateDebt() integration tests (L1, L2)', () => {
	const ctx = this;
	bootstrapDual({ ctx });

	let tx;
	let owner, user;
	let AddressResolver,
		DebtMigratorOnEthereum,
		DebtMigratorOnOptimism,
		RewardEscrowV2,
		Synthetix,
		SynthetixDebtShare;

	let initialParametersL1,
		initialParametersL2,
		initialCollateralBalanceL1,
		initialLiquidBalanceL1,
		initialDebtShareBalanceL1,
		initialRewardEscrowBalanceL1;

	let userLiquidBalanceL2, userCollateralBalanceL2, userDebtShareBalanceL2, rewardEscrowBalanceL2;

	let postParametersL1 = {};
	let escrowEntriesData = {};
	const escrowNum = 26;
	const escrowBatches = 2;
	const numExtraEntries = 0;
	const SNXAmount = ethers.utils.parseEther('1000');
	const amountToIssue = ethers.utils.parseEther('100');

	addSnapshotBeforeRestoreAfterEach();

	before('target contracts and users', () => {
		({ DebtMigratorOnEthereum, RewardEscrowV2, Synthetix, SynthetixDebtShare } = ctx.l1.contracts);
		({ DebtMigratorOnOptimism } = ctx.l2.contracts);
		user = ctx.l1.users.someUser;
		owner = ctx.l1.users.owner;
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

	before('record balances on L1', async () => {
		initialParametersL1 = await retrieveEscrowParameters({ ctx: ctx.l1, user: user });
		initialParametersL2 = await retrieveEscrowParameters({ ctx: ctx.l2, user: user });
		initialCollateralBalanceL1 = await Synthetix.collateral(user.address);
		initialLiquidBalanceL1 = await Synthetix.balanceOf(user.address);
		initialDebtShareBalanceL1 = await SynthetixDebtShare.balanceOf(user.address);
		initialRewardEscrowBalanceL1 = await RewardEscrowV2.balanceOf(user.address);
	});

	before('record balances on L2', async () => {
		({ RewardEscrowV2, Synthetix, SynthetixDebtShare } = ctx.l2.contracts);

		userLiquidBalanceL2 = await Synthetix.balanceOf(user.address);
		userCollateralBalanceL2 = await Synthetix.collateral(user.address);
		userDebtShareBalanceL2 = await SynthetixDebtShare.balanceOf(user.address);
		rewardEscrowBalanceL2 = await Synthetix.balanceOf(RewardEscrowV2.address);
	});

	before('ensure the migrator is connected on L1', async () => {
		// Configure L1.
		({ AddressResolver } = ctx.l1.contracts);
		AddressResolver = AddressResolver.connect(owner);
		tx = await AddressResolver.importAddresses(
			[toBytes32('ovm:DebtMigratorOnOptimism')],
			[DebtMigratorOnOptimism.address]
		);
		await tx.wait();
	});

	before('ensure the migrator is connected on L2', async () => {
		// Configure L2.
		({ AddressResolver } = ctx.l2.contracts);
		AddressResolver = AddressResolver.connect(ctx.l2.users.owner);
		tx = await AddressResolver.importAddresses(
			[toBytes32('base:DebtMigratorOnEthereum')],
			[DebtMigratorOnEthereum.address]
		);
		await tx.wait();
	});

	before('rebuild L1 migrator cache', async () => {
		tx = await DebtMigratorOnEthereum.connect(owner).rebuildCache();
		await tx.wait();
	});

	before('rebuild L2 migrator cache', async () => {
		tx = await DebtMigratorOnOptimism.connect(ctx.l2.users.owner).rebuildCache();
		await tx.wait();
	});

	describe('when a user migrates their debt', () => {
		let migrateDebtReceipt;

		before('when initiation is active', async () => {
			await DebtMigratorOnEthereum.connect(owner).resumeInitiation();
		});

		before('invoke migrateDebt()', async () => {
			DebtMigratorOnEthereum = DebtMigratorOnEthereum.connect(user);
			const tx = await DebtMigratorOnEthereum.migrateDebt(user.address);
			migrateDebtReceipt = await tx.wait();
			console.log(
				`migrateDebt() gas used: ${Math.round(migrateDebtReceipt.gasUsed / 1000).toString()}k`
			);
		});

		it('should update the L1 escrow state', async () => {
			postParametersL1 = await retrieveEscrowParameters({ ctx: ctx.l1, user: user });

			// zeroes out the user's escrow states on L1
			assert.bnEqual(
				postParametersL1.escrowedBalance,
				initialParametersL1.escrowedBalance.sub(initialParametersL1.userEscrowedBalance)
			);
			assert.bnEqual(
				postParametersL1.userEscrowedBalance,
				initialParametersL1.userEscrowedBalance.sub(initialParametersL1.userEscrowedBalance)
			);
			assert.bnEqual(
				postParametersL1.userVestedAccountBalance,
				initialParametersL1.userVestedAccountBalance.sub(
					initialParametersL1.userVestedAccountBalance
				)
			);
		});

		it('should update the L1 Synthetix state', async () => {
			({ Synthetix, SynthetixDebtShare, RewardEscrowV2 } = ctx.l1.contracts);

			assert.bnEqual(await Synthetix.collateral(user.address), 0);
			assert.bnEqual(await Synthetix.balanceOf(user.address), 0);
			assert.bnEqual(await SynthetixDebtShare.balanceOf(user.address), 0);
			assert.bnEqual(await RewardEscrowV2.balanceOf(user.address), 0);
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
				({ RewardEscrowV2, Synthetix, SynthetixDebtShare } = ctx.l2.contracts);
				user = ctx.l2.users.someUser;
			});

			it('should update the L2 escrow state', async () => {
				const numEntries = 10;
				const postParametersL2 = await retrieveEscrowParameters({ ctx: ctx.l2, user: user });
				assert.bnEqual(postParametersL2.userNumVestingEntries, numEntries); // creates ten entries on L2 totaling the full escrow amount
				assert.bnEqual(
					(await RewardEscrowV2.getVestingSchedules(user.address, 0, 1))[0].escrowAmount, // first entry
					multiplyDecimal(escrowEntriesData.totalEscrowed, toUnit('0.1'))
				);
				assert.bnEqual(
					(await RewardEscrowV2.getVestingSchedules(user.address, 8, 1))[0].escrowAmount, // ninth entry
					multiplyDecimal(escrowEntriesData.totalEscrowed, toUnit('0.1'))
				);
				// get the sum of the first nine entries
				let sumOfEntries = ethers.constants.Zero;
				for (let i = 0; i < numEntries - 1; i++) {
					const escrowAmount = (await RewardEscrowV2.getVestingSchedules(user.address, i, 1))[0]
						.escrowAmount;
					sumOfEntries = sumOfEntries.add(escrowAmount);
				}
				assert.bnEqual(
					(await RewardEscrowV2.getVestingSchedules(user.address, 9, 1))[0].escrowAmount, // tenth (last) entry should have the remaining amount
					escrowEntriesData.totalEscrowed.sub(sumOfEntries)
				);
				assert.bnEqual(await RewardEscrowV2.balanceOf(user.address), initialRewardEscrowBalanceL1);
				assert.bnEqual(
					postParametersL2.escrowedBalance,
					initialParametersL2.escrowedBalance.add(escrowEntriesData.totalEscrowed)
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
