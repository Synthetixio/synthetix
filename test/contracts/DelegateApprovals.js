'use strict';

const { artifacts, contract } = require('hardhat');

const { assert, addSnapshotBeforeRestoreAfterEach } = require('./common');

const EternalStorage = artifacts.require('EternalStorage');
const DelegateApprovals = artifacts.require('DelegateApprovals');
const { onlyGivenAddressCanInvoke, ensureOnlyExpectedMutativeFunctions } = require('./helpers');
const {
	toBytes32,
	constants: { ZERO_ADDRESS },
} = require('../..');

contract('DelegateApprovals', async accounts => {
	const [deployerAccount, owner, account1, account2, account3] = accounts;

	let delegateApprovals;

	before(async () => {
		const delegateApprovalsEternalStorage = await EternalStorage.new(owner, ZERO_ADDRESS, {
			from: deployerAccount,
		});

		delegateApprovals = await DelegateApprovals.new(
			owner,
			delegateApprovalsEternalStorage.address,
			{
				from: deployerAccount,
			}
		);

		// set associatedContract on delegateApprovalsEternalStorage
		await delegateApprovalsEternalStorage.setAssociatedContract(delegateApprovals.address, {
			from: owner,
		});
	});

	addSnapshotBeforeRestoreAfterEach();

	it('should set constructor params on deployment', async () => {
		// constructor(address _owner, address associatedContract) //
		const instance = await DelegateApprovals.new(account1, account2, {
			from: deployerAccount,
		});

		assert.equal(await instance.owner(), account1);
		assert.equal(await instance.eternalStorage(), account2);
	});
	describe('setEternalStorage()', () => {
		it('can only be invoked by owner', async () => {
			await onlyGivenAddressCanInvoke({
				fnc: delegateApprovals.setEternalStorage,
				args: [account1],
				address: owner,
				accounts,
			});
		});
		it('emits EternalStorageUpdated event', async () => {
			const transaction = await delegateApprovals.setEternalStorage(account1, {
				from: owner,
			});

			assert.eventEqual(transaction, 'EternalStorageUpdated', {
				newEternalStorage: account1,
			});
		});
		it('reverts if set to ZERO_ADDRESS', async () => {
			await assert.revert(
				delegateApprovals.setEternalStorage(ZERO_ADDRESS, {
					from: owner,
				}),
				"Can't set eternalStorage to address(0)"
			);
		});
	});

	it('ensure only known functions are mutative', () => {
		ensureOnlyExpectedMutativeFunctions({
			abi: delegateApprovals.abi,
			ignoreParents: ['Owned'],
			expected: [
				'approveAllDelegatePowers',
				'removeAllDelegatePowers',
				'approveBurnOnBehalf',
				'removeBurnOnBehalf',
				'approveIssueOnBehalf',
				'removeIssueOnBehalf',
				'approveClaimOnBehalf',
				'removeClaimOnBehalf',
				'approveExchangeOnBehalf',
				'removeExchangeOnBehalf',
				'setEternalStorage',
			],
		});
	});

	describe('adding approvals for all delegate powers', () => {
		const authoriser = account1;
		const delegate = account2;

		it('should return false if no approval for account1', async () => {
			const result = await delegateApprovals.canBurnFor(authoriser, delegate);
			assert.isNotTrue(result);
		});
		it('should set approval for all delegatePowers for account2', async () => {
			await delegateApprovals.approveAllDelegatePowers(delegate, { from: authoriser });

			const result = await delegateApprovals.canBurnFor(authoriser, delegate);
			assert.isTrue(result);
		});
		it('should set and remove approval for account1', async () => {
			await delegateApprovals.approveAllDelegatePowers(delegate, { from: authoriser });

			const result = await delegateApprovals.canBurnFor(authoriser, delegate);
			assert.isTrue(result);

			// remove approval
			const transaction = await delegateApprovals.removeAllDelegatePowers(delegate, {
				from: authoriser,
			});

			// only WithdrawApproval event emitted for ApproveAll
			assert.eventEqual(transaction, 'WithdrawApproval', {
				authoriser: account1,
				delegate: account2,
				action: toBytes32('ApproveAll'),
			});

			const newResult = await delegateApprovals.canBurnFor(authoriser, delegate);
			assert.isNotTrue(newResult);
		});
		it('should add approval and emit an Approval event', async () => {
			const transaction = await delegateApprovals.approveAllDelegatePowers(delegate, {
				from: authoriser,
			});

			assert.eventEqual(transaction, 'Approval', {
				authoriser: account1,
				delegate: account2,
				action: toBytes32('ApproveAll'),
			});
		});
	});

	['Issue', 'Burn', 'Exchange', 'Claim'].forEach(type => {
		const authoriser = account1;
		const delegate = account2;
		describe(`when adding approvals for ${type}`, () => {
			const fncs = {
				check: `can${type}For`,
				approve: `approve${type}OnBehalf`,
				remove: `remove${type}OnBehalf`,
				event: `${type}ForAddress`,
			};
			it('should return false if no approval for account1', async () => {
				const result = await delegateApprovals[fncs.check](authoriser, delegate);
				assert.isNotTrue(result);
			});
			it('should set approval for all burnOnBehalf for account2', async () => {
				await delegateApprovals[fncs.approve](delegate, { from: authoriser });

				const result = await delegateApprovals[fncs.check](authoriser, delegate);
				assert.isTrue(result);

				assert.isNotTrue(await delegateApprovals[fncs.check](authoriser, account3));
			});
			it('should emit the Approval event & action', async () => {
				const transaction = await delegateApprovals[fncs.approve](delegate, {
					from: authoriser,
				});

				assert.eventEqual(transaction, 'Approval', {
					authoriser: authoriser,
					delegate: delegate,
					action: toBytes32(fncs.event),
				});
			});
			it('should set and remove approval for account1', async () => {
				await delegateApprovals[fncs.approve](delegate, { from: authoriser });

				const result = await delegateApprovals[fncs.check](authoriser, delegate);
				assert.isTrue(result);

				// remove approval
				const transaction = await delegateApprovals[fncs.remove](delegate, {
					from: authoriser,
				});

				assert.eventEqual(transaction, 'WithdrawApproval', {
					authoriser: account1,
					delegate: account2,
					action: toBytes32(fncs.event),
				});

				const newResult = await delegateApprovals[fncs.check](authoriser, delegate);
				assert.isNotTrue(newResult);
			});
			it('should allow any account to withdraw approval if not set before', async () => {
				await delegateApprovals[fncs.remove](delegate, { from: authoriser });
				const result = await delegateApprovals[fncs.check](authoriser, delegate);

				assert.isNotTrue(result);
			});
			it('should revert if account is being set to ZERO_ADDRESS', async () => {
				const authoriser = account1;

				await assert.revert(
					delegateApprovals[fncs.approve](ZERO_ADDRESS, { from: authoriser }),
					"Can't delegate to address(0)"
				);
			});
		});
	});

	describe('when invoking removeAllDelegatePowers', () => {
		const authoriser = account1;
		const delegate = account2;

		beforeEach(async () => {
			await delegateApprovals.approveExchangeOnBehalf(delegate, { from: authoriser });
			await delegateApprovals.approveIssueOnBehalf(delegate, { from: authoriser });
			await delegateApprovals.approveBurnOnBehalf(delegate, { from: authoriser });
			await delegateApprovals.approveClaimOnBehalf(delegate, { from: authoriser });
		});

		it('should remove all delegate powers that have been set', async () => {
			// check approvals is all true
			assert.isTrue(await delegateApprovals.canExchangeFor(authoriser, delegate));
			assert.isTrue(await delegateApprovals.canIssueFor(authoriser, delegate));
			assert.isTrue(await delegateApprovals.canBurnFor(authoriser, delegate));
			assert.isTrue(await delegateApprovals.canClaimFor(authoriser, delegate));

			// invoke removeAllDelegatePowers
			await await delegateApprovals.removeAllDelegatePowers(delegate, { from: authoriser });

			// each delegations revoked
			assert.isNotTrue(await delegateApprovals.canExchangeFor(authoriser, delegate));
			assert.isNotTrue(await delegateApprovals.canIssueFor(authoriser, delegate));
			assert.isNotTrue(await delegateApprovals.canBurnFor(authoriser, delegate));
			assert.isNotTrue(await delegateApprovals.canClaimFor(authoriser, delegate));
		});

		it('should withdraw approval and emit an WithdrawApproval event for each withdrawn delegation', async () => {
			const transaction = await delegateApprovals.removeAllDelegatePowers(delegate, {
				from: authoriser,
			});

			assert.eventsEqual(
				transaction,
				'WithdrawApproval',
				{
					authoriser: account1,
					delegate: account2,
					action: toBytes32('BurnForAddress'),
				},
				'WithdrawApproval',
				{
					authoriser: account1,
					delegate: account2,
					action: toBytes32('IssueForAddress'),
				},
				'WithdrawApproval',
				{
					authoriser: account1,
					delegate: account2,
					action: toBytes32('ClaimForAddress'),
				},
				'WithdrawApproval',
				{
					authoriser: account1,
					delegate: account2,
					action: toBytes32('ExchangeForAddress'),
				}
			);
		});
	});
});
