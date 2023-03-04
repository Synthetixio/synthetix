const { contract } = require('hardhat');
const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { assert } = require('./common');
const { setupAllContracts } = require('./setup');
const { toUnit } = require('../utils')();
const { toBytes32 } = require('../..');

contract('DebtMigratorOnEthereum', accounts => {
	const owner = accounts[1];
	const user = accounts[2];

	let debtMigratorOnEthereum,
		resolver,
		rewardEscrowV2,
		synths,
		synthetix,
		synthetixDebtShare,
		systemStatus;

	before(async () => {
		synths = ['sUSD', 'sAUD', 'sEUR', 'sETH'];
		({
			AddressResolver: resolver,
			DebtMigratorOnEthereum: debtMigratorOnEthereum,
			RewardEscrowV2: rewardEscrowV2,
			Synthetix: synthetix,
			SynthetixDebtShare: synthetixDebtShare,
			SystemStatus: systemStatus,
		} = await setupAllContracts({
			accounts,
			synths,
			contracts: [
				'AddressResolver',
				'DebtMigratorOnEthereum',
				'Issuer',
				'Liquidator',
				'LiquidatorRewards',
				'RewardEscrowV2',
				'Synthetix',
				'SynthetixBridgeToOptimism',
				'SynthetixDebtShare',
				'SystemSettings',
				'SystemStatus',
			],
		}));
	});

	it('ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: debtMigratorOnEthereum.abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: ['migrateDebt'],
		});
	});

	describe('Constructor & Settings', () => {
		it('should set owner on constructor', async () => {
			const ownerAddress = await debtMigratorOnEthereum.owner();
			assert.equal(ownerAddress, owner);
		});
		it('should set resolver on constructor', async () => {
			const resolverAddress = await debtMigratorOnEthereum.resolver();
			assert.equal(resolverAddress, resolver.address);
		});
	});

	describe('when migrating debt', () => {
		let migrateTx;
		let liquidSNXBalance, escrowedSNXBalance, debtShareBalance;
		const amountToIssue = toUnit('100');
		const entryAmount = toUnit('1');

		before('issue some debt', async () => {
			await synthetix.issueSynths(amountToIssue, { from: owner });
		});

		before('create an escrow entries', async () => {
			// allow owner to write to create entries
			await resolver.importAddresses(['FeePool', 'Depot'].map(toBytes32), [owner, owner], {
				from: owner,
			});
			await rewardEscrowV2.rebuildCache();
			await synthetix.transfer(rewardEscrowV2.address, entryAmount, { from: owner });
			await rewardEscrowV2.appendVestingEntry(owner, entryAmount, 1, { from: owner });
		});

		before('record balances', async () => {
			liquidSNXBalance = await synthetix.balanceOf(owner);
			escrowedSNXBalance = await rewardEscrowV2.balanceOf(owner);
			debtShareBalance = await synthetixDebtShare.balanceOf(owner);
		});

		describe('revert cases', () => {
			it('cannot migrate on behalf of another account', async () => {
				await assert.revert(
					debtMigratorOnEthereum.migrateDebt(owner, { from: user }),
					'Must be the account owner'
				);
			});

			it('cannot migrate if the system is suspended', async () => {
				await systemStatus.suspendSystem(1, { from: owner });
				await assert.revert(debtMigratorOnEthereum.migrateDebt(owner, { from: user }));
			});
		});

		describe('migrateDebt()', () => {
			before('resume and initiate the migration', async () => {
				await systemStatus.resumeSystem({ from: owner });
				migrateTx = await debtMigratorOnEthereum.migrateDebt(owner, { from: owner });
			});

			it('zeroes the balances on L1', async () => {
				assert.bnEqual(await synthetix.collateral(owner), 0);
				assert.bnEqual(await synthetix.balanceOf(owner), 0);
				assert.bnEqual(await rewardEscrowV2.balanceOf(owner), 0);
				assert.bnEqual(await synthetixDebtShare.balanceOf(owner), 0);
			});

			it('emits a MigrationInitiated event', async () => {
				const migrateEvent = migrateTx.logs[0];
				assert.eventEqual(migrateEvent, 'MigrationInitiated', {
					account: owner,
					totalDebtSharesMigrated: debtShareBalance,
					totalEscrowMigrated: escrowedSNXBalance,
					totalLiquidBalanceMigrated: liquidSNXBalance,
				});
			});
		});
	});
});
