const { artifacts, contract, web3 } = require('hardhat');
const { assert } = require('./common');
const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');

const { smock } = require('@defi-wonderland/smock');

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
			IERC20 = await smock.fake('contracts/interfaces/IERC20.sol:IERC20');
		});

		beforeEach(async () => {
			// stubs
			IERC20.approve.returns(() => true);
			IERC20.transfer.returns(() => true);
			IERC20.transferFrom.returns(() => true);
			IERC20.balanceOf.returns(() => web3.utils.toWei('100'));
			IERC20.allowance.returns(() => web3.utils.toWei('0'));
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
						IERC20.approve.returnsAtCall(0, snxBridgeToOptimism);
						IERC20.approve.returnsAtCall(1, amount);
					});
				});
			});
		});
	});
});
