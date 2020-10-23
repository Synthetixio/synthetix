const { artifacts, contract, web3 } = require('@nomiclabs/buidler');
const { assert } = require('./common');
const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { mockGenericContractFnc } = require('./setup');
const { toWei } = web3.utils;
const BN = require('bn.js');

const MintableSynthetix = artifacts.require('MintableSynthetix');
const FakeMintableSynthetix = artifacts.require('FakeMintableSynthetix');

contract('MintableSynthetix (unit tests)', accounts => {
	const [owner, synthetixBridgeToBase, mockAddress, account1] = accounts;

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: MintableSynthetix.abi,
			ignoreParents: ['Synthetix'],
			expected: ['mintSecondary', 'burnSecondary'],
		});
	});

	describe('initial setup', () => {
		let resolverMock;
		let tokenStateMock;
		let mintableSynthetix;

		const SYNTHETIX_TOTAL_SUPPLY = toWei('100000000');
		before('deploy a new instance', async () => {
			resolverMock = await artifacts.require('GenericMock').new();
			await mockGenericContractFnc({
				instance: resolverMock,
				mock: 'AddressResolver',
				fncName: 'getAddress',
				returns: [synthetixBridgeToBase],
			});

			tokenStateMock = await artifacts.require('GenericMock').new();
			await mockGenericContractFnc({
				instance: tokenStateMock,
				mock: 'TokenState',
				fncName: 'setBalanceOf',
				returns: [],
			});

			await mockGenericContractFnc({
				instance: tokenStateMock,
				mock: 'TokenState',
				fncName: 'balanceOf',
				returns: [1000],
			});

			mintableSynthetix = await FakeMintableSynthetix.new(
				mockAddress,
				tokenStateMock.address,
				owner,
				SYNTHETIX_TOTAL_SUPPLY,
				resolverMock.address,
				{
					from: owner,
				}
			);
		});

		it('should set constructor params on deployment', async () => {
			assert.equal(await mintableSynthetix.proxy(), mockAddress);
			assert.equal(await mintableSynthetix.tokenState(), tokenStateMock.address);
			assert.equal(await mintableSynthetix.owner(), owner);
			assert.equal(await mintableSynthetix.totalSupply(), SYNTHETIX_TOTAL_SUPPLY);
			assert.equal(await mintableSynthetix.resolver(), resolverMock.address);
		});

		describe('access permissions', async () => {
			const amount = 100;
			it('should only allow SynthetixBridgeToBase  to call mintSecondary()', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: mintableSynthetix.mintSecondary,
					args: [account1, amount],
					address: synthetixBridgeToBase,
					accounts,
					reason: 'Can only be invoked by the SynthetixBridgeToBase contract',
				});
			});

			it('should only allow SynthetixBridgeToBase to call burnSecondary()', async () => {
				await onlyGivenAddressCanInvoke({
					fnc: mintableSynthetix.burnSecondary,
					args: [account1, amount],
					address: synthetixBridgeToBase,
					accounts,
					reason: 'Can only be invoked by the SynthetixBridgeToBase contract',
				});
			});
		});

		describe('mintSecondary()', async () => {
			const amount = 100;
			before('when synthetixBridgeToBase calls mintSecondary()', async () => {
				await mintableSynthetix.mintSecondary(account1, amount, {
					from: synthetixBridgeToBase,
				});
			});

			it('should increase the total supply', async () => {
				const newSupply = new BN(SYNTHETIX_TOTAL_SUPPLY).add(new BN(amount));
				assert.bnEqual(await mintableSynthetix.totalSupply(), newSupply);
			});

			it('should invoke emitTransfer', async () => {
				assert.equal(await mintableSynthetix.from(), mintableSynthetix.address);
				assert.equal(await mintableSynthetix.to(), account1);
				assert.equal(await mintableSynthetix.value(), amount);
			});
		});

		describe('burnSecondary()', async () => {
			const amount = 100;
			before('when SynthetixBridgeToBase calls burnSecondary()', async () => {
				await mintableSynthetix.burnSecondary(account1, amount, {
					from: synthetixBridgeToBase,
				});
			});

			it('should decrease the total supply', async () => {
				assert.bnEqual(await mintableSynthetix.totalSupply(), SYNTHETIX_TOTAL_SUPPLY);
			});

			it('should invoke emitTransfer', async () => {
				assert.equal(await mintableSynthetix.from(), account1);
				assert.equal(await mintableSynthetix.to(), '0x0000000000000000000000000000000000000000');
				assert.equal(await mintableSynthetix.value(), amount);
			});
		});
	});
});
