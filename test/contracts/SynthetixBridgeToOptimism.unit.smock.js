const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { assert } = require('./common');
const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');
// const { addSnapshotBeforeRestoreAfter } = require('./common');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');
const { smockit } = require('@eth-optimism/smock');

const SynthetixBridgeToOptimism = artifacts.require('SynthetixBridgeToOptimism');
// const SynthetixBridgeToBase = artifacts.require('SynthetixBridgeToBase');
// const FakeSynthetixBridgeToOptimism = artifacts.require('FakeSynthetixBridgeToOptimism');

contract('SynthetixBridgeToOptimism (unit tests)', accounts => {
	const [, owner, user1] = accounts;

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: SynthetixBridgeToOptimism.abi,
			ignoreParents: ['Owned', 'MixinResolver', 'MixinSystemSettings'],
			expected: [
				'completeWithdrawal',
				'deposit',
				'migrateBridge',
				'notifyRewardAmount',
				'rewardDeposit',
			],
		});
	});

	describe('when all the deps are mocked', () => {
		// addSnapshotBeforeRestoreAfter();
		let messenger;
		let synthetix;
		let issuer;
		let rewardsDistribution;
		let resolver;
		let snxBridgeToBase;
		beforeEach(async () => {
			messenger = await smockit(artifacts.require('ICrossDomainMessenger').abi);

			// can't use ISynthetix as we need ERC20 functions as well
			synthetix = await smockit(artifacts.require('Synthetix').abi);
			issuer = await smockit(artifacts.require('IIssuer').abi);
			rewardsDistribution = web3.eth.accounts.create().address;
			snxBridgeToBase = web3.eth.accounts.create().address;

			// stub
			synthetix.smocked.transferFrom.will.return.with(() => true);
			synthetix.smocked.balanceOf.will.return.with(() => web3.utils.toWei('1'));
			synthetix.smocked.transfer.will.return.with(() => true);
			messenger.smocked.sendMessage.will.return.with(() => {});

			// now add to address resolver
			resolver = await artifacts.require('AddressResolver').new(owner);
			await resolver.importAddresses(
				[
					'ext:Messenger',
					'Synthetix',
					'Issuer',
					'RewardsDistribution',
					'ovm:SynthetixBridgeToBase',
				].map(toBytes32),
				[
					messenger.address,
					synthetix.address,
					issuer.address,
					rewardsDistribution,
					snxBridgeToBase,
				],
				{ from: owner }
			);
		});

		describe('when the target is deployed', () => {
			let instance;
			beforeEach(async () => {
				instance = await artifacts
					.require('SynthetixBridgeToOptimism')
					.new(owner, resolver.address);

				await instance.setResolverAndSyncCache(resolver.address, { from: owner });
			});

			describe('rewardDeposit', () => {
				describe('failure modes', () => {
					it('does not work when the contract has been deactivated', async () => {
						await instance.migrateBridge(ZERO_ADDRESS, { from: owner });

						await assert.revert(instance.rewardDeposit('1'), 'Function deactivated');
					});
				});

				describe('when invoked by a user', () => {
					let txn;
					let amount;
					beforeEach(async () => {
						amount = '100';
						txn = await instance.rewardDeposit(amount, { from: user1 });
					});

					it('then SNX is transferred from the account to the user', async () => {
						assert.equal(synthetix.smocked.transferFrom.calls[0][0], user1);
						assert.equal(synthetix.smocked.transferFrom.calls[0][1], instance.address);
						assert.equal(synthetix.smocked.transferFrom.calls[0][2].toString(), amount);
					});

					it('and the message is relayed', async () => {
						assert.equal(messenger.smocked.sendMessage.calls.length, 1);
						assert.equal(messenger.smocked.sendMessage.calls[0][0], snxBridgeToBase);

						const expectedData = web3.eth.abi.encodeFunctionCall(
							artifacts
								.require('SynthetixBridgeToBase')
								.abi.find(({ name }) => name === 'mintSecondaryFromDepositForRewards'),
							[amount]
						);

						assert.equal(messenger.smocked.sendMessage.calls[0][1], expectedData);
						assert.equal(messenger.smocked.sendMessage.calls[0][2], (3e6).toString());
					});

					it('and a RewardDepositByAccount event is emitted', async () => {
						assert.eventEqual(txn, 'RewardDepositByAccount', [user1, amount]);
					});
				});
			});

			describe('notifyRewardAmount', () => {
				describe('failure modes', () => {
					// TODO once reverts are fixed in smockit
					it('does not work when not invoked by the rewardDistribution address', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: instance.notifyRewardAmount,
							args: ['1'],
							accounts,
							reason: 'Caller is not RewardsDistribution contract',
							address: rewardsDistribution,
						});

						// TODO
						// await assert.revert(instance.rewardDeposit('1'), 'Function deactivated');
					});
				});

				describe('when invoked by the rewardsDistribution...', () => {});
			});
		});
	});

	// describe('when deploying a mock token', () => {
	// 	before('deploy mock token', async () => {
	// 		({ token: this.token } = await mockToken({
	// 			accounts,
	// 			name: 'Mock Token',
	// 			symbol: 'MCK',
	// 			supply: mockTokenTotalSupply,
	// 		}));
	// 		// transfer 100 tokens to account1
	// 		await this.token.transfer(account1, 100, { from: owner });
	// 	});

	// 	it('has the expected parameters', async () => {
	// 		assert.equal(await this.token.decimals(), 18);
	// 		assert.equal(await this.token.totalSupply(), toWei(mockTokenTotalSupply));
	// 		assert.bnEqual(
	// 			(await this.token.totalSupply()).sub(new BN(100)),
	// 			await this.token.balanceOf(owner)
	// 		);
	// 		assert.equal(await this.token.balanceOf(account1), 100);
	// 	});

	// 	describe('when mocks for Issuer and resolver are added', () => {
	// 		before('deploy a mock issuer contract', async () => {
	// 			this.issuerMock = await artifacts.require('GenericMock').new();

	// 			// now instruct the mock Issuer that debtBalanceOf() must return 0
	// 			await mockGenericContractFnc({
	// 				instance: this.issuerMock,
	// 				mock: 'Issuer',
	// 				fncName: 'debtBalanceOf',
	// 				returns: [0],
	// 			});

	// 			this.resolverMock = await artifacts.require('GenericMock').new();
	// 			// now instruct the mock AddressResolver that getAddress() must return a mock addresss
	// 			await mockGenericContractFnc({
	// 				instance: this.resolverMock,
	// 				mock: 'AddressResolver',
	// 				fncName: 'getAddress',
	// 				returns: [mockAddress],
	// 			});

	// 			this.mintableSynthetixMock = await artifacts.require('MockMintableSynthetix').new();
	// 		});

	// 		it('mocked contracs are deployed', async () => {
	// 			assert.notEqual(this.resolverMock.address, this.issuerMock.address);
	// 		});

	// 		describe('when a FakeSynthetixBridgeToOptimism contract is deployed', () => {
	// 			before('deploy bridge contract', async () => {
	// 				this.synthetixBridgeToOptimism = await FakeSynthetixBridgeToOptimism.new(
	// 					owner,
	// 					this.resolverMock.address,
	// 					this.token.address,
	// 					this.mintableSynthetixMock.address,
	// 					this.issuerMock.address,
	// 					bridge,
	// 					{
	// 						from: deployerAccount,
	// 					}
	// 				);
	// 			});

	// 			before('connect to MockCrossDomainMessenger', async () => {
	// 				const crossDomainMessengerMock = await artifacts.require('MockCrossDomainMessenger');
	// 				const currentAddress = await this.synthetixBridgeToOptimism.crossDomainMessengerMock();
	// 				this.messengerMock = await crossDomainMessengerMock.at(currentAddress);
	// 			});

	// 			it('has the expected parameters', async () => {
	// 				assert.equal(await this.synthetixBridgeToOptimism.activated(), true);
	// 				assert.equal(await this.synthetixBridgeToOptimism.owner(), owner);
	// 				assert.equal(await this.synthetixBridgeToOptimism.resolver(), this.resolverMock.address);
	// 				assert.equal(await this.synthetixBridgeToOptimism.xChainBridge(), bridge);
	// 			});

	// 			describe('bridge calling CrossDomainMessenger.sendMessage via deposit()', () => {
	// 				addSnapshotBeforeRestoreAfter();

	// 				const amount = 100;
	// 				const gasLimit = 3e6;
	// 				before('make a deposit', async () => {
	// 					await this.token.approve(this.synthetixBridgeToOptimism.address, amount, {
	// 						from: account1,
	// 					});
	// 					await this.synthetixBridgeToOptimism.deposit(amount, { from: account1 });
	// 				});

	// 				it('called sendMessage with the expected target address', async () => {
	// 					assert.equal(
	// 						await this.messengerMock.sendMessageCallTarget(),
	// 						await this.synthetixBridgeToOptimism.xChainBridge()
	// 					);
	// 				});

	// 				it('called sendMessage with the expected gasLimit', async () => {
	// 					assert.equal(await this.messengerMock.sendMessageCallGasLimit(), gasLimit);
	// 				});

	// 				it('called sendMessage with the expected message', async () => {
	// 					const synthetixBridgeToOptimism = await SynthetixBridgeToBase.new(
	// 						owner,
	// 						this.resolverMock.address
	// 					);
	// 					assert.equal(
	// 						await this.messengerMock.sendMessageCallMessage(),
	// 						synthetixBridgeToOptimism.contract.methods
	// 							.mintSecondaryFromDeposit(account1, amount)
	// 							.encodeABI()
	// 					);
	// 				});
	// 			});

	// 			describe('a user tries to deposit but has non-zero debt', () => {
	// 				let synthetixBridgeToOptimism;
	// 				before('deploy new bridge contract', async () => {
	// 					const issuerMock = await artifacts.require('GenericMock').new();

	// 					// now instruct the mock Issuer that debtBalanceOf() must return 0
	// 					await mockGenericContractFnc({
	// 						instance: issuerMock,
	// 						mock: 'Issuer',
	// 						fncName: 'debtBalanceOf',
	// 						returns: [1],
	// 					});

	// 					synthetixBridgeToOptimism = await FakeSynthetixBridgeToOptimism.new(
	// 						owner,
	// 						this.resolverMock.address,
	// 						this.token.address,
	// 						this.mintableSynthetixMock.address,
	// 						issuerMock.address,
	// 						bridge,
	// 						{
	// 							from: deployerAccount,
	// 						}
	// 					);
	// 				});

	// 				it('should revert', async () => {
	// 					await assert.revert(
	// 						synthetixBridgeToOptimism.deposit(100, { from: account1 }),
	// 						'Cannot deposit with debt'
	// 					);
	// 				});
	// 			});

	// 			describe('a user tries to deposit within the max limit', () => {
	// 				let depositTx;

	// 				before('user approves and deposits 100 tokens', async () => {
	// 					await this.token.approve(this.synthetixBridgeToOptimism.address, 100, {
	// 						from: account1,
	// 					});
	// 					depositTx = await this.synthetixBridgeToOptimism.deposit(100, { from: account1 });
	// 				});

	// 				it('tranfers the tokens to the bridge contract', async () => {
	// 					assert.equal(await this.token.balanceOf(this.synthetixBridgeToOptimism.address), 100);
	// 					assert.equal(await this.token.balanceOf(account1), 0);
	// 				});

	// 				it('should emit a Deposit event', async () => {
	// 					assert.eventEqual(depositTx, 'Deposit', {
	// 						account: account1,
	// 						amount: 100,
	// 					});
	// 				});
	// 			});

	// 			describe('when completeWithdrawal() is invoked by the right bridge (ovm:SynthetixBridgeToBase)', async () => {
	// 				let completeWithdrawalTx;
	// 				const withdrawalAmount = 100;

	// 				before('user has deposited before withdrawing', async () => {
	// 					await this.token.transfer(account2, 100, { from: owner });
	// 					await this.token.approve(this.synthetixBridgeToOptimism.address, 100, {
	// 						from: account2,
	// 					});
	// 					this.synthetixBridgeToOptimism.deposit(100, { from: account2 });

	// 					completeWithdrawalTx = await this.messengerMock.completeWithdrawal(
	// 						this.synthetixBridgeToOptimism.address,
	// 						account2,
	// 						withdrawalAmount
	// 					);
	// 				});

	// 				it('should transfer the right amount to the withdrawal address', async () => {
	// 					assert.equal(await this.token.balanceOf(account2), withdrawalAmount);
	// 				});

	// 				it('should emit a WithdrawalCompleted event', async () => {
	// 					assert.eventEqual(completeWithdrawalTx, 'WithdrawalCompleted', {
	// 						account: account2,
	// 						amount: withdrawalAmount,
	// 					});
	// 				});
	// 			});

	// 			describe('when migrateBridge is called by the owner', async () => {
	// 				let migrateBridgeTx;

	// 				before('migrateBridge is called', async () => {
	// 					migrateBridgeTx = await this.synthetixBridgeToOptimism.migrateBridge(migratedBridge, {
	// 						from: owner,
	// 					});
	// 				});

	// 				it('should update the token balances', async () => {
	// 					assert.equal(await this.token.balanceOf(this.synthetixBridgeToOptimism.address), 0);
	// 					assert.equal(await this.token.balanceOf(migratedBridge), 100);
	// 				});

	// 				it('should deactivate the deposit functionality', async () => {
	// 					assert.equal(await this.synthetixBridgeToOptimism.activated(), false);
	// 					await assert.revert(
	// 						this.synthetixBridgeToOptimism.deposit(100, { from: account1 }),
	// 						'Function deactivated'
	// 					);
	// 				});

	// 				it('should emit a BridgeMigrated event', async () => {
	// 					assert.eventEqual(migrateBridgeTx, 'BridgeMigrated', {
	// 						oldBridge: this.synthetixBridgeToOptimism.address,
	// 						newBridge: migratedBridge,
	// 						amount: 100,
	// 					});
	// 				});
	// 			});

	// 			describe('modifiers and access permissions', async () => {
	// 				it('should only allow the onwer to call migrateBridge()', async () => {
	// 					await onlyGivenAddressCanInvoke({
	// 						fnc: this.synthetixBridgeToOptimism.migrateBridge,
	// 						args: [account1],
	// 						address: owner,
	// 						accounts,
	// 						reason: 'Only the contract owner may perform this action',
	// 					});
	// 				});
	// 			});
	// 		});
	// 	});
	// });
});
