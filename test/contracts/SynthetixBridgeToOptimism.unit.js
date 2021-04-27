const { artifacts, contract, web3 } = require('hardhat');
const { assert } = require('./common');
const {
	onlyGivenAddressCanInvoke,
	ensureOnlyExpectedMutativeFunctions,
	proxyThruTo,
	decodedEventEqual,
	getDecodedLogs,
} = require('./helpers');

const { toBytes32 } = require('../..');
const { smockit } = require('@eth-optimism/smock');

const SynthetixBridgeToOptimism = artifacts.require('SynthetixBridgeToOptimism');

contract('SynthetixBridgeToOptimism (unit tests)', accounts => {
	const [
		owner,
		user1,
		smockedMessenger,
		rewardsDistribution,
		snxBridgeToBase,
		SynthetixBridgeEscrow,
		randomAddress,
	] = accounts;

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: SynthetixBridgeToOptimism.abi,
			ignoreParents: ['BaseSynthetixBridge'],
			expected: [
				'depositAndMigrateEscrow',
				'deposit',
				'depositTo',
				'depositReward',
				'finalizeWithdrawal',
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
		let resolver;
		let rewardEscrow;
		let proxy;
		const escrowAmount = 100;
		const emptyArray = [];

		let flexibleStorage;
		beforeEach(async () => {
			messenger = await smockit(artifacts.require('iAbs_BaseCrossDomainMessenger').abi, {
				address: smockedMessenger,
			});

			rewardEscrow = await smockit(
				artifacts.require('contracts/interfaces/IRewardEscrowV2.sol:IRewardEscrowV2').abi
			);

			// can't use ISynthetix as we need ERC20 functions as well
			synthetix = await smockit(artifacts.require('Synthetix').abi);
			issuer = await smockit(artifacts.require('IIssuer').abi);
			flexibleStorage = await smockit(artifacts.require('FlexibleStorage').abi);

			proxy = await artifacts.require('Proxy').new(owner);
			resolver = await artifacts.require('AddressResolver').new(owner);
			await resolver.importAddresses(
				[
					'FlexibleStorage',
					'ext:Messenger',
					'Synthetix',
					'Issuer',
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
			synthetix.smocked.transferFrom.will.return.with(() => true);
			synthetix.smocked.balanceOf.will.return.with(() => web3.utils.toWei('1'));
			synthetix.smocked.transfer.will.return.with(() => true);
			messenger.smocked.sendMessage.will.return.with(() => {});
			messenger.smocked.xDomainMessageSender.will.return.with(() => snxBridgeToBase);
			issuer.smocked.debtBalanceOf.will.return.with(() => '0');
			rewardEscrow.smocked.burnForMigration.will.return.with(() => [escrowAmount, emptyArray]);
			flexibleStorage.smocked.getUIntValue.will.return.with(() => '3000000');
		});

		describe('when the target is deployed and the proxy is set', () => {
			let instance;
			beforeEach(async () => {
				instance = await artifacts
					.require('SynthetixBridgeToOptimism')
					.new(proxy.address, owner, resolver.address);

				await instance.rebuildCache();
				await proxy.setTarget(instance.address, { from: owner });
			});

			it('should set constructor params on deployment', async () => {
				assert.equal(await instance.proxy(), proxy.address);
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
						issuer.smocked.debtBalanceOf.will.return.with(() => '1');
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
						assert.equal(messenger.smocked.sendMessage.calls.length, 1);
						assert.equal(messenger.smocked.sendMessage.calls[0][0], snxBridgeToBase);
						const expectedData = getDataOfEncodedFncCall({
							contract: 'SynthetixBridgeToBase',
							fnc: 'finalizeDeposit',
							args: [user1, amount],
						});
						assert.equal(messenger.smocked.sendMessage.calls[0][1], expectedData);
						assert.equal(messenger.smocked.sendMessage.calls[0][2], (3e6).toString());
					});
				});

				describe('when invoked by a user via the proxy', () => {
					let hash;
					const amount = 100;
					beforeEach(async () => {
						const { tx: txHash } = await proxyThruTo({
							proxy,
							target: instance,
							fncName: 'deposit',
							from: user1,
							args: [amount],
						});
						hash = txHash;
					});

					it('an DepositInitiated event is emitted via the proxy', async () => {
						const logs = await getDecodedLogs({ hash, contracts: [instance] });
						decodedEventEqual({
							log: logs[0],
							event: 'DepositInitiated',
							emittedFrom: proxy.address,
							args: [user1, user1, amount],
						});
					});

					it('only one message is sent', async () => {
						assert.equal(messenger.smocked.sendMessage.calls.length, 1);
						assert.equal(messenger.smocked.sendMessage.calls[0][0], snxBridgeToBase);
						const expectedData = getDataOfEncodedFncCall({
							contract: 'SynthetixBridgeToBase',
							fnc: 'finalizeDeposit',
							args: [user1, amount],
						});
						assert.equal(messenger.smocked.sendMessage.calls[0][1], expectedData);
						assert.equal(messenger.smocked.sendMessage.calls[0][2], (3e6).toString());
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
						issuer.smocked.debtBalanceOf.will.return.with(() => '1');
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
						assert.equal(messenger.smocked.sendMessage.calls.length, 1);
						assert.equal(messenger.smocked.sendMessage.calls[0][0], snxBridgeToBase);
						const expectedData = getDataOfEncodedFncCall({
							contract: 'SynthetixBridgeToBase',
							fnc: 'finalizeDeposit',
							args: [randomAddress, amount],
						});
						assert.equal(messenger.smocked.sendMessage.calls[0][1], expectedData);
						assert.equal(messenger.smocked.sendMessage.calls[0][2], (3e6).toString());
					});
				});

				describe('when invoked by a user via the proxy', () => {
					let hash;
					const amount = 100;
					beforeEach(async () => {
						const { tx: txHash } = await proxyThruTo({
							proxy,
							target: instance,
							fncName: 'depositTo',
							from: user1,
							args: [randomAddress, amount],
						});
						hash = txHash;
					});

					it('an DepositInitiated event is emitted via the proxy', async () => {
						const logs = await getDecodedLogs({ hash, contracts: [instance] });
						decodedEventEqual({
							log: logs[0],
							event: 'DepositInitiated',
							emittedFrom: proxy.address,
							args: [user1, randomAddress, amount],
						});
					});

					it('only one message is sent', async () => {
						assert.equal(messenger.smocked.sendMessage.calls.length, 1);
						assert.equal(messenger.smocked.sendMessage.calls[0][0], snxBridgeToBase);
						const expectedData = getDataOfEncodedFncCall({
							contract: 'SynthetixBridgeToBase',
							fnc: 'finalizeDeposit',
							args: [randomAddress, amount],
						});
						assert.equal(messenger.smocked.sendMessage.calls[0][1], expectedData);
						assert.equal(messenger.smocked.sendMessage.calls[0][2], (3e6).toString());
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
						issuer.smocked.debtBalanceOf.will.return.with(() => '1');
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
						issuer.smocked.debtBalanceOf.will.return.with(() => '1');
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
							assert.equal(rewardEscrow.smocked.burnForMigration.calls.length, 2);
							assert.equal(rewardEscrow.smocked.burnForMigration.calls[0][0], user1);
							assert.bnEqual(rewardEscrow.smocked.burnForMigration.calls[0][1], entryIds[0]);
							assert.equal(rewardEscrow.smocked.burnForMigration.calls[1][0], user1);
							assert.bnEqual(rewardEscrow.smocked.burnForMigration.calls[1][1], entryIds[1]);
						});

						it('three messages are relayed from L1 to L2: finalizeEscrowMigration & finalizeDeposit', async () => {
							assert.equal(messenger.smocked.sendMessage.calls.length, 3);

							assert.equal(messenger.smocked.sendMessage.calls[0][0], snxBridgeToBase);
							let expectedData = getDataOfEncodedFncCall({
								contract: 'ISynthetixBridgeToBase',
								fnc: 'finalizeEscrowMigration',
								args: [user1, escrowAmount, emptyArray],
							});
							assert.equal(messenger.smocked.sendMessage.calls[0][1], expectedData);
							assert.equal(messenger.smocked.sendMessage.calls[0][2], (3e6).toString());

							assert.equal(messenger.smocked.sendMessage.calls[1][0], snxBridgeToBase);
							expectedData = getDataOfEncodedFncCall({
								contract: 'ISynthetixBridgeToBase',
								fnc: 'finalizeEscrowMigration',
								args: [user1, escrowAmount, emptyArray],
							});
							assert.equal(messenger.smocked.sendMessage.calls[1][1], expectedData);
							assert.equal(messenger.smocked.sendMessage.calls[1][2], (3e6).toString());

							assert.equal(messenger.smocked.sendMessage.calls[2][0], snxBridgeToBase);
							expectedData = getDataOfEncodedFncCall({
								contract: 'SynthetixBridgeToBase',
								fnc: 'finalizeDeposit',
								args: [user1, amount],
							});

							assert.equal(messenger.smocked.sendMessage.calls[2][1], expectedData);
							assert.equal(messenger.smocked.sendMessage.calls[2][2], (3e6).toString());
						});

						it('SNX is transferred from the user to the deposit contract', async () => {
							assert.equal(synthetix.smocked.transferFrom.calls[0][0], user1);
							assert.equal(synthetix.smocked.transferFrom.calls[0][1], SynthetixBridgeEscrow);
							assert.equal(synthetix.smocked.transferFrom.calls[0][2].toString(), amount);
						});

						it('and three events are emitted', async () => {
							const logs = await getDecodedLogs({ hash: txn.tx, contracts: [instance] });
							decodedEventEqual({
								log: logs[0],
								event: 'ExportedVestingEntries',
								emittedFrom: proxy.address,
								args: [user1, escrowAmount, emptyArray],
							});
							decodedEventEqual({
								log: logs[0],
								event: 'ExportedVestingEntries',
								emittedFrom: proxy.address,
								args: [user1, escrowAmount, emptyArray],
							});
							decodedEventEqual({
								log: logs[2],
								event: 'DepositInitiated',
								emittedFrom: proxy.address,
								args: [user1, user1, amount],
							});
						});
					});

					describe('when the user deposits but does not want to migrate any escrow entries)', () => {
						beforeEach(async () => {
							amount = '1';
							txn = await instance.depositAndMigrateEscrow(amount, [], { from: user1 });
						});

						it('one message is relayed: finalizeDeposit', async () => {
							assert.equal(messenger.smocked.sendMessage.calls.length, 1);
							assert.equal(messenger.smocked.sendMessage.calls[0][0], snxBridgeToBase);
							const expectedData = getDataOfEncodedFncCall({
								contract: 'SynthetixBridgeToBase',
								fnc: 'finalizeDeposit',
								args: [user1, amount],
							});
							assert.equal(messenger.smocked.sendMessage.calls[0][1], expectedData);
							assert.equal(messenger.smocked.sendMessage.calls[0][2], (3e6).toString());
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
							assert.equal(rewardEscrow.smocked.burnForMigration.calls.length, 2);
							assert.equal(rewardEscrow.smocked.burnForMigration.calls[0][0], user1);
							assert.bnEqual(rewardEscrow.smocked.burnForMigration.calls[0][1], entryIds[0]);
							assert.equal(rewardEscrow.smocked.burnForMigration.calls[1][0], user1);
							assert.bnEqual(rewardEscrow.smocked.burnForMigration.calls[1][1], entryIds[1]);
						});

						it('two messages are relayed: finalizeEscrowMigration', async () => {
							assert.equal(messenger.smocked.sendMessage.calls.length, 2);
							assert.equal(messenger.smocked.sendMessage.calls[0][0], snxBridgeToBase);
							let expectedData = getDataOfEncodedFncCall({
								contract: 'ISynthetixBridgeToBase',
								fnc: 'finalizeEscrowMigration',
								args: [user1, escrowAmount, []],
							});
							assert.equal(messenger.smocked.sendMessage.calls[0][1], expectedData);
							assert.equal(messenger.smocked.sendMessage.calls[0][2], (3e6).toString());

							assert.equal(messenger.smocked.sendMessage.calls[1][0], snxBridgeToBase);
							expectedData = getDataOfEncodedFncCall({
								contract: 'ISynthetixBridgeToBase',
								fnc: 'finalizeEscrowMigration',
								args: [user1, escrowAmount, []],
							});
							assert.equal(messenger.smocked.sendMessage.calls[1][1], expectedData);
							assert.equal(messenger.smocked.sendMessage.calls[1][2], (3e6).toString());
						});

						it('and two events are emitted (ExportedVestingEntries)', async () => {
							const logs = await getDecodedLogs({ hash: txn.tx, contracts: [instance] });
							decodedEventEqual({
								log: logs[0],
								event: 'ExportedVestingEntries',
								emittedFrom: proxy.address,
								args: [user1, escrowAmount, emptyArray],
							});
							decodedEventEqual({
								log: logs[1],
								event: 'ExportedVestingEntries',
								emittedFrom: proxy.address,
								args: [user1, escrowAmount, emptyArray],
							});
						});
					});
				});

				describe('when invoked by a user via the proxy', () => {
					const amount = '99';
					let hash;
					describe('when the user deposits and migrates', () => {
						beforeEach(async () => {
							const { tx: txHash } = await proxyThruTo({
								proxy,
								target: instance,
								fncName: 'depositAndMigrateEscrow',
								from: user1,
								args: [amount, entryIds],
							});
							hash = txHash;
						});

						it('three events are emitted via the proxy', async () => {
							const logs = await getDecodedLogs({ hash, contracts: [instance] });
							decodedEventEqual({
								log: logs[0],
								event: 'ExportedVestingEntries',
								emittedFrom: proxy.address,
								args: [user1, escrowAmount, emptyArray],
							});
							decodedEventEqual({
								log: logs[1],
								event: 'ExportedVestingEntries',
								emittedFrom: proxy.address,
								args: [user1, escrowAmount, emptyArray],
							});
							decodedEventEqual({
								log: logs[2],
								event: 'DepositInitiated',
								emittedFrom: proxy.address,
								args: [user1, user1, amount],
							});
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
						assert.equal(synthetix.smocked.transferFrom.calls[0][0], user1);
						assert.equal(synthetix.smocked.transferFrom.calls[0][1], SynthetixBridgeEscrow);
						assert.equal(synthetix.smocked.transferFrom.calls[0][2].toString(), amount);
					});

					it('and the message is relayed', async () => {
						assert.equal(messenger.smocked.sendMessage.calls.length, 1);
						assert.equal(messenger.smocked.sendMessage.calls[0][0], snxBridgeToBase);
						const expectedData = getDataOfEncodedFncCall({
							contract: 'SynthetixBridgeToBase',
							fnc: 'finalizeRewardDeposit',
							args: [amount],
						});
						assert.equal(messenger.smocked.sendMessage.calls[0][1], expectedData);
						assert.equal(messenger.smocked.sendMessage.calls[0][2], (3e6).toString());
					});

					it('and a RewardDeposit event is emitted', async () => {
						assert.eventEqual(txn, 'RewardDeposit', [user1, amount]);
					});
				});

				describe('when invoked by a user via the proxy', () => {
					let hash;
					const amount = '100';
					beforeEach(async () => {
						const { tx: txHash } = await proxyThruTo({
							proxy,
							target: instance,
							fncName: 'depositReward',
							from: user1,
							args: [amount],
						});
						hash = txHash;
					});

					it('a RewardDeposit event is emitted by the proxy', async () => {
						const logs = await getDecodedLogs({ hash, contracts: [instance] });
						decodedEventEqual({
							log: logs[0],
							event: 'RewardDeposit',
							emittedFrom: proxy.address,
							args: [user1, amount],
						});
					});
				});
			});

			describe('notifyRewardAmount', () => {
				describe('failure modes', () => {
					it('does not work when initiation has been suspended', async () => {
						await instance.suspendInitiation({ from: owner });

						await assert.revert(instance.notifyRewardAmount('1'), 'Initiation deactivated');
					});

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
						assert.equal(messenger.smocked.sendMessage.calls.length, 1);
						assert.equal(messenger.smocked.sendMessage.calls[0][0], snxBridgeToBase);

						const expectedData = getDataOfEncodedFncCall({
							contract: 'SynthetixBridgeToBase',
							fnc: 'finalizeRewardDeposit',
							args: [amount],
						});

						assert.equal(messenger.smocked.sendMessage.calls[0][1], expectedData);
						assert.equal(messenger.smocked.sendMessage.calls[0][2], (3e6).toString());
					});

					it('and a RewardDeposit event is emitted', async () => {
						assert.eventEqual(txn, 'RewardDeposit', [rewardsDistribution, amount]);
					});
				});

				describe('when invoked by the rewardsDistribution viw the proxy', () => {
					const amount = '1000';
					let hash;
					beforeEach(async () => {
						const { tx: txHash } = await proxyThruTo({
							proxy,
							target: instance,
							fncName: 'notifyRewardAmount',
							from: rewardsDistribution,
							args: [amount],
						});
						hash = txHash;
					});

					it('a RewardDeposit event is emitted by the proxy', async () => {
						const logs = await getDecodedLogs({ hash, contracts: [instance] });
						decodedEventEqual({
							log: logs[0],
							event: 'RewardDeposit',
							emittedFrom: proxy.address,
							args: [rewardsDistribution, amount],
						});
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
						messenger.smocked.xDomainMessageSender.will.return.with(() => randomAddress);
						await assert.revert(
							instance.finalizeWithdrawal(user1, 100, {
								from: smockedMessenger,
							}),
							'Only the L2 bridge can invoke'
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
							to: user1,
							amount: finalizeWithdrawalAmount,
						});
					});

					it('then SNX is minted via MintableSynthetix.finalizeWithdrawal', async () => {
						assert.equal(synthetix.smocked.transferFrom.calls.length, 1);
						assert.equal(synthetix.smocked.transferFrom.calls[0][0], SynthetixBridgeEscrow);
						assert.equal(synthetix.smocked.transferFrom.calls[0][1], user1);
						assert.equal(
							synthetix.smocked.transferFrom.calls[0][2].toString(),
							finalizeWithdrawalAmount
						);
					});
				});

				describe('when invoked by the messenger (aka relayer) via the proxy', async () => {
					const finalizeWithdrawalAmount = 100;
					let hash;
					beforeEach('finalizeWithdrawal is called', async () => {
						const { tx: txHash } = await proxyThruTo({
							proxy,
							target: instance,
							fncName: 'finalizeWithdrawal',
							from: smockedMessenger,
							args: [user1, finalizeWithdrawalAmount],
						});
						hash = txHash;
					});

					it('a WithdrawalFinalized event is emitted by the proxy', async () => {
						const logs = await getDecodedLogs({ hash, contracts: [instance] });
						decodedEventEqual({
							log: logs[0],
							event: 'WithdrawalFinalized',
							emittedFrom: proxy.address,
							args: [user1, finalizeWithdrawalAmount],
						});
					});
				});
			});
		});
	});
});
