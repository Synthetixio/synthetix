'use strict';

const { artifacts, contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const RewardsDistribution = artifacts.require('RewardsDistribution');
const MockRewardsRecipient = artifacts.require('MockRewardsRecipient');

const { toUnit } = require('../utils')();

const {
	constants: { ZERO_ADDRESS },
} = require('../..');

const { setupAllContracts } = require('./setup');

contract('RewardsDistribution', async accounts => {
	const [
		deployerAccount,
		owner,
		authorityAddress,
		rewardEscrowAddress,
		account1,
		account2,
		account3,
		account4,
		account5,
	] = accounts;

	let rewardsDistribution, synthetix, feePool, mockRewardsRecipient;

	before(async () => {
		({
			RewardsDistribution: rewardsDistribution,
			FeePool: feePool,
			Synthetix: synthetix,
		} = await setupAllContracts({
			accounts,
			contracts: ['RewardsDistribution', 'Synthetix', 'FeePool', 'Issuer'],
		}));

		mockRewardsRecipient = await MockRewardsRecipient.new(owner, { from: owner });
		await mockRewardsRecipient.setRewardsDistribution(rewardsDistribution.address, { from: owner });
	});

	addSnapshotBeforeRestoreAfterEach();

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
		it('should revert when non contract owner attempts to add a RewardDistribution', async () => {
			const distributionAddress = account1;
			const amountToDistribute = toUnit('5000');

			await assert.revert(
				rewardsDistribution.addRewardDistribution(distributionAddress, amountToDistribute)
			);
		});
		it('should revert when adding a RewardDistribution with zero address', async () => {
			const distributionAddress = ZERO_ADDRESS;
			const amountToDistribute = toUnit('5000');

			await assert.revert(
				rewardsDistribution.addRewardDistribution(distributionAddress, amountToDistribute, {
					from: owner,
				})
			);
		});
		it('should revert when adding a RewardDistribution with zero amount', async () => {
			const distributionAddress = account1;
			const amountToDistribute = toUnit('0');

			await assert.revert(
				rewardsDistribution.addRewardDistribution(distributionAddress, amountToDistribute, {
					from: owner,
				})
			);
		});
		it('should emit event and store onchain when adding a RewardDistribution', async () => {
			const distributionAddress = account1;
			const amountToDistribute = toUnit('5000');

			const result = await rewardsDistribution.addRewardDistribution(
				distributionAddress,
				amountToDistribute,
				{
					from: owner,
				}
			);

			// Check the event
			assert.eventEqual(result, 'RewardDistributionAdded', { index: 0 });

			// Validate the onchain data
			const distributionData = await rewardsDistribution.distributions(0);
			assert.equal(distributionData[0], account1);
			assert.bnEqual(distributionData[1], amountToDistribute);
		});

		it('should add multiple reward distributions onchain', async () => {
			const addresses = [account1, account2, account3, account4, account5];
			const amounts = [
				toUnit('1111'),
				toUnit('2222'),
				toUnit('3333'),
				toUnit('4444'),
				toUnit('5555'),
			];

			for (let i = 0; i < addresses.length; i++) {
				const result = await rewardsDistribution.addRewardDistribution(addresses[i], amounts[i], {
					from: owner,
				});

				// Check the event
				assert.eventEqual(result, 'RewardDistributionAdded', { index: i });

				// Validate the onchain data
				const distributionData = await rewardsDistribution.distributions(i);
				assert.equal(distributionData[0], addresses[i]);
				assert.bnEqual(distributionData[1], amounts[i]);
			}
		});
	});

	describe('editing Reward Distributions', async () => {
		beforeEach(async () => {
			const distributionAddress = account1;
			const amountToDistribute = toUnit('5000');

			await rewardsDistribution.addRewardDistribution(distributionAddress, amountToDistribute, {
				from: owner,
			});

			const distributionsLength = await rewardsDistribution.distributionsLength();
			assert.equal(distributionsLength, 1);
		});
		it('should modify onchain struct when editing a valid RewardDistribution index', async () => {
			const distributionAddress = account2;
			const amountToDistribute = toUnit('4444');

			await rewardsDistribution.editRewardDistribution(0, distributionAddress, amountToDistribute, {
				from: owner,
			});

			const distributionData = await rewardsDistribution.distributions(0);
			assert.equal(distributionData[0], distributionAddress);
			assert.bnEqual(distributionData[1], amountToDistribute);
		});
		it('should revert when editing an index too high', async () => {
			const distributionAddress = account2;
			const amountToDistribute = toUnit('4444');

			await assert.revert(
				rewardsDistribution.editRewardDistribution(1, distributionAddress, amountToDistribute, {
					from: owner,
				})
			);
		});
	});

	describe('deleting Reward Distributions', async () => {
		const distributionAddress = account1;
		const distributionAddressTwo = account2;
		const distributionAddressThree = account3;
		const amountToDistribute = toUnit('5000');
		const amountToDistributeTwo = toUnit('1000');
		const amountToDistributeThree = toUnit('8000');

		beforeEach(async () => {
			await rewardsDistribution.addRewardDistribution(distributionAddress, amountToDistribute, {
				from: owner,
			});
			await rewardsDistribution.addRewardDistribution(
				distributionAddressTwo,
				amountToDistributeTwo,
				{
					from: owner,
				}
			);
		});
		it('should update distributions array when owner deletes a RewardDistribution', async () => {
			await rewardsDistribution.removeRewardDistribution(0, {
				from: owner,
			});

			// distribution address should be account2
			// amountToDistributeTwo should be in place of amountToDistribute
			const distributionData = await rewardsDistribution.distributions(0);
			assert.equal(distributionData[0], distributionAddressTwo);
			assert.bnEqual(distributionData[1], amountToDistributeTwo);
		});
		it('should update distributions array when owner deletes a RewardDistribution at index 1', async () => {
			// add extra distribution to array
			await rewardsDistribution.addRewardDistribution(
				distributionAddressThree,
				amountToDistributeThree,
				{
					from: owner,
				}
			);

			await rewardsDistribution.removeRewardDistribution(1, {
				from: owner,
			});

			// distribution[1].address should now be account3
			// distribution[1].amount should be amountToDistributeThree
			let distributionData = await rewardsDistribution.distributions(1);
			assert.equal(distributionData[0], distributionAddressThree);
			assert.bnEqual(distributionData[1], amountToDistributeThree);

			// distribution[0].address should now be account1
			// distribution[0].amount should be amountToDistribute
			distributionData = await rewardsDistribution.distributions(0);
			assert.equal(distributionData[0], distributionAddress);
			assert.bnEqual(distributionData[1], amountToDistribute);
		});
		it('should revert when non owner attempts to delete a RewardDistribution', async () => {
			await assert.revert(
				rewardsDistribution.removeRewardDistribution(0, {
					from: account1,
				})
			);
		});
	});

	describe('when the authority is distributing rewards', async () => {
		beforeEach(async () => {
			const distributionAddress = account1;
			const amountToDistribute = toUnit('5000');

			// Add 1 distribution
			await rewardsDistribution.addRewardDistribution(distributionAddress, amountToDistribute, {
				from: owner,
			});

			// Set the authority to call distribute
			await rewardsDistribution.setAuthority(authorityAddress, {
				from: owner,
			});

			// Set the RewardEscrow Address
			await rewardsDistribution.setRewardEscrow(rewardEscrowAddress, {
				from: owner,
			});

			// Set the SNX Token Transfer Address
			await rewardsDistribution.setSynthetixProxy(synthetix.address, {
				from: owner,
			});

			// Set the FeePool Address
			await rewardsDistribution.setFeePoolProxy(feePool.address, {
				from: owner,
			});
		});
		it('should revert when non authority attempts to distributeRewards()', async () => {
			await assert.revert(
				rewardsDistribution.distributeRewards(toUnit('5000'), {
					from: account1,
				})
			);
		});
		it('should revert when amount to distribute is zero', async () => {
			await assert.revert(
				rewardsDistribution.distributeRewards(toUnit('0'), {
					from: authorityAddress,
				})
			);
		});
		it('should revert when contract does not have the token balance to distribute', async () => {
			await assert.revert(
				rewardsDistribution.distributeRewards(toUnit('5000'), {
					from: authorityAddress,
				})
			);
		});
		it('should send the correct amount of tokens to the listed addresses', async () => {
			const totalToDistribute = toUnit('35000');
			// Account 1 should get 5000
			// Account 2 should get 10000
			await rewardsDistribution.addRewardDistribution(account2, toUnit('10000'), {
				from: owner,
			});

			const distributionsLength = await rewardsDistribution.distributionsLength();
			assert.equal(distributionsLength, 2);

			// RewardEscrow should get 20000

			// Ensure Authority to call is set
			const authorityAddress = await rewardsDistribution.authority();
			assert.equal(authorityAddress, authorityAddress);

			// Transfer SNX to the RewardsDistribution contract address
			await synthetix.transfer(rewardsDistribution.address, totalToDistribute);

			// Check RewardsDistribution balance
			const balanceOfRewardsContract = await synthetix.balanceOf(rewardsDistribution.address);
			assert.bnEqual(balanceOfRewardsContract, totalToDistribute);

			// Distribute Rewards called from Synthetix contract as the authority to distribute
			const transaction = await rewardsDistribution.distributeRewards(totalToDistribute, {
				from: authorityAddress,
			});

			// Check event
			assert.eventEqual(transaction, 'RewardsDistributed', { amount: totalToDistribute });

			// Check Account 1 balance
			const balanceOfAccount1 = await synthetix.balanceOf(account1);
			assert.bnEqual(balanceOfAccount1, toUnit('5000'));

			// Check Account 2 balance
			const balanceOfAccount2 = await synthetix.balanceOf(account2);
			assert.bnEqual(balanceOfAccount2, toUnit('10000'));

			// Check Reward Escrow balance
			const balanceOfRewardEscrow = await synthetix.balanceOf(rewardEscrowAddress);
			assert.bnEqual(balanceOfRewardEscrow, toUnit('20000'));

			// Check FeePool has rewards to distribute
			const recentPeriod = await feePool.recentFeePeriods(0);
			assert.bnEqual(recentPeriod.rewardsToDistribute, toUnit('20000'));
		});

		it('should call the notifyRewardAmount on mockRewardsRecipient', async () => {
			const totalToDistribute = toUnit('35000');
			// Account 1 should get 5000
			// mockRewardsRecipient should get 10000
			await rewardsDistribution.addRewardDistribution(
				mockRewardsRecipient.address,
				toUnit('10000'),
				{
					from: owner,
				}
			);

			const distributionsLength = await rewardsDistribution.distributionsLength();
			assert.equal(distributionsLength, 2);

			// Transfer SNX to the RewardsDistribution contract address
			await synthetix.transfer(rewardsDistribution.address, totalToDistribute, { from: owner });

			// Check RewardsDistribution balance
			const balanceOfRewardsContract = await synthetix.balanceOf(rewardsDistribution.address);
			assert.bnEqual(balanceOfRewardsContract, totalToDistribute);

			// Distribute Rewards called from Synthetix contract as the authority to distribute
			const transaction = await rewardsDistribution.distributeRewards(totalToDistribute, {
				from: authorityAddress,
			});

			// Check event
			assert.eventEqual(transaction, 'RewardsDistributed', { amount: totalToDistribute });

			// const rewardAddedEvent = transaction.logs.find(log => log.event === 'RewardAdded');

			// assert.eventEqual(rewardAddedEvent, 'RewardAdded', {
			// 	amount: toUnit('10000'),
			// });

			// Check Account 1 balance
			const balanceOfAccount1 = await synthetix.balanceOf(account1);
			assert.bnEqual(balanceOfAccount1, toUnit('5000'));

			// Check Account 2 balance
			const balanceOfMockRewardsRecipient = await synthetix.balanceOf(mockRewardsRecipient.address);
			assert.bnEqual(balanceOfMockRewardsRecipient, toUnit('10000'));

			// Check Account 2 balance
			const rewardsAvailable = await mockRewardsRecipient.rewardsAvailable();
			assert.bnEqual(rewardsAvailable, toUnit('10000'));
		});
	});
});
