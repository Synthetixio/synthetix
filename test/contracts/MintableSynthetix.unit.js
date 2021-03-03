const { artifacts, contract, web3 } = require('hardhat');
const { assert } = require('./common');
const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const { toWei, toChecksumAddress } = web3.utils;
const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');
const BN = require('bn.js');
const { smockit } = require('@eth-optimism/smock');

const MintableSynthetix = artifacts.require('MintableSynthetix');

contract('MintableSynthetix (unit tests) @ovm-skip', accounts => {
	const [owner, synthetixBridgeToBase, user1, mockAddress] = accounts;

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: MintableSynthetix.abi,
			ignoreParents: ['BaseSynthetix'],
			expected: [],
		});
	});

	describe('initial setup, smock all deps', () => {
		let resolver;
		let tokenState;
		let proxy;
		let rewardsDistribution;
		let systemStatus;
		const SYNTHETIX_TOTAL_SUPPLY = toWei('100000000');

		beforeEach(async () => {
			tokenState = await smockit(artifacts.require('TokenState').abi);
			proxy = await smockit(artifacts.require('Proxy').abi);
			rewardsDistribution = await smockit(artifacts.require('IRewardsDistribution').abi);
			resolver = await artifacts.require('AddressResolver').new(owner);
			systemStatus = await artifacts.require('SystemStatus').new(owner);
			await resolver.importAddresses(
				[
					'SynthetixBridgeToBase',
					'SynthetixState',
					'SystemStatus',
					'Exchanger',
					'Issuer',
					'SupplySchedule',
					'RewardsDistribution',
				].map(toBytes32),
				[
					synthetixBridgeToBase,
					tokenState.address,
					systemStatus.address,
					mockAddress,
					mockAddress,
					mockAddress,
					rewardsDistribution.address,
				],
				{ from: owner }
			);
		});

		beforeEach(async () => {
			// stubs
			tokenState.smocked.setBalanceOf.will.return.with(() => {});
			tokenState.smocked.balanceOf.will.return.with(() => web3.utils.toWei('1'));
			proxy.smocked._emit.will.return.with(() => {});
			rewardsDistribution.smocked.distributeRewards.will.return.with(() => true);
		});

		describe('when the target is deployed', () => {
			let instance;
			beforeEach(async () => {
				instance = await artifacts
					.require('MintableSynthetix')
					.new(proxy.address, tokenState.address, owner, SYNTHETIX_TOTAL_SUPPLY, resolver.address);
				await instance.rebuildCache();
			});

			it('should set constructor params on deployment', async () => {
				assert.equal(await instance.proxy(), proxy.address);
				assert.equal(await instance.tokenState(), tokenState.address);
				assert.equal(await instance.owner(), owner);
				assert.equal(await instance.totalSupply(), SYNTHETIX_TOTAL_SUPPLY);
				assert.equal(await instance.resolver(), resolver.address);
			});

			describe('mintSecondary()', async () => {
				describe('failure modes', () => {
					it('should only allow SynthetixBridgeToBase to call mintSecondary()', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: instance.mintSecondary,
							args: [user1, 100],
							address: synthetixBridgeToBase,
							accounts,
							reason: 'Can only be invoked by bridge',
						});
					});
				});

				describe('when invoked by the bridge', () => {
					const amount = 100;
					beforeEach(async () => {
						await instance.mintSecondary(user1, amount, {
							from: synthetixBridgeToBase,
						});
					});

					it('should increase the total supply', async () => {
						const newSupply = new BN(SYNTHETIX_TOTAL_SUPPLY).add(new BN(amount));
						assert.bnEqual(await instance.totalSupply(), newSupply);
					});

					it('should invoke emitTransfer (which invokes proxy._emit', async () => {
						assert.equal(proxy.smocked._emit.calls.length, 1);
						assert.equal(
							toChecksumAddress('0x' + proxy.smocked._emit.calls[0][3].slice(-40)),
							instance.address
						);
						assert.equal(
							toChecksumAddress('0x' + proxy.smocked._emit.calls[0][4].slice(-40)),
							user1
						);
					});
				});
			});

			describe('mintSecondaryRewards()', async () => {
				const amount = 100;
				describe('failure modes', () => {
					it('should only allow SynthetixBridgeToBase to call mintSecondaryRewards()', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: instance.mintSecondaryRewards,
							args: [amount],
							address: synthetixBridgeToBase,
							accounts,
							reason: 'Can only be invoked by bridge',
						});
					});
				});

				describe('when invoked by the bridge', () => {
					beforeEach(async () => {
						await instance.mintSecondaryRewards(amount, {
							from: synthetixBridgeToBase,
						});
					});

					it('should increase the total supply', async () => {
						const newSupply = new BN(SYNTHETIX_TOTAL_SUPPLY).add(new BN(amount));
						assert.bnEqual(await instance.totalSupply(), newSupply);
					});

					it('should invoke emitTransfer (which invokes proxy._emit', async () => {
						assert.equal(proxy.smocked._emit.calls.length, 1);
						assert.equal(
							toChecksumAddress('0x' + proxy.smocked._emit.calls[0][3].slice(-40)),
							instance.address
						);
						assert.equal(
							toChecksumAddress('0x' + proxy.smocked._emit.calls[0][4].slice(-40)),
							rewardsDistribution.address
						);
					});

					it('should invoke distributeRewards', async () => {
						assert.equal(rewardsDistribution.smocked.distributeRewards.calls.length, 1);
						assert.equal(rewardsDistribution.smocked.distributeRewards.calls[0][0], amount);
					});
				});
			});

			describe('burnSecondary()', async () => {
				const amount = 100;
				describe('failure modes', () => {
					it('should only allow SynthetixBridgeToBase to call burnSecondary()', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: instance.burnSecondary,
							args: [user1, amount],
							address: synthetixBridgeToBase,
							accounts,
							reason: 'Can only be invoked by bridge',
						});
					});
				});
				describe('when invoked by the bridge', () => {
					beforeEach(async () => {
						await instance.burnSecondary(user1, amount, {
							from: synthetixBridgeToBase,
						});
					});

					it('should decrease the total supply', async () => {
						const newSupply = new BN(SYNTHETIX_TOTAL_SUPPLY).sub(new BN(amount));
						assert.bnEqual(await instance.totalSupply(), newSupply);
					});

					it('should invoke emitTransfer (which invokes proxy._emit', async () => {
						assert.equal(proxy.smocked._emit.calls.length, 1);
						assert.equal(
							toChecksumAddress('0x' + proxy.smocked._emit.calls[0][3].slice(-40)),
							user1
						);
						assert.equal(
							toChecksumAddress('0x' + proxy.smocked._emit.calls[0][4].slice(-40)),
							ZERO_ADDRESS
						);
					});
				});
			});
		});
	});
});
