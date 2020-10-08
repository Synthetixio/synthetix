const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { assert } = require('./common');
const { ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { mockToken, mockGenericContractFnc } = require('./setup');
const { toWei, toBN } = web3.utils;
const { toUnit } = require('../utils')();
const helper = require('./TradingRewards.helper');

const SecondaryDeposit = artifacts.require('SecondaryDeposit');
const FakeSecondaryDeposit = artifacts.require('FakeSecondaryDeposit');

contract('SecondaryDeposit (unit tests)', accounts => {
	const [deployerAccount, owner, account1] = accounts;

	const mockTokenTotalSupply = '1000000';
	// const zeroAddress = '0x0000000000000000000000000000000000000000';
	const mockAddress = '0x0000000000000000000000000000000000000001';
	const maxDeposit = toUnit('5000');
	let mock;
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
			await this.token.transfer(account1, 100, { from: owner });
		});

		it('has the expected parameters', async () => {
			assert.equal('18', await this.token.decimals());
			assert.equal(toWei(mockTokenTotalSupply), await this.token.totalSupply());
			assert.equal(100, await this.token.balanceOf(account1));
		});

		describe('when a mock for Issuer is added', () => {
			beforeEach(async () => {
				mock = await artifacts.require('GenericMock').new();

				// now instruct the mock Issuer that debtBalanceOf must return 0
				await mockGenericContractFnc({
					instance: mock,
					mock: 'Issuer',
					fncName: 'debtBalanceOf',
					returns: 0,
				});

				describe('when a FakeSecondaryDeposit contract is deployed', () => {
					before('deploy deposit contract', async () => {
						this.deposit = await FakeSecondaryDeposit.new(
							owner,
							mockAddress,
							this.token.address,
							mock.address,
							{
								from: deployerAccount,
							}
						);
					});

					it('has the expected parameters', async () => {
						assert.bnEqual(await this.deposit.maximumDeposit(), 0);
						assert.equal(owner, await this.deposit.owner());
						assert.equal(mockAddress, await this.deposit.resolver());
					});

					describe('a user tries to deposit', () => {
						before('user approves and deposits 100 tokens', async () => {
							await this.token.approve(this.deposit.address, 100, { from: account1 });
							depositTx = await this.deposit.deposit(100, { from: account1 });
						});

						it('tranfers the tokens to the deposit contract', async () => {
							assert.equal(100, await this.token.balanceOf(this.deposit.address));
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
});
