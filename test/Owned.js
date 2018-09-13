const Owned = artifacts.require('Owned');
const ZERO_ADDRESS = '0x' + '0'.repeat(40);

contract('Owned - Test contract deployment', function(accounts) {
	const [deployerAccount, account1] = accounts;

	it('should revert when owner parameter is passed the zero address', async function() {
		try {
			await Owned.new(ZERO_ADDRESS, { from: deployerAccount });
		} catch (error) {
			assert.include(error.message, 'revert');
		}
	});

	// TODO check events on contract creation
	it('should set owner address on deployment', async function() {
		const ownedContractInstance = await Owned.new(account1, { from: deployerAccount });
		const owner = await ownedContractInstance.owner();
		assert.equal(owner, account1);
	});
});

contract('Owned - Pre deployed contract', async function(accounts) {
	const [account1, account2, account3, account4] = accounts.slice(1); // The first account is the deployerAccount above

	it('should not nominate new owner when not invoked by current contract owner', async function() {
		let ownedContractInstance = await Owned.deployed();
		const nominatedOwner = account3;
		try {
			await ownedContractInstance.nominateNewOwner(nominatedOwner, { from: account2 });
		} catch (error) {
			assert.include(error.message, 'revert');
		}
		const nominatedOwnerFrmContract = await ownedContractInstance.nominatedOwner();
		assert.equal(nominatedOwnerFrmContract, ZERO_ADDRESS);
	});

	it('should nominate new owner when invoked by current contract owner', async function() {
		let ownedContractInstance = await Owned.deployed();
		const nominatedOwner = account2;

		const txn = await ownedContractInstance.nominateNewOwner(nominatedOwner, { from: account1 });
		assert.eventEqual(txn, 'OwnerNominated', { newOwner: nominatedOwner });

		const nominatedOwnerFromContract = await ownedContractInstance.nominatedOwner();
		assert.equal(nominatedOwnerFromContract, nominatedOwner);
	});

	it('should not accept new owner nomination when not invoked by nominated owner', async function() {
		let ownedContractInstance = await Owned.deployed();
		const nominatedOwner = account3;

		await assert.revert(ownedContractInstance.acceptOwnership({ from: account4 }));

		const owner = await ownedContractInstance.owner();
		assert.notEqual(owner, nominatedOwner);
	});

	it('should accept new owner nomination when invoked by nominated owner', async function() {
		let ownedContractInstance = await Owned.deployed();
		const nominatedOwner = account2;

		let txn = await ownedContractInstance.nominateNewOwner(nominatedOwner, { from: account1 });
		assert.eventEqual(txn, 'OwnerNominated', { newOwner: nominatedOwner });

		const nominatedOwnerFromContract = await ownedContractInstance.nominatedOwner();
		assert.equal(nominatedOwnerFromContract, nominatedOwner);

		txn = await ownedContractInstance.acceptOwnership({ from: account2 });

		assert.eventEqual(txn, 'OwnerChanged', { oldOwner: account1, newOwner: account2 });

		const owner = await ownedContractInstance.owner();
		const nominatedOwnerFromContact = await ownedContractInstance.nominatedOwner();

		assert.equal(owner, nominatedOwner);
		assert.equal(nominatedOwnerFromContact, ZERO_ADDRESS);
	});
});
