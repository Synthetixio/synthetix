const { artifacts, contract, web3 } = require('hardhat');
const { assert } = require('./common');
const { expect } = require('chai');
const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const { toBytes32 } = require('../..');
const { smock } = require('@defi-wonderland/smock');

const SynthetixBridgeToOptimism = artifacts.require('SynthetixBridgeToOptimism');

contract('SynthetixBridgeToOptimism (unit tests)', accounts => {
	const [
		owner,
		user1,
		smockedMessenger,
		rewardsDistribution,
		snxBridgeToBase,
		SynthetixBridgeEscrow,
		FeePool,
		randomAddress,
	] = accounts;

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: SynthetixBridgeToOptimism.abi,
			ignoreParents: ['BaseSynthetixBridge'],
			expected: [
				'closeFeePeriod',
				'depositAndMigrateEscrow',
				'deposit',
				'depositTo',
				'depositReward',
				'finalizeWithdrawal',
				'forwardTokensToEscrow',
				'migrateEscrow',
				'notifyRewardAmount',
			],
		});
	});

	const getDataOfEncodedFncCall = ({ contract, fnc, args = [] }) =>
		web3.eth.abi.encodeFunctionCall(
			artifacts.require(contract).abi.find(({ name }) => name === fnc),
			args
		);

	describe('when all the deps are mocked', () => {
		let messenger;
		let synthetix;
		let issuer;
		let exchangeRates;
		let systemStatus;
		let resolver;
		let rewardEscrow;
		const escrowAmount = 100;
		const emptyArray = [];

		let flexibleStorage;
		beforeEach(async () => {
			messenger = await smock.fake('iAbs_BaseCrossDomainMessenger', {
				address: smockedMessenger,
			});

			rewardEscrow = await smock.fake('contracts/interfaces/IRewardEscrowV2.sol:IRewardEscrowV2');

			// can't use ISynthetix as we need ERC20 functions as well
			synthetix = await smock.fake('Synthetix');
			issuer = await smock.fake('IIssuer');
			exchangeRates = await smock.fake('ExchangeRates');
			systemStatus = await smock.fake('SystemStatus');
			flexibleStorage = await smock.fake('FlexibleStorage');

			resolver = await artifacts.require('AddressResolver').new(owner);
			await resolver.importAddresses(
				[
					'FlexibleStorage',
					'ext:Messenger',
					'Synthetix',
					'Issuer',
					'ExchangeRates',
					'SystemStatus',
					'FeePool',
					'RewardsDistribution',
					'ovm:SynthetixBridgeToBase',
					'RewardEscrowV2',
					'SynthetixBridgeEscrow',
				].map(toBytes32),
				[
					flexibleStorage.address,
					messenger.address,
					synthetix.address,
					issuer.address,
					exchangeRates.address,
					systemStatus.address,
					FeePool,
					rewardsDistribution,
					snxBridgeToBase,
					rewardEscrow.address,
					SynthetixBridgeEscrow,
				],
				{ from: owner }
			);
		});

		beforeEach(async () => {
			// stubs
			synthetix.transferFrom.returns(() => true);
			synthetix.balanceOf.returns(() => web3.utils.toWei('1'));
			synthetix.transfer.returns(() => true);
			messenger.sendMessage.returns(() => {});
			messenger.xDomainMessageSender.returns(() => snxBridgeToBase);
			issuer.debtBalanceOf.returns(() => '0');
			rewardEscrow.burnForMigration.returns(() => [escrowAmount, emptyArray]);
			flexibleStorage.getUIntValue.returns(() => '3000000');
		});

		describe('when the target is deployed', () => {
			let instance;
			beforeEach(async () => {
				instance = await artifacts
					.require('SynthetixBridgeToOptimism')
					.new(owner, resolver.address);

				await instance.rebuildCache();
			});

			it('should set constructor params on deployment', async () => {
				assert.equal(await instance.owner(), owner);
				assert.equal(await instance.resolver(), resolver.address);
			});

			describe('deposit', () => {
				describe('failure modes', () => {
					it('does not work when initiation has been suspended', async () => {
						await instance.suspendInitiation({ from: owner });

						await assert.revert(instance.deposit('1'), 'Initiation deactivated');
					});

					it('does not work when user has any debt', async () => {
						issuer.debtBalanceOf.returns(() => '1');
						await assert.revert(instance.deposit('1'), 'Cannot deposit or migrate with debt');
					});
				});

				describe('when invoked by a user directly', () => {
					let txn;
					const amount = 100;
					beforeEach(async () => {
						txn = await instance.deposit(amount, { from: user1 });
					});

					it('only one event is emitted (DepositInitiated)', async () => {
						assert.eventEqual(txn, 'DepositInitiated', [user1, user1, amount]);
					});

					it('only one message is sent', async () => {
						expect(messenger.sendMessage).to.have.length(0);
						messenger.sendMessage.returnsAtCall(0, snxBridgeToBase);
						const expectedData = getDataOfEncodedFncCall({
							contract: 'SynthetixBridgeToBase',
							fnc: 'finalizeDeposit',
							args: [user1, amount],
						});
						messenger.sendMessage.returnsAtCall(1, expectedData);
						messenger.sendMessage.returnsAtCall(2, (3e6).toString());
					});
				});
			});

			describe('depositTo', () => {
				describe('failure modes', () => {
					it('does not work when initiation has been suspended', async () => {
						await instance.suspendInitiation({ from: owner });

						await assert.revert(instance.depositTo(randomAddress, '1'), 'Initiation deactivated');
					});

					it('does not work when user has any debt', async () => {
						issuer.debtBalanceOf.returns(() => '1');
						await assert.revert(
							instance.depositTo(randomAddress, '1'),
							'Cannot deposit or migrate with debt'
						);
					});
				});

				describe('when invoked by a user', () => {
					let txn;
					const amount = 100;
					beforeEach(async () => {
						txn = await instance.depositTo(randomAddress, amount, { from: user1 });
					});

					it('only one event is emitted (DepositInitiated)', async () => {
						assert.eventEqual(txn, 'DepositInitiated', [user1, randomAddress, amount]);
					});

					it('only one message is sent', async () => {
						expect(messenger.sendMessage).to.have.length(0);

						messenger.sendMessage.returnsAtCall(0, snxBridgeToBase);
						const expectedData = getDataOfEncodedFncCall({
							contract: 'SynthetixBridgeToBase',
							fnc: 'finalizeDeposit',
							args: [randomAddress, amount],
						});
						messenger.sendMessage.returnsAtCall(1, expectedData);
						messenger.sendMessage.returnsAtCall(2, (3e6).toString());
					});
				});
			});

			describe('migrateEscrow', () => {
				const entryIds = [
					[1, 2, 3],
					[4, 5, 6],
				];
				describe('failure modes', () => {
					it('does not work when initiation has been suspended', async () => {
						await instance.suspendInitiation({ from: owner });

						await assert.revert(instance.migrateEscrow(entryIds), 'Initiation deactivated');
					});

					it('does not work when user has any debt', async () => {
						issuer.debtBalanceOf.returns(() => '1');
						await assert.revert(
							instance.migrateEscrow(entryIds),
							'Cannot deposit or migrate with debt'
						);
					});

					it('reverts when an entriesId subarray contains more than 26 entries', async () => {
						const subArray = [];
						for (let i = 0; i < 27; i++) {
							subArray[i] = i;
						}
						const entryIds27Entries = [[1, 2, 3], subArray];
						await assert.revert(
							instance.migrateEscrow(entryIds27Entries),
							'Exceeds max entries per migration'
						);
					});
				});
			});

			describe('depositAndMigrateEscrow', () => {
				const entryIds = [
					[1, 2, 3],
					[4, 5, 6],
				];

				describe('failure modes', () => {
					it('does not work when initiation has been suspended', async () => {
						await instance.suspendInitiation({ from: owner });

						await assert.revert(
							instance.depositAndMigrateEscrow('1', entryIds),
							'Initiation deactivated'
						);
					});

					it('does not work when user has any debt', async () => {
						issuer.debtBalanceOf.returns(() => '1');
						await assert.revert(
							instance.depositAndMigrateEscrow('0', entryIds),
							'Cannot deposit or migrate with debt'
						);
					});
				});

				describe('when invoked by a user directly', () => {
					let txn;
					let amount;

					describe('when the user deposits and migrates', () => {
						beforeEach(async () => {
							amount = '99';
							txn = await instance.depositAndMigrateEscrow(amount, entryIds, { from: user1 });
						});

						it('the L1 escrow is burned (via rewardEscrowV2.burnForMigration)', async () => {
							expect(rewardEscrow.burnForMigration).to.have.length(0);

							rewardEscrow.burnForMigration.returnsAtCall(0, user1);
							rewardEscrow.burnForMigration.returnsAtCall(1, entryIds[0]);
							rewardEscrow.burnForMigration.returnsAtCall(0, user1);
							rewardEscrow.burnForMigration.returnsAtCall(1, entryIds[1]);
						});

						it('three messages are relayed from L1 to L2: finalizeEscrowMigration & finalizeDeposit', async () => {
							expect(messenger.sendMessage).to.have.length(0);

							messenger.sendMessage.returnsAtCall(0, snxBridgeToBase);
							let expectedData = getDataOfEncodedFncCall({
								contract: 'ISynthetixBridgeToBase',
								fnc: 'finalizeEscrowMigration',
								args: [user1, escrowAmount, emptyArray],
							});
							messenger.sendMessage.returnsAtCall(1, expectedData);
							messenger.sendMessage.returnsAtCall(2, (3e6).toString());

							messenger.sendMessage.returnsAtCall(0, snxBridgeToBase);
							expectedData = getDataOfEncodedFncCall({
								contract: 'ISynthetixBridgeToBase',
								fnc: 'finalizeEscrowMigration',
								args: [user1, escrowAmount, emptyArray],
							});
							messenger.sendMessage.returnsAtCall(1, expectedData);
							messenger.sendMessage.returnsAtCall(2, (3e6).toString());

							messenger.sendMessage.returnsAtCall(0, snxBridgeToBase);
							expectedData = getDataOfEncodedFncCall({
								contract: 'SynthetixBridgeToBase',
								fnc: 'finalizeDeposit',
								args: [user1, amount],
							});

							messenger.sendMessage.returnsAtCall(1, expectedData);
							messenger.sendMessage.returnsAtCall(2, (3e6).toString());
						});

						it('SNX is transferred from the user to the deposit contract', async () => {
							synthetix.transferFrom.returnsAtCall(0, user1);
							synthetix.transferFrom.returnsAtCall(1, SynthetixBridgeEscrow);
							synthetix.transferFrom.returnsAtCall(2, amount);
						});

						it('and three events are emitted', async () => {
							assert.eventEqual(txn.logs[0], 'ExportedVestingEntries', [
								user1,
								escrowAmount,
								emptyArray,
							]);
							assert.eventEqual(txn.logs[1], 'ExportedVestingEntries', [
								user1,
								escrowAmount,
								emptyArray,
							]);
							assert.eventEqual(txn.logs[2], 'DepositInitiated', [user1, user1, amount]);
						});
					});

					describe('when the user deposits but does not want to migrate any escrow entries)', () => {
						beforeEach(async () => {
							amount = '1';
							txn = await instance.depositAndMigrateEscrow(amount, [], { from: user1 });
						});

						it('one message is relayed: finalizeDeposit', async () => {
							expect(messenger.sendMessage).to.have.length(0);
							messenger.sendMessage.returnsAtCall(0, snxBridgeToBase);
							const expectedData = getDataOfEncodedFncCall({
								contract: 'SynthetixBridgeToBase',
								fnc: 'finalizeDeposit',
								args: [user1, amount],
							});
							messenger.sendMessage.returnsAtCall(1, expectedData);
							messenger.sendMessage.returnsAtCall(2, (3e6).toString());
						});

						it('and one event is emitted (DepositInitiated)', async () => {
							assert.equal(txn.logs.length, 1);
							assert.eventEqual(txn.logs[0], 'DepositInitiated', [user1, user1, amount]);
						});
					});

					describe('when the user migrates but deposits 0', () => {
						beforeEach(async () => {
							txn = await instance.depositAndMigrateEscrow('0', entryIds, { from: user1 });
						});

						it('the L1 escrow is burned (via rewardEscrowV2.burnForMigration', async () => {
							expect(messenger.sendMessage).to.have.length(0);
							rewardEscrow.burnForMigration.returnsAtCall(0, user1);
							rewardEscrow.burnForMigration.returnsAtCall(1, entryIds[0]);
							rewardEscrow.burnForMigration.returnsAtCall(0, user1);
							rewardEscrow.burnForMigration.returnsAtCall(1, entryIds[1]);
						});

						it('two messages are relayed: finalizeEscrowMigration', async () => {
							expect(messenger.sendMessage).to.have.length(0);
							messenger.sendMessage.returnsAtCall(0, snxBridgeToBase);
							let expectedData = getDataOfEncodedFncCall({
								contract: 'ISynthetixBridgeToBase',
								fnc: 'finalizeEscrowMigration',
								args: [user1, escrowAmount, []],
							});
							messenger.sendMessage.returnsAtCall(1, expectedData);
							messenger.sendMessage.returnsAtCall(2, (3e6).toString());

							messenger.sendMessage.returnsAtCall(0, snxBridgeToBase);
							expectedData = getDataOfEncodedFncCall({
								contract: 'ISynthetixBridgeToBase',
								fnc: 'finalizeEscrowMigration',
								args: [user1, escrowAmount, []],
							});
							messenger.sendMessage.returnsAtCall(1, expectedData);
							messenger.sendMessage.returnsAtCall(2, (3e6).toString());
						});

						it('and two events are emitted (ExportedVestingEntries)', async () => {
							assert.equal(txn.logs.length, 2);
							assert.eventEqual(txn.logs[0], 'ExportedVestingEntries', [
								user1,
								escrowAmount,
								emptyArray,
							]);
							assert.eventEqual(txn.logs[1], 'ExportedVestingEntries', [
								user1,
								escrowAmount,
								emptyArray,
							]);
						});
					});
				});
			});

			describe('depositReward', () => {
				describe('failure modes', () => {
					it('does not work when initiation has been suspended', async () => {
						await instance.suspendInitiation({ from: owner });

						await assert.revert(instance.depositReward('1'), 'Initiation deactivated');
					});
				});

				describe('when invoked by a user directly', () => {
					let txn;
					const amount = '100';
					beforeEach(async () => {
						txn = await instance.depositReward(amount, { from: user1 });
					});

					it('then SNX is transferred from the account to the bridge escrow', async () => {
						synthetix.transferFrom.returnsAtCall(0, user1);
						synthetix.transferFrom.returnsAtCall(1, SynthetixBridgeEscrow);
						synthetix.transferFrom.returnsAtCall(2, amount);
					});

					it('and the message is relayed', async () => {
						expect(messenger.sendMessage).to.have.length(0);
						messenger.sendMessage.returnsAtCall(0, snxBridgeToBase);
						const expectedData = getDataOfEncodedFncCall({
							contract: 'SynthetixBridgeToBase',
							fnc: 'finalizeRewardDeposit',
							args: [user1, amount],
						});
						messenger.sendMessage.returnsAtCall(1, expectedData);
						messenger.sendMessage.returnsAtCall(2, (3e6).toString());
					});

					it('and a RewardDepositInitiated event is emitted', async () => {
						assert.eventEqual(txn, 'RewardDepositInitiated', [user1, amount]);
					});
				});
			});

			describe('closeFeePeriod()', () => {
				describe('failure modes', () => {
					it('does not work when initiation has been suspended', async () => {
						await instance.suspendInitiation({ from: owner });

						await assert.revert(
							instance.closeFeePeriod('1', '2', { from: FeePool }),
							'Initiation deactivated'
						);
					});

					it('fails when invoked by a user directly', async () => {
						await assert.revert(
							instance.closeFeePeriod('1', '2'),
							'Only the fee pool can call this'
						);
					});
				});

				describe('when invoked by fee pool', () => {
					let txn;
					beforeEach(async () => {
						txn = await instance.closeFeePeriod('1', '2', { from: FeePool });
					});

					it('relays the message', async () => {
						expect(messenger.sendMessage).to.have.length(0);
						messenger.sendMessage.returnsAtCall(0, snxBridgeToBase);
						const expectedData = getDataOfEncodedFncCall({
							contract: 'SynthetixBridgeToBase',
							fnc: 'finalizeFeePeriodClose',
							args: ['1', '2'],
						});
						messenger.sendMessage.returnsAtCall(1, expectedData);
						messenger.sendMessage.returnsAtCall(2, (3e6).toString());
					});

					it('emits FeePeriodClosed', async () => {
						assert.eventEqual(txn, 'FeePeriodClosed', ['1', '2']);
					});
				});
			});

			describe('notifyRewardAmount', () => {
				describe('failure modes', () => {
					it('does not work when not invoked by the rewardDistribution address', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: instance.notifyRewardAmount,
							args: ['1'],
							accounts,
							reason: 'Caller is not RewardsDistribution contract',
							address: rewardsDistribution,
						});
					});
				});

				describe('when invoked by the rewardsDistribution directly', () => {
					let txn;
					const amount = '1000';
					beforeEach(async () => {
						txn = await instance.notifyRewardAmount(amount, { from: rewardsDistribution });
					});

					it('then the message is relayed', async () => {
						expect(messenger.sendMessage).to.have.length(0);
						messenger.sendMessage.returnsAtCall(0, snxBridgeToBase);

						const expectedData = getDataOfEncodedFncCall({
							contract: 'SynthetixBridgeToBase',
							fnc: 'finalizeRewardDeposit',
							args: [rewardsDistribution, amount],
						});

						messenger.sendMessage.returnsAtCall(1, expectedData);
						messenger.sendMessage.returnsAtCall(2, (3e6).toString());
					});

					it('SNX is transferred from the bridge to the bridge escrow', async () => {
						synthetix.transfer.returnsAtCall(0, SynthetixBridgeEscrow);
						synthetix.transfer.returnsAtCall(1, amount);
					});

					it('and a RewardDepositInitiated event is emitted', async () => {
						assert.eventEqual(txn, 'RewardDepositInitiated', [rewardsDistribution, amount]);
					});
				});
			});

			describe('finalizeWithdrawal', async () => {
				describe('failure modes', () => {
					it('should only allow the relayer (aka messenger) to call finalizeWithdrawal()', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: instance.finalizeWithdrawal,
							args: [user1, 100],
							accounts,
							address: smockedMessenger,
							reason: 'Only the relayer can call this',
						});
					});

					it('should only allow the L2 bridge to invoke finalizeWithdrawal() via the messenger', async () => {
						// 'smock' the messenger to return a random msg sender
						messenger.xDomainMessageSender.returns(() => randomAddress);
						await assert.revert(
							instance.finalizeWithdrawal(user1, 100, {
								from: smockedMessenger,
							}),
							'Only a counterpart bridge can invoke'
						);
					});
				});

				describe('when invoked by the messenger (aka relayer)', async () => {
					let finalizeWithdrawalTx;
					const finalizeWithdrawalAmount = 100;
					beforeEach('finalizeWithdrawal is called', async () => {
						finalizeWithdrawalTx = await instance.finalizeWithdrawal(
							user1,
							finalizeWithdrawalAmount,
							{
								from: smockedMessenger,
							}
						);
					});

					it('should emit a WithdrawalFinalized event', async () => {
						assert.eventEqual(finalizeWithdrawalTx, 'WithdrawalFinalized', {
							_to: user1,
							_amount: finalizeWithdrawalAmount,
						});
					});

					it('then SNX is minted via MintableSynthetix.finalizeWithdrawal', async () => {
						expect(messenger.sendMessage).to.have.length(0);
						synthetix.transferFrom.returnsAtCall(0, SynthetixBridgeEscrow);
						synthetix.transferFrom.returnsAtCall(1, user1);
						synthetix.transferFrom.returnsAtCall(2, finalizeWithdrawalAmount);
					});
				});
			});
		});
	});
});
