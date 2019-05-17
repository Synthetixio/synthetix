const DelegateApprovals = artifacts.require('DelegateApprovals');

contract.only('DelegateApprovals', async accounts => {
	const [deployerAccount, owner, account1, account2] = accounts;

	let delegateApprovals;

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		delegateApprovals = await DelegateApprovals.deployed();
		await delegateApprovals.setAssociatedContract(owner, { from: owner });
	});

	it('should set constructor params on deployment', async () => {
		// constructor(address _owner, address associatedContract) //
		const instance = await DelegateApprovals.new(account1, account2, {
			from: deployerAccount,
		});

		assert.equal(await instance.owner(), account1);
		assert.equal(await instance.associatedContract(), account2);
	});

	describe('adding approvals', async () => {
		it('should return false if no approval for account1', async () => {
			const authoriser = account1;
			const delegate = account2;

			const result = await delegateApprovals.approval(authoriser, delegate);
			assert.isNotTrue(result);
		});
		it('should set approval for account1', async () => {
			const authoriser = account1;
			const delegate = account2;
			await delegateApprovals.setApproval(authoriser, delegate, { from: owner });

			const result = await delegateApprovals.approval(authoriser, delegate);
			assert.isTrue(result);
		});
		it('should set and remove approval for account1', async () => {
			const authoriser = account1;
			const delegate = account2;
			await delegateApprovals.setApproval(authoriser, delegate, { from: owner });

			const result = await delegateApprovals.approval(authoriser, delegate);
			assert.isTrue(result);

			// remove approval
			await delegateApprovals.withdrawApproval(authoriser, delegate, { from: owner });
			const newResult = await delegateApprovals.approval(authoriser, delegate);
			assert.isNotTrue(newResult);
		});
		it('should revert if called by non associatedAccount', async () => {
			const authoriser = account1;
			const delegate = account2;
			await delegateApprovals.setApproval(authoriser, delegate, { from: owner });

			const result = await delegateApprovals.approval(authoriser, delegate);
			assert.isTrue(result);

			// remove approval
			await delegateApprovals.withdrawApproval(authoriser, delegate, { from: owner });
			const newResult = await delegateApprovals.approval(authoriser, delegate);
			assert.isNotTrue(newResult);
		});
		it('should add approval and emit an Approval event', async () => {
			const authoriser = account1;
			const delegate = account2;

			const transaction = await delegateApprovals.setApproval(authoriser, delegate, {
				from: owner,
			});

			assert.eventEqual(transaction, 'Approval', {
				authoriser: account1,
				delegate: account2,
			});
		});
		it('should withdraw approval and emit an WithdrawApproval event', async () => {
			const authoriser = account1;
			const delegate = account2;

			const transaction = await delegateApprovals.withdrawApproval(authoriser, delegate, {
				from: owner,
			});

			assert.eventEqual(transaction, 'WithdrawApproval', {
				authoriser: account1,
				delegate: account2,
			});
		});
	});
});
