const { artifacts, contract, web3 } = require('hardhat');
const { assert } = require('./common');
const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const { toBytes32 } = require('../..');
const { smockit } = require('@eth-optimism/smock');

const SynthetixBridgeEscrow = artifacts.require('SynthetixBridgeEscrow');

contract('SynthetixBridgeToOptimism (unit tests)', accounts => {
	const [owner, snxBridgeToOptimism] = accounts;

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: SynthetixBridgeEscrow.abi,
			ignoreParents: ['Owned', 'MixinResolver'],
			expected: ['approveBridge'],
		});
	});

	describe('when all the deps are mocked', () => {
		let synthetix;
		let resolver;

		beforeEach(async () => {
			// can't use ISynthetix as we need ERC20 functions as well
			synthetix = await smockit(artifacts.require('Synthetix').abi);

			// now add to address resolver
			resolver = await artifacts.require('AddressResolver').new(owner);
			await resolver.importAddresses(['Synthetix'].map(toBytes32), [synthetix.address], {
				from: owner,
			});
		});

		beforeEach(async () => {
			// stubs
			synthetix.smocked.approve.will.return.with(() => true);
			synthetix.smocked.balanceOf.will.return.with(() => web3.utils.toWei('100'));
			synthetix.smocked.transfer.will.return.with(() => true);
			synthetix.smocked.transferFrom.will.return.with(() => true);
		});

		describe('when the target is deployed', () => {
			let instance;
			beforeEach(async () => {
				instance = await artifacts.require('SynthetixBridgeEscrow').new(owner, resolver.address);

				await instance.rebuildCache();
			});

			describe('approveBridge', () => {
				describe('failure modes', () => {
					it('reverts when not invoked by the owner', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: instance.approveBridge,
							args: [snxBridgeToOptimism, '100'],
							accounts,
							reason: 'Only the contract owner may perform this action',
							address: owner,
						});
					});
				});

				describe('when invoked by the owner', () => {
					let txn;
					const amount = '100';
					beforeEach(async () => {
						txn = await instance.approveBridge(snxBridgeToOptimism, amount, { from: owner });
					});

					it('an BridgeApproval event is emitted', async () => {
						assert.eventEqual(txn, 'BridgeApproval', [owner, snxBridgeToOptimism, amount]);
					});

					it('approve is called via Synthetix', async () => {
						assert.equal(synthetix.smocked.approve.calls.length, 1);
						assert.equal(synthetix.smocked.approve.calls[0][0], snxBridgeToOptimism);
						assert.equal(synthetix.smocked.approve.calls[0][1], amount);
					});
				});
			});
		});
	});
});
