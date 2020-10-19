const { artifacts, contract } = require('@nomiclabs/buidler');
const { assert } = require('./common');
const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { mockGenericContractFnc } = require('./setup');
const BN = require('bn.js');

const SecondaryWithdrawal = artifacts.require('SecondaryWithdrawal');
const SecondaryDeposit = artifacts.require('SecondaryDeposit');
const FakeSecondaryWithdrawal = artifacts.require('FakeSecondaryWithdrawal');

contract('SecondaryWithdrawal (unit tests)', accounts => {
	const [owner, companion, account1] = accounts;

	const mockAddress = '0x0000000000000000000000000000000000000001';

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: SecondaryWithdrawal.abi,
			ignoreParents: ['Owned', 'MixinResolver', 'MixinSystemSettings'],
			expected: ['initiateWithdrawal', 'mintSecondaryFromDeposit'],
		});
	});

	describe('when deploying a mock token', () => {
		describe('when mock for resolver is added', () => {
			before('deploy a mock issuer contract', async () => {
				this.resolverMock = await artifacts.require('GenericMock').new();
				// now instruct the mock AddressResolver that getAddress() must return a mock addresss
				await mockGenericContractFnc({
					instance: this.resolverMock,
					mock: 'AddressResolver',
					fncName: 'getAddress',
					returns: [mockAddress],
				});

				this.mintableSynthetixMock = await artifacts.require('FakeMintableSynthetix').new();
			});

			it('contracs are deployed', async () => {
				assert.notEqual(this.resolverMock.address, 0);
				assert.notEqual(this.mintableSynthetixMock.address, 0);
			});

			describe('when a FakeSecondaryWithdrawal contract is deployed', () => {
				before('deploy withdrawal contract', async () => {
					this.secondaryWithdrawal = await FakeSecondaryWithdrawal.new(
						owner,
						this.resolverMock.address,
						this.mintableSynthetixMock.address,
						companion,
						{
							from: owner,
						}
					);
				});

				before('connect to CrossDomainMessengerMock', async () => {
					const crossDomainMessengerMock = await artifacts.require('CrossDomainMessengerMock');
					const currentAddress = await this.secondaryWithdrawal.crossDomainMessengerMock();
					this.messengerMock = await crossDomainMessengerMock.at(currentAddress);
				});

				it('has the expected parameters', async () => {
					assert.equal(owner, await this.secondaryWithdrawal.owner());
					assert.equal(this.resolverMock.address, await this.secondaryWithdrawal.resolver());
					assert.equal(companion, await this.secondaryWithdrawal.xChainCompanion());
				});

				describe('a user initiates a withdrawal', () => {
					let withdrawalTx;
					const amount = 100;
					before('user tries to withdraw 100 tokens', async () => {
						withdrawalTx = await this.secondaryWithdrawal.initiateWithdrawal(amount, {
							from: account1,
						});
					});

					it('should call the burnSecondary() function in MintbaleSynthetix (check mock side effects)', async () => {
						assert.equal(account1, await this.mintableSynthetixMock.burnSecondaryCallAccount());
						assert.equal(amount, await this.mintableSynthetixMock.burnSecondaryCallAmount());
					});

					it('should emit a WithdrawalInitiated event', async () => {
						assert.eventEqual(withdrawalTx, 'WithdrawalInitiated', {
							account: account1,
							amount: amount,
						});
					});

					it('called sendMessage with the expected target address', async () => {
						assert.equal(
							await this.messengerMock.sendMessageCallTarget(),
							await this.secondaryWithdrawal.xChainCompanion()
						);
					});

					it('called sendMessage with the expected gasLimit', async () => {
						assert.equal(await this.messengerMock.sendMessageCallGasLimit(), 3e6);
					});

					it('called sendMessage with the expected message', async () => {
						const secondaryDeposit = await SecondaryDeposit.new(owner, this.resolverMock.address);
						assert.equal(
							await this.messengerMock.sendMessageCallMessage(),
							secondaryDeposit.contract.methods.completeWithdrawal(account1, amount).encodeABI()
						);
					});
				});

				describe('when invoked by its companion', async () => {
					let mintSecondaryTx;
					const mintSecondaryAmount = 100;

					before('mintSecondaryFromDeposit is called', async () => {
						mintSecondaryTx = await this.messengerMock.mintSecondaryFromDeposit(
							this.secondaryWithdrawal.address,
							account1,
							mintSecondaryAmount
						);
					});

					it('should emit a MintedSecondary event', async () => {
						assert.eventEqual(mintSecondaryTx, 'MintedSecondary', {
							account: account1,
							amount: mintSecondaryAmount,
						});
					});

					it('called Synthetix.mintSecondaryFromDeposit with the expected parameters', async () => {
						assert.equal(await this.mintableSynthetixMock.mintSecondaryCallAccount(), account1);
						assert.bnEqual(
							await this.mintableSynthetixMock.mintSecondaryCallAmount(),
							new BN(mintSecondaryAmount)
						);
					});
				});

				describe('modifiers and access permissions', async () => {
					it('should only allow the relayer to call mintSecondaryFromDeposit()', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: this.secondaryWithdrawal.mintSecondaryFromDeposit,
							args: [account1, 100],
							accounts,
							reason: 'Only the relayer can call this',
						});
					});

					it('should only allow the companion to invoke mintSecondaryFromDeposit()', async () => {
						// create a messenger mock with a random address as the companion
						const crossDomainMessengerMock = await artifacts
							.require('CrossDomainMessengerMock')
							.new(mockAddress);
						it('should revert when the original msg sender is not the companion ', async () => {
							await assert.revert(
								crossDomainMessengerMock.mintSecondaryFromDeposit(
									this.secondaryWithdrawal.address,
									account1,
									100
								),
								'Only deposit contract can invoke'
							);
						});
					});
				});
			});
		});
	});
});
