const RewardsDistribution = artifacts.require('RewardsDistribution');

contract.only('RewardsDistribution', async accounts => {
	const [deployerAccount, owner, account1, account2, account3, account4, account5] = accounts;

	let rewardsDistribution;

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		rewardsDistribution = await RewardsDistribution.deployed();
	});

	it('should set constructor params on deployment', async () => {
		const instance = await RewardsDistribution.new(
			account1,
			account2,
			account3,
			account4,
			account5,
			{
				from: deployerAccount,
			}
		);

		assert.equal(await instance.owner(), account1);
		assert.equal(await instance.authority(), account2);
		assert.equal(await instance.synthetixProxy(), account3);
		assert.equal(await instance.rewardEscrow(), account4);
		assert.equal(await instance.feePoolProxy(), account5);
	});

	describe('adding Reward Distributions', async () => {
		it('should return true when adding a RewardDistribution');
		it('should revert when adding a RewardDistribution with zero address');
		it('should revert when adding a RewardDistribution with zero amount');
	});

	describe('editing Reward Distributions', async () => {
		it('should return true when editing a valid RewardDistribution');
		it('should revert when editing an index too high');
	});

	describe('deleting Reward Distributions', async () => {
		it('should update distributions array when owner deletes a RewardDistribution');
		it('should revert when non owner attempts to delete a RewardDistribution');
	});

	describe('when the authority is distributing rewards', async () => {
		it('should revert when non authority attempts to distributeRewards()');
		it('should revert when amount to distribute is zero');
		it('should revert when contract does not have the token balance to distribute');
		it('should send the correct amount of tokens to the listed addresses');
		it('should send the correct amount of remaining tokens to the RewardEscrow');
	});
});
