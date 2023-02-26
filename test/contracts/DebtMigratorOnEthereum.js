const { contract } = require('hardhat');
const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { assert } = require('./common');
const { setupAllContracts } = require('./setup');
const { toUnit } = require('../utils')();

contract('DebtMigratorOnEthereum', accounts => {
	const owner = accounts[1];
	// const user = accounts[2];
	const oneWeek = 60 * 60 * 24 * 7;
	const twentySixWeeks = oneWeek * 26;

	let debtMigratorOnEthereum, synths;

	before(async () => {
		synths = ['sUSD', 'sAUD', 'sEUR', 'sETH'];
		({ DebtMigratorOnEthereum: debtMigratorOnEthereum } = await setupAllContracts({
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
});
