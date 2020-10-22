const { artifacts, contract } = require('@nomiclabs/buidler');
const { assert } = require('./common');
const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { mockGenericContractFnc } = require('./setup');
const BN = require('bn.js');

const SynthetixL1ToL2Bridge = artifacts.require('SynthetixL1ToL2Bridge');
const SynthetixL2ToL1Bridge = artifacts.require('SynthetixL2ToL1Bridge');
const FakeSynthetixL2ToL1Bridge = artifacts.require('FakeSynthetixL2ToL1Bridge');

contract('SynthetixL2ToL1Bridge (unit tests)', accounts => {
	const [owner, bridge, account1] = accounts;

	const mockAddress = '0x0000000000000000000000000000000000000001';

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: SynthetixL2ToL1Bridge.abi,
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

				this.mintableSynthetixMock = await artifacts.require('MockMintableSynthetix').new();
			});

			it('contracs are deployed', async () => {
				assert.notEqual(this.resolverMock.address, 0);
				assert.notEqual(this.mintableSynthetixMock.address, 0);
			});

			describe('when a SynthetixL2ToL1Bridge contract is deployed', () => {
				before('deploy bridge contract', async () => {
					this.synthetixL2ToL1Bridge = await FakeSynthetixL2ToL1Bridge.new(
						owner,
						this.resolverMock.address,
						this.mintableSynthetixMock.address,
						bridge,
						{
							from: owner,
						}
					);
				});

				before('connect to CrossDomainMessengerMock', async () => {
					const crossDomainMessengerMock = await artifacts.require('MockCrossDomainMessenger');
					const currentAddress = await this.synthetixL2ToL1Bridge.crossDomainMessengerMock();
					this.messengerMock = await crossDomainMessengerMock.at(currentAddress);
				});

				it('has the expected parameters', async () => {
					assert.equal(await this.synthetixL2ToL1Bridge.owner(), owner);
					assert.equal(await this.synthetixL2ToL1Bridge.resolver(), this.resolverMock.address);
					assert.equal(await this.synthetixL2ToL1Bridge.xChainBridge(), bridge);
				});

				describe('a user initiates a withdrawal', () => {
					let withdrawalTx;
					const amount = 100;
					const gasLimit = 3e6;
					before('user tries to withdraw 100 tokens', async () => {
						withdrawalTx = await this.synthetixL2ToL1Bridge.initiateWithdrawal(amount, {
							from: account1,
						});
					});

					it('should call the burnSecondary() function in MintbaleSynthetix (check mock side effects)', async () => {
						assert.equal(await this.mintableSynthetixMock.burnSecondaryCallAccount(), account1);
						assert.equal(await this.mintableSynthetixMock.burnSecondaryCallAmount(), amount);
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
							await this.synthetixL2ToL1Bridge.xChainBridge()
						);
					});

					it('called sendMessage with the expected gasLimit', async () => {
						assert.equal(await this.messengerMock.sendMessageCallGasLimit(), gasLimit);
					});

					it('called sendMessage with the expected message', async () => {
						const synthetixL1ToL2Bridge = await SynthetixL1ToL2Bridge.new(
							owner,
							this.resolverMock.address
						);
						assert.equal(
							await this.messengerMock.sendMessageCallMessage(),
							synthetixL1ToL2Bridge.contract.methods
								.completeWithdrawal(account1, amount)
								.encodeABI()
						);
					});
				});

				describe('when invoked by the bridge on the other layer', async () => {
					let mintSecondaryTx;
					const mintSecondaryAmount = 100;

					before('mintSecondaryFromDeposit is called', async () => {
						mintSecondaryTx = await this.messengerMock.mintSecondaryFromDeposit(
							this.synthetixL2ToL1Bridge.address,
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
							fnc: this.synthetixL2ToL1Bridge.mintSecondaryFromDeposit,
							args: [account1, 100],
							accounts,
							reason: 'Only the relayer can call this',
						});
					});

					it('should only allow the  bridge to invoke mintSecondaryFromDeposit()', async () => {
						// create a messenger mock with a random address as the bridge on L1
						const crossDomainMessengerMock = await artifacts
							.require('CrossDomainMessengerMock')
							.new(mockAddress);
						it('should revert when the original msg sender is not the right bridge ', async () => {
							await assert.revert(
								crossDomainMessengerMock.mintSecondaryFromDeposit(
									this.synthetixL2ToL1Bridge.address,
									account1,
									100
								),
								'Only bridge contract can invoke'
							);
						});
					});
				});
			});
		});
	});
});
