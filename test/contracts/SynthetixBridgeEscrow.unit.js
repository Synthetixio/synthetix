const { artifacts, contract, web3 } = require('hardhat');
const { assert } = require('./common');
const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const { smockit } = require('@eth-optimism/smock');

const SynthetixBridgeEscrow = artifacts.require('SynthetixBridgeEscrow');

contract('SynthetixBridgeToOptimism (unit tests)', accounts => {
	const [owner, snxBridgeToOptimism] = accounts;

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: SynthetixBridgeEscrow.abi,
			ignoreParents: ['Owned'],
			expected: ['approveBridge'],
		});
	});

	describe('when all the deps are mocked', () => {
		let IERC20;

		beforeEach(async () => {
			// can't use ISynthetix as we need ERC20 functions as well
			IERC20 = await smockit(artifacts.require('contracts/interfaces/IERC20.sol:IERC20').abi);
		});

		beforeEach(async () => {
			// stubs
			IERC20.smocked.approve.will.return.with(() => true);
			IERC20.smocked.transfer.will.return.with(() => true);
			IERC20.smocked.transferFrom.will.return.with(() => true);
			IERC20.smocked.balanceOf.will.return.with(() => web3.utils.toWei('100'));
			IERC20.smocked.allowance.will.return.with(() => web3.utils.toWei('0'));
		});

		describe('when the target is deployed', () => {
			let instance;
			beforeEach(async () => {
				instance = await artifacts.require('SynthetixBridgeEscrow').new(owner);
			});

			describe('approveBridge', () => {
				describe('failure modes', () => {
					it('reverts when not invoked by the owner', async () => {
						await onlyGivenAddressCanInvoke({
							fnc: instance.approveBridge,
							args: [IERC20.address, snxBridgeToOptimism, '100'],
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
						txn = await instance.approveBridge(IERC20.address, snxBridgeToOptimism, amount, {
							from: owner,
						});
					});

					it('an BridgeApproval event is emitted', async () => {
						assert.eventEqual(txn, 'BridgeApproval', [IERC20.address, snxBridgeToOptimism, amount]);
					});

					it('approve is called via Synthetix', async () => {
						assert.equal(IERC20.smocked.approve.calls.length, 1);
						assert.equal(IERC20.smocked.approve.calls[0][0], snxBridgeToOptimism);
						assert.equal(IERC20.smocked.approve.calls[0][1], amount);
					});
				});
			});
		});
	});
});
