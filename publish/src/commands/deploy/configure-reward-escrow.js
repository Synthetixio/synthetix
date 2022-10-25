'use strict';

const { gray } = require('chalk');

module.exports = async ({ addressOf, deployer, runStep }) => {
	console.log(gray(`\n------ CONFIGURE REWARD ESCROW V2 (MIGRATION) ------\n`));

	const { RewardEscrowV2, RewardsDistribution, RewardEscrowV2Storage } = deployer.deployedContracts;

	// set state ownership to the new escrow contract
	// this enables new contract to make storage writes
	await runStep({
		contract: 'RewardEscrowV2Storage',
		target: RewardEscrowV2Storage,
		read: 'associatedContract',
		expected: input => input === addressOf(RewardEscrowV2),
		write: 'setAssociatedContract',
		writeArg: addressOf(RewardEscrowV2),
		comment: 'Ensure that RewardEscrowV2 contract is allowed to write to RewardEscrowV2Storage',
	});

	// RewardEscrow on RewardsDistribution should be set to new RewardEscrowV2
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
