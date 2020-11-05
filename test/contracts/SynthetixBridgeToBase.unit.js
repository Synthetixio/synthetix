const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { assert } = require('./common');
const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const { toBytes32 } = require('../..');
const { smockit } = require('@eth-optimism/smock');

const SynthetixBridgeToBase = artifacts.require('SynthetixBridgeToBase');

contract('SynthetixBridgeToBase (unit tests)', accounts => {
	const [owner, user1, snxBridgeToOptimism, smockedMessenger, randomAddress] = accounts;

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: SynthetixBridgeToBase.abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: [
				'initiateWithdrawal',
				'mintSecondaryFromDeposit',
				'mintSecondaryFromDepositForRewards',
				'importVestingEntries',
			],
		});
	});

	const getDataOfEncodedFncCall = ({ fnc, args = [] }) =>
		web3.eth.abi.encodeFunctionCall(
			artifacts.require('SynthetixBridgeToOptimism').abi.find(({ name }) => name === fnc),
			args
		);

	describe('when all the deps are (s)mocked', () => {
		let messenger;
		let mintableSynthetix;
		let resolver;
		let rewardEscrow;
		beforeEach(async () => {
			messenger = await smockit(artifacts.require('iOVM_BaseCrossDomainMessenger').abi, {
				address: smockedMessenger,
			});

			rewardEscrow = await smockit(artifacts.require('IRewardEscrowV2').abi);

			mintableSynthetix = await smockit(artifacts.require('MintableSynthetix').abi);

			// now add to address resolver
			resolver = await artifacts.require('AddressResolver').new(owner);
			await resolver.importAddresses(
				['ext:Messenger', 'Synthetix', 'base:SynthetixBridgeToOptimism', 'RewardEscrowV2'].map(
					toBytes32
				),
				[messenger.address, mintableSynthetix.address, snxBridgeToOptimism, rewardEscrow.address],
				{ from: owner }
			);
		});

		beforeEach(async () => {
			// stubs
			mintableSynthetix.smocked.burnSecondary.will.return.with(() => {});
			mintableSynthetix.smocked.mintSecondary.will.return.with(() => {});
			mintableSynthetix.smocked.balanceOf.will.return.with(() => web3.utils.toWei('1'));
			messenger.smocked.sendMessage.will.return.with(() => {});
			messenger.smocked.xDomainMessageSender.will.return.with(() => snxBridgeToOptimism);
			rewardEscrow.smocked.importVestingEntries.will.return.with(() => {});
		});

		describe('when the target is deployed', () => {
			let instance;
			beforeEach(async () => {
				instance = await artifacts.require('SynthetixBridgeToBase').new(owner, resolver.address);
				await instance.setResolverAndSyncCache(resolver.address, { from: owner });
			});

			describe('importVestingEntries', async () => {
				const zeroArray = [];
				for (let i = 0; i < 52; i++) {
					zeroArray.push(0);
				}

				describe('failure modes', () => {
					it('should only allow the relayer (aka messenger) to call importVestingEntries()', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: instance.importVestingEntries,
							args: [user1, zeroArray, zeroArray],
							accounts,
							address: smockedMessenger,
							reason: 'Only the relayer can call this',
						});
					});

					it('should only allow the L1 bridge to invoke importVestingEntries() via the messenger', async () => {
						// 'smock' the messenger to return a random msg sender
						messenger.smocked.xDomainMessageSender.will.return.with(() => randomAddress);
						await assert.revert(
							instance.importVestingEntries(user1, zeroArray, zeroArray, {
								from: smockedMessenger,
							}),
							'Only the L1 bridge can invoke'
						);
					});
				});

				describe('when invoked by the messenger (aka relayer)', async () => {
					let importVestingEntriesTx;
					beforeEach('importVestingEntries is called', async () => {
						importVestingEntriesTx = await instance.importVestingEntries(
							user1,
							zeroArray,
							zeroArray,
							{
								from: smockedMessenger,
							}
						);
					});

					it('should emit a ImportedVestingEntries event', async () => {
						assert.eventEqual(importVestingEntriesTx, 'ImportedVestingEntries', {
							account: user1,
						});
					});
				});
			});

			describe('initiateWithdrawal', () => {
				describe('when invoked by a user', () => {
					let withdrawalTx;
					const amount = 100;
					const gasLimit = 3e6;
					beforeEach('user tries to withdraw 100 tokens', async () => {
						withdrawalTx = await instance.initiateWithdrawal(amount, { from: user1 });
					});

					it('then SNX is burned via mintableSyntetix.burnSecondary', async () => {
						assert.equal(mintableSynthetix.smocked.burnSecondary.calls.length, 1);
						assert.equal(mintableSynthetix.smocked.burnSecondary.calls[0][0], user1);
						assert.equal(mintableSynthetix.smocked.burnSecondary.calls[0][1].toString(), amount);
					});

					it('the message is relayed', async () => {
						assert.equal(messenger.smocked.sendMessage.calls.length, 1);
						assert.equal(messenger.smocked.sendMessage.calls[0][0], snxBridgeToOptimism);
						const expectedData = getDataOfEncodedFncCall({
							fnc: 'completeWithdrawal',
							args: [user1, amount],
						});

						assert.equal(messenger.smocked.sendMessage.calls[0][1], expectedData);
						assert.equal(messenger.smocked.sendMessage.calls[0][2], gasLimit.toString());
					});

					it('and a WithdrawalInitiated event is emitted', async () => {
						assert.eventEqual(withdrawalTx, 'WithdrawalInitiated', {
							account: user1,
							amount: amount,
						});
					});
				});
			});

			describe('mintSecondaryFromDeposit', async () => {
				describe('failure modes', () => {
					it('should only allow the relayer (aka messenger) to call mintSecondaryFromDeposit()', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: instance.mintSecondaryFromDeposit,
							args: [user1, 100, 1],
							accounts,
							address: smockedMessenger,
							reason: 'Only the relayer can call this',
						});
					});

					it('should only allow the L1 bridge to invoke mintSecondaryFromDeposit() via the messenger', async () => {
						// 'smock' the messenger to return a random msg sender
						messenger.smocked.xDomainMessageSender.will.return.with(() => randomAddress);
						await assert.revert(
							instance.mintSecondaryFromDeposit(user1, 100, 1, {
								from: smockedMessenger,
							}),
							'Only the L1 bridge can invoke'
						);
					});
				});

				describe('when invoked by the messenger (aka relayer)', async () => {
					let mintSecondaryTx;
					const mintSecondaryAmount = 100;
					const escrowAmount = 0;
					beforeEach('mintSecondaryFromDeposit is called', async () => {
						mintSecondaryTx = await instance.mintSecondaryFromDeposit(
							user1,
							mintSecondaryAmount,
							escrowAmount,
							{
								from: smockedMessenger,
							}
						);
					});

					it('should emit a MintedSecondary event', async () => {
						assert.eventEqual(mintSecondaryTx, 'MintedSecondary', {
							account: user1,
							amount: mintSecondaryAmount,
						});
					});

					it('then SNX is minted via MintableSynthetix.mintSecondary', async () => {
						assert.equal(mintableSynthetix.smocked.mintSecondary.calls.length, 1);
						assert.equal(mintableSynthetix.smocked.mintSecondary.calls[0][0], user1);
						assert.equal(
							mintableSynthetix.smocked.mintSecondary.calls[0][1].toString(),
							mintSecondaryAmount
						);
					});
				});
			});

			describe('mintSecondaryFromDepositForRewards', async () => {
				describe('failure modes', () => {
					it('should only allow the relayer (aka messenger) to call mintSecondaryFromDepositForRewards()', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: instance.mintSecondaryFromDepositForRewards,
							args: [100],
							accounts,
							address: smockedMessenger,
							reason: 'Only the relayer can call this',
						});
					});

					it('should only allow the L1 bridge to invoke mintSecondaryFromDepositForRewards() via the messenger', async () => {
						// 'smock' the messenger to return a random msg sender
						messenger.smocked.xDomainMessageSender.will.return.with(() => randomAddress);
						await assert.revert(
							instance.mintSecondaryFromDepositForRewards(100, {
								from: smockedMessenger,
							}),
							'Only the L1 bridge can invoke'
						);
					});
				});

				describe('when invoked by the bridge on the other layer', async () => {
					let mintSecondaryTx;
					const mintSecondaryAmount = 100;
					beforeEach('mintSecondaryFromDepositForRewards is called', async () => {
						mintSecondaryTx = await instance.mintSecondaryFromDepositForRewards(
							mintSecondaryAmount,
							{
								from: smockedMessenger,
							}
						);
					});

					it('should emit a MintedSecondaryRewards event', async () => {
						assert.eventEqual(mintSecondaryTx, 'MintedSecondaryRewards', {
							amount: mintSecondaryAmount,
						});
					});

					it('then SNX is minted via MintbaleSynthetix.mintSecondary', async () => {
						assert.equal(mintableSynthetix.smocked.mintSecondaryRewards.calls.length, 1);
						assert.equal(
							mintableSynthetix.smocked.mintSecondaryRewards.calls[0][0].toString(),
							mintSecondaryAmount
						);
					});
				});
			});
		});
	});
});
