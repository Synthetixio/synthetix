const { contract } = require('hardhat');
const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { assert } = require('./common');
const { setupAllContracts } = require('./setup');
const { toUnit } = require('../utils')();
const { toBytes32 } = require('../..');

contract('DebtMigratorOnEthereum', accounts => {
	const owner = accounts[1];
	// const user = accounts[2];
	const oneWeek = 60 * 60 * 24 * 7;
	const twentySixWeeks = oneWeek * 26;

	let debtMigratorOnEthereum, resolver, rewardEscrowV2, synths, synthetix, synthetixDebtShare;

	before(async () => {
		synths = ['sUSD', 'sAUD', 'sEUR', 'sETH'];
		({
			AddressResolver: resolver,
			DebtMigratorOnEthereum: debtMigratorOnEthereum,
			RewardEscrowV2: rewardEscrowV2,
			Synthetix: synthetix,
			SynthetixDebtShare: synthetixDebtShare,
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
			expected: ['migrateDebt', 'setEscrowMigrationDuration'],
		});
	});

	describe('Constructor & Settings', () => {
		it('should set owner on constructor', async () => {
			const ownerAddress = await debtMigratorOnEthereum.owner();
			assert.equal(ownerAddress, owner);
		});
		it('escrow migration duration should be the default value', async () => {
			const escrowMigrationDuration = await debtMigratorOnEthereum.escrowMigrationDuration();
			assert.bnEqual(escrowMigrationDuration, twentySixWeeks);
		});
	});

	describe('Function permissions', () => {
		const newDuration = toUnit('100');

		it('only owner can call setEscrowMigrationDuration', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: debtMigratorOnEthereum.setEscrowMigrationDuration,
				accounts,
				args: [newDuration],
				address: owner,
				skipPassCheck: true,
				reason: 'Only the contract owner may perform this action',
			});
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

		before('initiate the migration', async () => {
			migrateTx = await debtMigratorOnEthereum.migrateDebt(owner, { from: owner });
		});

		it('zeroes the balances on L1', async () => {
			assert.equal(await synthetix.collateral(owner), 0);
			assert.equal(await synthetix.balanceOf(owner), 0);
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
