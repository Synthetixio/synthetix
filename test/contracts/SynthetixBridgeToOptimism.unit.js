const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { assert } = require('./common');
const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');
const { smockit } = require('@eth-optimism/smock');

const SynthetixBridgeToOptimism = artifacts.require('SynthetixBridgeToOptimism');

contract('SynthetixBridgeToOptimism (unit tests)', accounts => {
	const [owner, user1] = accounts;

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: SynthetixBridgeToOptimism.abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: [
				'completeWithdrawal',
				'deposit',
				'migrateBridge',
				'notifyRewardAmount',
				'rewardDeposit',
			],
		});
	});

	const getDataOfEncodedFncCall = ({ fnc, args = [] }) =>
		web3.eth.abi.encodeFunctionCall(
			artifacts.require('SynthetixBridgeToBase').abi.find(({ name }) => name === fnc),
			args
		);

	describe('when all the deps are mocked', () => {
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
			rewardsDistribution = accounts[4];
			snxBridgeToBase = accounts[5];

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

		beforeEach(async () => {
			// stubs
			synthetix.smocked.transferFrom.will.return.with(() => true);
			synthetix.smocked.balanceOf.will.return.with(() => web3.utils.toWei('1'));
			synthetix.smocked.transfer.will.return.with(() => true);
			messenger.smocked.sendMessage.will.return.with(() => {});
			issuer.smocked.debtBalanceOf.will.return.with(() => '0');
		});

		describe('when the target is deployed', () => {
			let instance;
			beforeEach(async () => {
				instance = await artifacts
					.require('SynthetixBridgeToOptimism')
					.new(owner, resolver.address);

				await instance.setResolverAndSyncCache(resolver.address, { from: owner });
			});

			describe('deposit', () => {
				describe('failure modes', () => {
					it('does not work when the contract has been deactivated', async () => {
						await instance.migrateBridge(ZERO_ADDRESS, { from: owner });

						await assert.revert(instance.deposit('1'), 'Function deactivated');
					});

					it('does not work when user has any debt', async () => {
						issuer.smocked.debtBalanceOf.will.return.with(() => '1');
						await assert.revert(instance.deposit('1'), 'Cannot deposit with debt');
					});
				});

				describe('when invoked by a user', () => {
					let txn;
					let amount;
					beforeEach(async () => {
						amount = '99';
						txn = await instance.deposit(amount, { from: user1 });
					});

					it('then SNX is transferred from the user to the deposit contract', async () => {
						assert.equal(synthetix.smocked.transferFrom.calls[0][0], user1);
						assert.equal(synthetix.smocked.transferFrom.calls[0][1], instance.address);
						assert.equal(synthetix.smocked.transferFrom.calls[0][2].toString(), amount);
					});

					it('and the message is relayed', async () => {
						assert.equal(messenger.smocked.sendMessage.calls.length, 1);
						assert.equal(messenger.smocked.sendMessage.calls[0][0], snxBridgeToBase);
						const expectedData = getDataOfEncodedFncCall({
							fnc: 'mintSecondaryFromDeposit',
							args: [user1, amount],
						});

						assert.equal(messenger.smocked.sendMessage.calls[0][1], expectedData);
						assert.equal(messenger.smocked.sendMessage.calls[0][2], (3e6).toString());
					});

					it('and a Deposit event is emitted', async () => {
						assert.eventEqual(txn, 'Deposit', [user1, amount]);
					});
				});
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
						const expectedData = getDataOfEncodedFncCall({
							fnc: 'mintSecondaryFromDepositForRewards',
							args: [amount],
						});

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

				describe('when invoked by the rewardsDistribution', () => {
					let txn;
					let amount;
					beforeEach(async () => {
						amount = '1000';
						txn = await instance.notifyRewardAmount(amount, { from: rewardsDistribution });
					});

					it('then the message is relayed', async () => {
						assert.equal(messenger.smocked.sendMessage.calls.length, 1);
						assert.equal(messenger.smocked.sendMessage.calls[0][0], snxBridgeToBase);

						const expectedData = getDataOfEncodedFncCall({
							fnc: 'mintSecondaryFromDepositForRewards',
							args: [amount],
						});

						assert.equal(messenger.smocked.sendMessage.calls[0][1], expectedData);
						assert.equal(messenger.smocked.sendMessage.calls[0][2], (3e6).toString());
					});

					it('and a RewardDepositByAccount event is emitted', async () => {
						assert.eventEqual(txn, 'RewardDeposit', [amount]);
					});
				});
			});

			describe('migrateBridge', () => {
				describe('failure modes', () => {
					it('does not work when not invoked by the owner', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: instance.migrateBridge,
							args: [accounts[7]],
							accounts,
							reason: 'Only the contract owner may perform this action',
							address: owner,
						});
					});
				});

				it('initially activated is true', async () => {
					assert.equal(await instance.activated(), true);
				});

				describe('when invoked by the owner', () => {
					let txn;
					let newAccount;
					let amount;
					beforeEach(async () => {
						newAccount = accounts[7];
						amount = '999';
						synthetix.smocked.balanceOf.will.return.with(address =>
							address === instance.address ? amount : '0'
						);
						txn = await instance.migrateBridge(newAccount, { from: owner });
					});

					it('then all of the contracts SNX is transferred to the new account', async () => {
						assert.equal(synthetix.smocked.transfer.calls[0][0], newAccount);
						assert.equal(synthetix.smocked.transfer.calls[0][1].toString(), amount);
					});

					it('and activated is false', async () => {
						assert.equal(await instance.activated(), false);
					});

					it('and a BridgeMigrated event is emitted', async () => {
						assert.eventEqual(txn, 'BridgeMigrated', [instance.address, newAccount, amount]);
					});
				});
			});
		});
	});
});
