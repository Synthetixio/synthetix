const { artifacts, contract, web3 } = require('hardhat');
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
			ignoreParents: ['BaseSynthetixBridge'],
			expected: [
				'finalizeDeposit',
				'finalizeEscrowMigration',
				'finalizeRewardDeposit',
				'withdraw',
				'withdrawTo',
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
		let flexibleStorage;
		beforeEach(async () => {
			messenger = await smockit(artifacts.require('iAbs_BaseCrossDomainMessenger').abi, {
				address: smockedMessenger,
			});

			rewardEscrow = await smockit(
				artifacts.require('contracts/interfaces/IRewardEscrowV2.sol:IRewardEscrowV2').abi
			);

			mintableSynthetix = await smockit(artifacts.require('MintableSynthetix').abi);
			flexibleStorage = await smockit(artifacts.require('FlexibleStorage').abi);

			resolver = await artifacts.require('AddressResolver').new(owner);
			await resolver.importAddresses(
				[
					'FlexibleStorage',
					'ext:Messenger',
					'Synthetix',
					'base:SynthetixBridgeToOptimism',
					'RewardEscrowV2',
				].map(toBytes32),
				[
					flexibleStorage.address,
					messenger.address,
					mintableSynthetix.address,
					snxBridgeToOptimism,
					rewardEscrow.address,
				],
				{ from: owner }
			);
		});

		beforeEach(async () => {
			// stubs
			mintableSynthetix.smocked.burnSecondary.will.return.with(() => {});
			mintableSynthetix.smocked.mintSecondary.will.return.with(() => {});
			mintableSynthetix.smocked.balanceOf.will.return.with(() => web3.utils.toWei('1'));
			mintableSynthetix.smocked.transferableSynthetix.will.return.with(() => web3.utils.toWei('1'));
			messenger.smocked.sendMessage.will.return.with(() => {});
			messenger.smocked.xDomainMessageSender.will.return.with(() => snxBridgeToOptimism);
			rewardEscrow.smocked.importVestingEntries.will.return.with(() => {});
			flexibleStorage.smocked.getUIntValue.will.return.with(() => '3000000');
		});

		describe('when the target is deployed', () => {
			let instance;
			const escrowedAmount = 100;
			beforeEach(async () => {
				instance = await artifacts.require('SynthetixBridgeToBase').new(owner, resolver.address);
				await instance.rebuildCache();
			});

			it('should set constructor params on deployment', async () => {
				assert.equal(await instance.owner(), owner);
				assert.equal(await instance.resolver(), resolver.address);
			});

			describe('importVestingEntries', async () => {
				const emptyArray = [];

				describe('failure modes', () => {
					it('should only allow the relayer (aka messenger) to call importVestingEntries()', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: instance.finalizeEscrowMigration,
							args: [user1, escrowedAmount, emptyArray],
							accounts,
							address: smockedMessenger,
							reason: 'Only the relayer can call this',
						});
					});

					it('should only allow the L1 bridge to invoke importVestingEntries() via the messenger', async () => {
						// 'smock' the messenger to return a random msg sender
						messenger.smocked.xDomainMessageSender.will.return.with(() => randomAddress);
						await assert.revert(
							instance.finalizeEscrowMigration(user1, escrowedAmount, emptyArray, {
								from: smockedMessenger,
							}),
							'Only the L1 bridge can invoke'
						);
					});
				});

				describe('when invoked by the messenger (aka relayer)', async () => {
					let importVestingEntriesTx;
					beforeEach('importVestingEntries is called', async () => {
						importVestingEntriesTx = await instance.finalizeEscrowMigration(
							user1,
							escrowedAmount,
							emptyArray,
							{
								from: smockedMessenger,
							}
						);
					});

					it('importVestingEntries is called (via rewardEscrowV2)', async () => {
						assert.equal(rewardEscrow.smocked.importVestingEntries.calls[0][0], user1);
						assert.bnEqual(rewardEscrow.smocked.importVestingEntries.calls[0][1], escrowedAmount);
						assert.bnEqual(rewardEscrow.smocked.importVestingEntries.calls[0][2], emptyArray);
					});

					it('should emit a ImportedVestingEntries event', async () => {
						assert.eventEqual(importVestingEntriesTx, 'ImportedVestingEntries', {
							account: user1,
							escrowedAmount: escrowedAmount,
							vestingEntries: emptyArray,
						});
					});
				});
			});

			describe('withdraw', () => {
				describe('failure modes', () => {
					it('does not work when the user has less trasferable snx than the withdrawal amount', async () => {
						mintableSynthetix.smocked.transferableSynthetix.will.return.with(() => '0');
						await assert.revert(instance.withdraw('1'), 'Not enough transferable SNX');
					});
					it('does not work when initiation has been suspended', async () => {
						await instance.suspendInitiation({ from: owner });

						await assert.revert(instance.withdrawTo(randomAddress, '1'), 'Initiation deactivated');
					});
				});

				describe('when invoked by a user', () => {
					let withdrawalTx;
					const amount = 100;
					const gasLimit = 3e6;
					beforeEach('user tries to withdraw 100 tokens', async () => {
						withdrawalTx = await instance.withdraw(amount, { from: user1 });
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
							fnc: 'finalizeWithdrawal',
							args: [user1, amount],
						});

						assert.equal(messenger.smocked.sendMessage.calls[0][1], expectedData);
						assert.equal(messenger.smocked.sendMessage.calls[0][2], gasLimit.toString());
					});

					it('and a WithdrawalInitiated event is emitted', async () => {
						assert.eventEqual(withdrawalTx, 'WithdrawalInitiated', {
							_from: user1,
							_to: user1,
							_amount: amount,
						});
					});
				});
			});

			describe('withdrawTo', () => {
				describe('failure modes', () => {
					it('does not work when the user has less trasferable snx than the withdrawal amount', async () => {
						mintableSynthetix.smocked.transferableSynthetix.will.return.with(() => '0');
						await assert.revert(
							instance.withdrawTo(randomAddress, '1'),
							'Not enough transferable SNX'
						);
					});
					it('does not work when initiation has been suspended', async () => {
						await instance.suspendInitiation({ from: owner });

						await assert.revert(instance.withdrawTo(randomAddress, '1'), 'Initiation deactivated');
					});
				});

				describe('when invoked by a user', () => {
					let withdrawalTx;
					const amount = 100;
					const gasLimit = 3e6;
					beforeEach('user tries to withdraw 100 tokens to a different address', async () => {
						withdrawalTx = await instance.withdrawTo(randomAddress, amount, { from: user1 });
					});

					it('then SNX is burned via mintableSyntetix.burnSecondary to the specified address', async () => {
						assert.equal(mintableSynthetix.smocked.burnSecondary.calls.length, 1);
						assert.equal(mintableSynthetix.smocked.burnSecondary.calls[0][0], user1);
						assert.equal(mintableSynthetix.smocked.burnSecondary.calls[0][1].toString(), amount);
					});

					it('the message is relayed', async () => {
						assert.equal(messenger.smocked.sendMessage.calls.length, 1);
						assert.equal(messenger.smocked.sendMessage.calls[0][0], snxBridgeToOptimism);
						const expectedData = getDataOfEncodedFncCall({
							fnc: 'finalizeWithdrawal',
							args: [randomAddress, amount],
						});

						assert.equal(messenger.smocked.sendMessage.calls[0][1], expectedData);
						assert.equal(messenger.smocked.sendMessage.calls[0][2], gasLimit.toString());
					});

					it('and a WithdrawalInitiated event is emitted', async () => {
						assert.eventEqual(withdrawalTx, 'WithdrawalInitiated', {
							_from: user1,
							_to: randomAddress,
							_amount: amount,
						});
					});
				});
			});

			describe('finalizeDeposit', async () => {
				describe('failure modes', () => {
					it('should only allow the relayer (aka messenger) to call finalizeDeposit()', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: instance.finalizeDeposit,
							args: [user1, 100],
							accounts,
							address: smockedMessenger,
							reason: 'Only the relayer can call this',
						});
					});

					it('should only allow the L1 bridge to invoke finalizeDeposit() via the messenger', async () => {
						// 'smock' the messenger to return a random msg sender
						messenger.smocked.xDomainMessageSender.will.return.with(() => randomAddress);
						await assert.revert(
							instance.finalizeDeposit(user1, 100, {
								from: smockedMessenger,
							}),
							'Only the L1 bridge can invoke'
						);
					});
				});

				describe('when invoked by the messenger (aka relayer)', async () => {
					let finalizeDepositTx;
					const finalizeDepositAmount = 100;
					beforeEach('finalizeDeposit is called', async () => {
						finalizeDepositTx = await instance.finalizeDeposit(user1, finalizeDepositAmount, {
							from: smockedMessenger,
						});
					});

					it('should emit a DepositFinalized event', async () => {
						assert.eventEqual(finalizeDepositTx, 'DepositFinalized', {
							_to: user1,
							_amount: finalizeDepositAmount,
						});
					});

					it('then SNX is minted via MintableSynthetix.mintSecondary', async () => {
						assert.equal(mintableSynthetix.smocked.mintSecondary.calls.length, 1);
						assert.equal(mintableSynthetix.smocked.mintSecondary.calls[0][0], user1);
						assert.equal(
							mintableSynthetix.smocked.mintSecondary.calls[0][1].toString(),
							finalizeDepositAmount
						);
					});
				});
			});

			describe('finalizeRewardDeposit', async () => {
				describe('failure modes', () => {
					it('should only allow the relayer (aka messenger) to call finalizeRewardDeposit()', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: instance.finalizeRewardDeposit,
							args: [user1, 100],
							accounts,
							address: smockedMessenger,
							reason: 'Only the relayer can call this',
						});
					});

					it('should only allow the L1 bridge to invoke finalizeRewardDeposit() via the messenger', async () => {
						// 'smock' the messenger to return a random msg sender
						messenger.smocked.xDomainMessageSender.will.return.with(() => randomAddress);
						await assert.revert(
							instance.finalizeRewardDeposit(user1, 100, {
								from: smockedMessenger,
							}),
							'Only the L1 bridge can invoke'
						);
					});
				});

				describe('when invoked by the bridge on the other layer', async () => {
					let finalizeRewardDepositTx;
					const finalizeRewardDepositAmount = 100;
					beforeEach('finalizeRewardDeposit is called', async () => {
						finalizeRewardDepositTx = await instance.finalizeRewardDeposit(
							user1,
							finalizeRewardDepositAmount,
							{
								from: smockedMessenger,
							}
						);
					});

					it('should emit a RewardDepositFinalized event', async () => {
						assert.eventEqual(finalizeRewardDepositTx, 'RewardDepositFinalized', {
							amount: finalizeRewardDepositAmount,
						});
					});

					it('then SNX is minted via MintbaleSynthetix.mintSecondary', async () => {
						assert.equal(mintableSynthetix.smocked.mintSecondaryRewards.calls.length, 1);
						assert.equal(
							mintableSynthetix.smocked.mintSecondaryRewards.calls[0][0].toString(),
							finalizeRewardDepositAmount
						);
					});
				});
			});
		});
	});
});
