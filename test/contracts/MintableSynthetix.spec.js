const { contract, web3 } = require('hardhat');
const { assert } = require('./common');
const { setupAllContracts } = require('./setup');
const { toWei } = web3.utils;
const { toBytes32 } = require('../..');
const BN = require('bn.js');

const SYNTHETIX_TOTAL_SUPPLY = toWei('100000000');

contract('MintableSynthetix (spec tests)', accounts => {
	const [, owner, synthetixBridgeToBase, account1] = accounts;

	let mintableSynthetix;
	let addressResolver;
	let rewardsDistribution;
	let rewardEscrow;
	describe('when system is setup', () => {
		before('deploy a new instance', async () => {
			({
				Synthetix: mintableSynthetix, // we request Synthetix instead of MintableSynthetix because it is renamed in setup.js
				AddressResolver: addressResolver,
				RewardsDistribution: rewardsDistribution,
				RewardEscrowV2: rewardEscrow,
			} = await setupAllContracts({
				accounts,
				contracts: [
					'AddressResolver',
					'MintableSynthetix',
					'RewardsDistribution',
					'RewardEscrowV2',
				],
			}));
			// update resolver
			await addressResolver.importAddresses(
				[toBytes32('SynthetixBridgeToBase')],
				[synthetixBridgeToBase],
				{
					from: owner,
				}
			);
			// sync cache
			await mintableSynthetix.rebuildCache();
		});

		describe('mintSecondary()', async () => {
			let mintSecondaryTx;
			const amount = 100;
			before('when SynthetixBridgeToBase calls mintSecondary()', async () => {
				mintSecondaryTx = await mintableSynthetix.mintSecondary(account1, amount, {
					from: synthetixBridgeToBase,
				});
			});

			it('should tranfer the tokens to the right account', async () => {
				assert.equal(await mintableSynthetix.balanceOf(account1), amount);
			});

			it('should increase the total supply', async () => {
				const newSupply = new BN(SYNTHETIX_TOTAL_SUPPLY).add(new BN(amount));
				assert.bnEqual(await mintableSynthetix.totalSupply(), newSupply);
			});

			it('should emit a Transfer event', async () => {
				assert.eventEqual(mintSecondaryTx, 'Transfer', {
					from: mintableSynthetix.address,
					to: account1,
					value: amount,
				});
			});
		});

		describe('mintSecondaryRewards()', async () => {
			let mintSecondaryRewardsTx;
			const amount = 100;
			let currentSupply;
			before('record current supply', async () => {
				currentSupply = await mintableSynthetix.totalSupply();
			});

			before('when SynthetixBridgeToBase calls mintSecondaryRewards()', async () => {
				mintSecondaryRewardsTx = await mintableSynthetix.mintSecondaryRewards(amount, {
					from: synthetixBridgeToBase,
				});
			});

			it('should tranfer the tokens initially to RewardsDistribution which  transfers them to RewardEscrowV2 (no distributions)', async () => {
				assert.equal(await mintableSynthetix.balanceOf(rewardsDistribution.address), 0);
				assert.equal(await mintableSynthetix.balanceOf(rewardEscrow.address), amount);
			});

			it('should increase the total supply', async () => {
				const newSupply = currentSupply.add(new BN(amount));
				assert.bnEqual(await mintableSynthetix.totalSupply(), newSupply);
			});

			it('should emit a Transfer event', async () => {
				assert.eventEqual(mintSecondaryRewardsTx, 'Transfer', {
					from: mintableSynthetix.address,
					to: rewardsDistribution.address,
					value: amount,
				});
			});
		});

		describe('burnSecondary()', async () => {
			let burnSecondaryTx;
			const amount = 100;
			let currentSupply;
			before('record current supply', async () => {
				currentSupply = await mintableSynthetix.totalSupply();
			});

			before('when SynthetixBridgeToBase calls burnSecondary()', async () => {
				burnSecondaryTx = await mintableSynthetix.burnSecondary(account1, amount, {
					from: synthetixBridgeToBase,
				});
			});
			it('should tranfer the tokens to the right account', async () => {
				assert.equal(await mintableSynthetix.balanceOf(account1), 0);
			});

			it('should decrease the total supply', async () => {
				const newSupply = currentSupply.sub(new BN(amount));
				assert.bnEqual(await mintableSynthetix.totalSupply(), newSupply);
			});

			it('should emit a Transfer event', async () => {
				assert.eventEqual(burnSecondaryTx, 'Transfer', {
					from: account1,
					to: '0x0000000000000000000000000000000000000000',
					value: amount,
				});
			});
		});
	});
});
