const { artifacts, contract, web3 } = require('hardhat');
const { assert } = require('./common');
const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const { toBytes32 } = require('../..');
const { smock } = require('@defi-wonderland/smock');
const { expect } = require('chai');

const SynthetixBridgeToBase = artifacts.require('SynthetixBridgeToBase');

contract('SynthetixBridgeToBase (unit tests)', accounts => {
	const [owner, user1, snxBridgeToOptimism, smockedMessenger, randomAddress] = accounts;

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: SynthetixBridgeToBase.abi,
			ignoreParents: ['BaseSynthetixBridge'],
			expected: [
				'finalizeDeposit',
				'finalizeFeePeriodClose',
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
		let feePool;
		let issuer;
		let exchangeRates;
		let systemStatus;
		beforeEach(async () => {
			messenger = await smock.fake('iAbs_BaseCrossDomainMessenger', {
				address: smockedMessenger,
			});

			rewardEscrow = await smock.fake('contracts/interfaces/IRewardEscrowV2.sol:IRewardEscrowV2');

			mintableSynthetix = await smock.fake('MintableSynthetix');
			flexibleStorage = await smock.fake('FlexibleStorage');
			feePool = await smock.fake('FeePool');
			issuer = await smock.fake('Issuer');
			exchangeRates = await smock.fake('ExchangeRates');
			systemStatus = await smock.fake('SystemStatus');

			resolver = await artifacts.require('AddressResolver').new(owner);
			await resolver.importAddresses(
				[
					'FlexibleStorage',
					'ext:Messenger',
					'Synthetix',
					'base:SynthetixBridgeToOptimism',
					'RewardEscrowV2',
					'FeePool',
					'Issuer',
					'ExchangeRates',
					'SystemStatus',
				].map(toBytes32),
				[
					flexibleStorage.address,
					messenger.address,
					mintableSynthetix.address,
					snxBridgeToOptimism,
					rewardEscrow.address,
					feePool.address,
					issuer.address,
					exchangeRates.address,
					systemStatus.address,
				],
				{ from: owner }
			);
		});

		beforeEach(async () => {
			// stubs
			mintableSynthetix.burnSecondary.returns(() => {});
			mintableSynthetix.mintSecondary.returns(() => {});
			mintableSynthetix.balanceOf.returns(() => web3.utils.toWei('1'));
			mintableSynthetix.transferableSynthetix.returns(() => web3.utils.toWei('1'));
			messenger.sendMessage.returns(() => {});
			messenger.xDomainMessageSender.returns(() => snxBridgeToOptimism);
			rewardEscrow.importVestingEntries.returns(() => {});
			flexibleStorage.getUIntValue.returns(() => '3000000');
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
						messenger.xDomainMessageSender.returns(() => randomAddress);
						await assert.revert(
							instance.finalizeEscrowMigration(user1, escrowedAmount, emptyArray, {
								from: smockedMessenger,
							}),
							'Only a counterpart bridge can invoke'
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
						rewardEscrow.importVestingEntries.returnsAtCall(0, user1);
						rewardEscrow.importVestingEntries.returnsAtCall(1, escrowedAmount);
						rewardEscrow.importVestingEntries.returnsAtCall(2, emptyArray);
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
						mintableSynthetix.transferableSynthetix.returns(() => '0');
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
						expect(mintableSynthetix.burnSecondary).to.have.length(0);
						mintableSynthetix.burnSecondary.returnsAtCall(0, user1);
						mintableSynthetix.burnSecondary.returnsAtCall(1, amount);
					});

					it('the message is relayed', async () => {
						expect(messenger.sendMessage).to.have.length(0);
						messenger.sendMessage.returnsAtCall(0, snxBridgeToOptimism);
						const expectedData = getDataOfEncodedFncCall({
							fnc: 'finalizeWithdrawal',
							args: [user1, amount],
						});

						messenger.sendMessage.returnsAtCall(1, expectedData);
						messenger.sendMessage.returnsAtCall(2, gasLimit.toString());
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
						mintableSynthetix.transferableSynthetix.returns(() => '0');
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
						expect(mintableSynthetix.burnSecondary).to.have.length(0);
						mintableSynthetix.burnSecondary.returnsAtCall(0, user1);
						mintableSynthetix.burnSecondary.returnsAtCall(1, amount);
					});

					it('the message is relayed', async () => {
						expect(messenger.sendMessage).to.have.length(0);
						messenger.sendMessage.returnsAtCall(0, snxBridgeToOptimism);
						const expectedData = getDataOfEncodedFncCall({
							fnc: 'finalizeWithdrawal',
							args: [randomAddress, amount],
						});

						messenger.sendMessage.returnsAtCall(1, expectedData);
						messenger.sendMessage.returnsAtCall(2, gasLimit.toString());
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
						messenger.xDomainMessageSender.returns(() => randomAddress);
						await assert.revert(
							instance.finalizeDeposit(user1, 100, {
								from: smockedMessenger,
							}),
							'Only a counterpart bridge can invoke'
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
						expect(mintableSynthetix.mintSecondary).to.have.length(0);
						mintableSynthetix.mintSecondary.returnsAtCall(0, user1);
						mintableSynthetix.mintSecondary.returnsAtCall(1, finalizeDepositAmount);
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
						messenger.xDomainMessageSender.returns(() => randomAddress);
						await assert.revert(
							instance.finalizeRewardDeposit(user1, 100, {
								from: smockedMessenger,
							}),
							'Only a counterpart bridge can invoke'
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
						expect(mintableSynthetix.mintSecondaryRewards).to.have.length(0);
						mintableSynthetix.mintSecondaryRewards.returnsAtCall(0, finalizeRewardDepositAmount);
					});
				});
			});

			describe('finalizeFeePeriodClose', async () => {
				describe('failure modes', () => {
					it('should only allow the relayer (aka messenger) to call finalizeFeePeriodClose()', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: instance.finalizeFeePeriodClose,
							args: [user1, 100],
							accounts,
							address: smockedMessenger,
							reason: 'Only the relayer can call this',
						});
					});

					it('should only allow the L1 bridge to invoke finalizeFeePeriodClose() via the messenger', async () => {
						// 'smock' the messenger to return a random msg sender
						messenger.xDomainMessageSender.returns(() => randomAddress);
						await assert.revert(
							instance.finalizeFeePeriodClose(1, 1, {
								from: smockedMessenger,
							}),
							'Only a counterpart bridge can invoke'
						);
					});
				});

				describe('when invoked by the messenger (aka relayer)', async () => {
					let finalizeTx;
					beforeEach('finalizeFeePeriodClose is called', async () => {
						finalizeTx = await instance.finalizeFeePeriodClose('1', '2', {
							from: smockedMessenger,
						});
					});

					it('should emit a FeePeriodCloseFinalized event', async () => {
						assert.eventEqual(finalizeTx, 'FeePeriodCloseFinalized', ['1', '2']);
					});

					it('then SNX is minted via MintableSynthetix.mintSecondary', async () => {
						expect(feePool.closeSecondary).to.have.length(0);
						feePool.closeSecondary.returnsAtCall(0, '1');
						feePool.closeSecondary.returnsAtCall(1, '2');
					});
				});
			});
		});
	});
});
