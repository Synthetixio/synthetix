const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { assert } = require('./common');
const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { mockToken, mockGenericContractFnc } = require('./setup');
const { toWei } = web3.utils;
const { toUnit } = require('../utils')();
const helper = require('./TradingRewards.helper');
const BN = require('bn.js');

const SecondaryDeposit = artifacts.require('SecondaryDeposit');
const FakeSecondaryDeposit = artifacts.require('FakeSecondaryDeposit');

const { toBytes32 } = require('../..');

contract('SecondaryDeposit (unit tests)', accounts => {
	const [deployerAccount, owner, account1] = accounts;

	const mockTokenTotalSupply = '1000000';
	const mockAddress = '0x0000000000000000000000000000000000000001';
	const maxDeposit = toWei('5000');
	let depositTx;

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: SecondaryDeposit.abi,
			ignoreParents: ['Owned', 'MixinResolver', 'MixinSystemSettings'],
			expected: [
				'deposit',
				'initiateWithdrawal',
				'mintSecondaryFromDeposit',
				'completeWithdrawal',
				'migrateDeposit',
			],
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
			helper.incrementExpectedBalance(account1, mockTokenTotalSupply);
			// transfer 100 tokens to account1
			await this.token.transfer(account1, 100, { from: owner });
		});

		it('has the expected parameters', async () => {
			assert.equal('18', await this.token.decimals());
			assert.equal(toWei(mockTokenTotalSupply), await this.token.totalSupply());
			assert.bnEqual(
				(await this.token.totalSupply()).sub(new BN(100)),
				await this.token.balanceOf(owner)
			);
			assert.equal(100, await this.token.balanceOf(account1));
		});

		describe('when mocks for Issuer and resolver are added', () => {
			beforeEach('deploy a mock issuer contract', async () => {
				this.issuerMock = await artifacts.require('GenericMock').new();

				// now instruct the mock Issuer that debtBalanceOf() must return 0
				await mockGenericContractFnc({
					instance: this.issuerMock,
					mock: 'Issuer',
					fncName: 'debtBalanceOf',
					returns: [0],
				});

				this.resolverMock = await artifacts.require('GenericMock').new();

				// now instruct the mock Issuer that debtBalanceOf() must return 0
				await mockGenericContractFnc({
					instance: this.resolverMock,
					mock: 'AddressResolver',
					fncName: 'getAddress',
					returns: [mockAddress],
				});
			});

			it('mocked contracs are deployed', async () => {
				assert.notEqual(this.resolverMock.address, this.issuerMock.address);
			});

			describe('when a FakeSecondaryDeposit contract is deployed', () => {
				before('deploy deposit contract', async () => {
					this.secondaryDeposit = await FakeSecondaryDeposit.new(
						owner,
						this.resolverMock.address,
						this.token.address,
						this.issuerMock.address,
						{
							from: deployerAccount,
						}
					);
				});

				it('has the expected parameters', async () => {
					assert.bnEqual(await this.secondaryDeposit.maximumDeposit(), maxDeposit);
					assert.equal(owner, await this.secondaryDeposit.owner());
					// assert.equal(this.resolverMock.address, await this.secondaryDeposit.resolver());
				});

				describe('a user tries to deposit', () => {
					before('user approves and deposits 100 tokens', async () => {
						await this.token.approve(this.secondaryDeposit.address, 100, { from: account1 });
						depositTx = await this.secondaryDeposit.deposit(100, { from: account1 });
					});

					it('tranfers the tokens to the deposit contract', async () => {
						assert.equal(100, await this.token.balanceOf(this.secondaryDeposit.address));
						assert.equal(0, await this.token.balanceOf(account1));
					});

					it('tranfers the tokens to the deposit contract', async () => {
						assert.eventEqual(depositTx, 'Deposit', {
							account: account1,
							amount: 100,
						});
					});
				});
			});
		});
	});
});
