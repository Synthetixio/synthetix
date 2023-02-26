const { contract } = require('hardhat');
const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { assert } = require('./common');
const { setupAllContracts } = require('./setup');

contract('DebtMigratorOnOptimism', accounts => {
	const owner = accounts[1];
	const user = accounts[2];
	const mockedPayloadData = '0xdeadbeef';

	let debtMigratorOnOptimism, synths;

	before(async () => {
		synths = ['sUSD', 'sAUD', 'sEUR', 'sETH'];
		({ DebtMigratorOnOptimism: debtMigratorOnOptimism } = await setupAllContracts({
			accounts,
			synths,
			contracts: [
				'AddressResolver',
				'DebtMigratorOnOptimism',
				'Issuer',
				'RewardEscrowV2',
				'Synthetix',
				'SystemSettings',
			],
		}));
	});

	it('ensure only expected functions are mutative', async () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: debtMigratorOnOptimism.abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: ['finalizeDebtMigration'],
		});
	});

	describe('Constructor & Settings', () => {
		it('should set owner on constructor', async () => {
			const ownerAddress = await debtMigratorOnOptimism.owner();
			assert.equal(ownerAddress, owner);
		});
	});

	describe('when attempting to finalize a migration from an account that is not the Optimism Messenger', () => {
		it('reverts with the expected error', async () => {
			await assert.revert(
				debtMigratorOnOptimism.finalizeDebtMigration(
					user, // Any address
					mockedPayloadData, // Any data
					mockedPayloadData, // Any data
					{ from: owner }
				),
				'Sender is not the messenger'
			);
		});
	});
});
