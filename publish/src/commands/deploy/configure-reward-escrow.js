'use strict';

const { gray } = require('chalk');
const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../../../..');

module.exports = async ({ addressOf, deployer, runStep }) => {
	console.log(gray(`\n------ CONFIGURE REWARD ESCROW V2 (MIGRATION) ------\n`));

	const {
		AddressResolver,
		RewardEscrowV2,
		RewardsDistribution,
		Synthetix,
		RewardEscrowV2Storage,
		RewardEscrowV2Frozen,
	} = deployer.deployedContracts;

	// SIP-252 rewards escrow migration
	// get either previous address, or newly deployed address (for integration tests)
	const frozenOrPreviousEscrow =
		RewardEscrowV2Frozen || (await deployer.getExistingContract({ contract: 'RewardEscrowV2' }));

	// set state ownership to the rew escrow contract
	await runStep({
		contract: 'RewardEscrowV2Storage',
		target: RewardEscrowV2Storage,
		read: 'associatedContract',
		expected: input => input === addressOf(RewardEscrowV2),
		write: 'setAssociatedContract',
		writeArg: addressOf(RewardEscrowV2),
		comment: 'Ensure that RewardEscrowV2 contract is allowed to write to RewardEscrowV2Storage',
	});

	// set the fallback (frozne) for storage contract
	// this can only happen once, as this contract is immutable
	// TODO: after release add to non-upgradable.json
	await runStep({
		contract: 'RewardEscrowV2Storage',
		target: RewardEscrowV2Storage,
		read: 'fallbackRewardEscrow',
		expected: input => input !== ZERO_ADDRESS, // only configure if not configured
		write: 'setFallbackRewardEscrow',
		writeArg: addressOf(frozenOrPreviousEscrow),
		comment:
			'Ensure that RewardEscrowV2Storage contract is initialized with address of RewardEscrowV2Frozen',
	});

	// close account merging on previous contract
	await runStep({
		contract: 'RewardEscrowV2Frozen',
		target: frozenOrPreviousEscrow,
		read: 'accountMergingDuration',
		expected: input => input === 0,
		write: 'setAccountMergingDuration',
		writeArg: 0,
		comment: 'Ensure that RewardEscrowV2Frozen account merging is closed',
	});

	// set frozen address entry for migrating balances
	await runStep({
		contract: 'AddressResolver',
		target: AddressResolver,
		read: 'getAddress',
		readArg: [toBytes32('RewardEscrowV2Frozen')],
		expected: input => input === addressOf(frozenOrPreviousEscrow),
		write: 'importAddresses',
		writeArg: [[toBytes32('RewardEscrowV2Frozen')], [addressOf(frozenOrPreviousEscrow)]],
		comment: 'Ensure that RewardEscrowV2Frozen is in the address resolver',
	});

	// move SNX balances
	await runStep({
		contract: 'Synthetix',
		target: Synthetix,
		write: 'migrateEscrowContractBalance',
		comment: 'Ensure that old escrow SNX balance is migrated to new contract',
	});

	// RewardEscrow on RewardsDistribution should be set to new RewardEscrowV2
	// this is also ensured in configure-legacy-settings, but here again for completeness
	await runStep({
		contract: 'RewardsDistribution',
		target: RewardsDistribution,
		read: 'rewardEscrow',
		expected: input => input === addressOf(RewardEscrowV2),
		write: 'setRewardEscrow',
		writeArg: addressOf(RewardEscrowV2),
		comment: 'Ensure the RewardsDistribution can read the RewardEscrowV2 address',
	});
};
