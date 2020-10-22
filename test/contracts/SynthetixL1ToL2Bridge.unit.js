const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { assert } = require('./common');
const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { addSnapshotBeforeRestoreAfter } = require('./common');
const { mockToken, mockGenericContractFnc } = require('./setup');
const { toWei } = web3.utils;
const BN = require('bn.js');

const SynthetixL1ToL2Bridge = artifacts.require('SynthetixL1ToL2Bridge');
const SynthetixL2ToL1Bridge = artifacts.require('SynthetixL2ToL1Bridge');
const FakeSynthetixL1ToL2Bridge = artifacts.require('FakeSynthetixL1ToL2Bridge');

contract('SynthetixL1ToL2Bridge (unit tests)', accounts => {
	const [deployerAccount, owner, bridge, migratedBridge, account1, account2] = accounts;

	const mockTokenTotalSupply = '1000000';
	const mockAddress = '0x0000000000000000000000000000000000000001';
	const maxDeposit = toWei('5000');

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: SynthetixL1ToL2Bridge.abi,
			ignoreParents: ['Owned', 'MixinResolver', 'MixinSystemSettings'],
			expected: ['deposit', 'completeWithdrawal', 'migrateBridge'],
		});
	});

	describe('when deploying a mock token', () => {
		before('deploy mock token', async () => {
			({ token: this.token } = await mockToken({
				accounts,
				name: 'Mock Token',
				symbol: 'MCK',
				supply: mockTokenTotalSupply,
			}));
			// transfer 100 tokens to account1
			await this.token.transfer(account1, 100, { from: owner });
		});

		it('has the expected parameters', async () => {
			assert.equal(await this.token.decimals(), 18);
			assert.equal(await this.token.totalSupply(), toWei(mockTokenTotalSupply));
			assert.bnEqual(
				(await this.token.totalSupply()).sub(new BN(100)),
				await this.token.balanceOf(owner)
			);
			assert.equal(await this.token.balanceOf(account1), 100);
		});

		describe('when mocks for Issuer and resolver are added', () => {
			before('deploy a mock issuer contract', async () => {
				this.issuerMock = await artifacts.require('GenericMock').new();

				// now instruct the mock Issuer that debtBalanceOf() must return 0
				await mockGenericContractFnc({
					instance: this.issuerMock,
					mock: 'Issuer',
					fncName: 'debtBalanceOf',
					returns: [0],
				});

				this.resolverMock = await artifacts.require('GenericMock').new();
				// now instruct the mock AddressResolver that getAddress() must return a mock addresss
				await mockGenericContractFnc({
					instance: this.resolverMock,
					mock: 'AddressResolver',
					fncName: 'getAddress',
					returns: [mockAddress],
				});

				this.mintableSynthetixMock = await artifacts.require('MockMintableSynthetix').new();
			});

			it('mocked contracs are deployed', async () => {
				assert.notEqual(this.resolverMock.address, this.issuerMock.address);
			});

			describe('when a FakeSynthetixL1ToL2Bridge contract is deployed', () => {
				before('deploy bridge contract', async () => {
					this.synthetixL1ToL2Bridge = await FakeSynthetixL1ToL2Bridge.new(
						owner,
						this.resolverMock.address,
						this.token.address,
						this.mintableSynthetixMock.address,
						this.issuerMock.address,
						bridge,
						{
							from: deployerAccount,
						}
					);
				});

				before('connect to MockCrossDomainMessenger', async () => {
					const crossDomainMessengerMock = await artifacts.require('MockCrossDomainMessenger');
					const currentAddress = await this.synthetixL1ToL2Bridge.crossDomainMessengerMock();
					this.messengerMock = await crossDomainMessengerMock.at(currentAddress);
				});

				it('has the expected parameters', async () => {
					assert.bnEqual(await this.synthetixL1ToL2Bridge.maximumDeposit(), maxDeposit);
					assert.equal(await this.synthetixL1ToL2Bridge.activated(), true);
					assert.equal(await this.synthetixL1ToL2Bridge.owner(), owner);
					assert.equal(await this.synthetixL1ToL2Bridge.resolver(), this.resolverMock.address);
					assert.equal(await this.synthetixL1ToL2Bridge.xChainBridge(), bridge);
				});

				describe('bridge calling CrossDomainMessenger.sendMessage via deposit()', () => {
					addSnapshotBeforeRestoreAfter();

					const amount = 100;
					const gasLimit = 3e6;
					before('make a deposit', async () => {
						await this.token.approve(this.synthetixL1ToL2Bridge.address, amount, {
							from: account1,
						});
						await this.synthetixL1ToL2Bridge.deposit(amount, { from: account1 });
					});

					it('called sendMessage with the expected target address', async () => {
						assert.equal(
							await this.messengerMock.sendMessageCallTarget(),
							await this.synthetixL1ToL2Bridge.xChainBridge()
						);
					});

					it('called sendMessage with the expected gasLimit', async () => {
						assert.equal(await this.messengerMock.sendMessageCallGasLimit(), gasLimit);
					});

					it('called sendMessage with the expected message', async () => {
						const synthetixL2ToL1Bridge = await SynthetixL2ToL1Bridge.new(
							owner,
							this.resolverMock.address
						);
						assert.equal(
							await this.messengerMock.sendMessageCallMessage(),
							synthetixL2ToL1Bridge.contract.methods
								.mintSecondaryFromDeposit(account1, amount)
								.encodeABI()
						);
					});
				});

				describe('a user tries to deposit an amount above the max limit', () => {
					it('should revert', async () => {
						const exceedMaxDeposit = (await this.synthetixL1ToL2Bridge.maximumDeposit()).add(
							new BN(1)
						);
						await assert.revert(
							this.synthetixL1ToL2Bridge.deposit(exceedMaxDeposit, { from: owner }),
							'Cannot deposit more than the max'
						);
					});
				});

				describe('a user tries to deposit but has non-zero debt', () => {
					let synthetixL1ToL2Bridge;
					before('deploy new bridge contract', async () => {
						const issuerMock = await artifacts.require('GenericMock').new();

						// now instruct the mock Issuer that debtBalanceOf() must return 0
						await mockGenericContractFnc({
							instance: issuerMock,
							mock: 'Issuer',
							fncName: 'debtBalanceOf',
							returns: [1],
						});

						synthetixL1ToL2Bridge = await FakeSynthetixL1ToL2Bridge.new(
							owner,
							this.resolverMock.address,
							this.token.address,
							this.mintableSynthetixMock.address,
							issuerMock.address,
							bridge,
							{
								from: deployerAccount,
							}
						);
					});

					it('should revert', async () => {
						await assert.revert(
							synthetixL1ToL2Bridge.deposit(100, { from: account1 }),
							'Cannot deposit with debt'
						);
					});
				});

				describe('a user tries to deposit within the max limit', () => {
					let depositTx;

					before('user approves and deposits 100 tokens', async () => {
						await this.token.approve(this.synthetixL1ToL2Bridge.address, 100, { from: account1 });
						depositTx = await this.synthetixL1ToL2Bridge.deposit(100, { from: account1 });
					});

					it('tranfers the tokens to the bridge contract', async () => {
						assert.equal(await this.token.balanceOf(this.synthetixL1ToL2Bridge.address), 100);
						assert.equal(await this.token.balanceOf(account1), 0);
					});

					it('should emit a Deposit event', async () => {
						assert.eventEqual(depositTx, 'Deposit', {
							account: account1,
							amount: 100,
						});
					});
				});

				describe('when completeWithdrawal() is invoked by the right bridge (alt:SynthetixOptimisticBridge)', async () => {
					let completeWithdrawalTx;
					const withdrawalAmount = 100;

					before('user has deposited before withdrawing', async () => {
						await this.token.transfer(account2, 100, { from: owner });
						await this.token.approve(this.synthetixL1ToL2Bridge.address, 100, { from: account2 });
						this.synthetixL1ToL2Bridge.deposit(100, { from: account2 });

						completeWithdrawalTx = await this.messengerMock.completeWithdrawal(
							this.synthetixL1ToL2Bridge.address,
							account2,
							withdrawalAmount
						);
					});

					it('should transfer the right amount to the withdrawal address', async () => {
						assert.equal(await this.token.balanceOf(account2), withdrawalAmount);
					});

					it('should emit a WithdrawalCompleted event', async () => {
						assert.eventEqual(completeWithdrawalTx, 'WithdrawalCompleted', {
							account: account2,
							amount: withdrawalAmount,
						});
					});
				});

				describe('when migrateBridge is called by the owner', async () => {
					let migrateBridgeTx;

					before('migrateBridge is called', async () => {
						migrateBridgeTx = await this.synthetixL1ToL2Bridge.migrateBridge(migratedBridge, {
							from: owner,
						});
					});

					it('should update the token balances', async () => {
						assert.equal(await this.token.balanceOf(this.synthetixL1ToL2Bridge.address), 0);
						assert.equal(await this.token.balanceOf(migratedBridge), 100);
					});

					it('should deactivate the deposit functionality', async () => {
						assert.equal(await this.synthetixL1ToL2Bridge.activated(), false);
						await assert.revert(
							this.synthetixL1ToL2Bridge.deposit(100, { from: account1 }),
							'Function deactivated'
						);
					});

					it('should emit a BridgeMigrated event', async () => {
						assert.eventEqual(migrateBridgeTx, 'BridgeMigrated', {
							oldBridge: this.synthetixL1ToL2Bridge.address,
							newBridge: migratedBridge,
							amount: 100,
						});
					});
				});

				describe('modifiers and access permissions', async () => {
					it('should only allow the onwer to call migrateBridge()', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: this.synthetixL1ToL2Bridge.migrateBridge,
							args: [account1],
							address: owner,
							accounts,
							reason: 'Only the contract owner may perform this action',
						});
					});
				});
			});
		});
	});
});
