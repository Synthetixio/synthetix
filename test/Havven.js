const Havven = artifacts.require('Havven');
const Nomin = artifacts.require('Nomin');

const { ZERO_ADDRESS } = require('../utils/testUtils');

contract.only('Havven', async function(accounts) {
	const [deployerAccount, owner, account1, account2, account3, account4] = accounts;

	it('should set constructor params on deployment', async function() {
		const instance = await Havven.new(account1, account2, account3, account4, ZERO_ADDRESS, {
			from: deployerAccount,
		});

		assert.equal(await instance.proxy(), account1);
		assert.equal(await instance.tokenState(), account2);
		assert.equal(await instance.owner(), account3);
		assert.equal(await instance.exchangeRates(), account4);
	});

	it('should correctly upgrade from the previous nUSD contract deployment');

	it('should allow adding a Nomin contract', async function() {
		const havven = await Havven.deployed();
		const previousNominCount = await havven.availableNominCount();

		const nomin = await Nomin.new(
			account1,
			account2,
			Havven.address,
			'Nomin XYZ',
			'nXYZ',
			owner,
			web3.utils.asciiToHex('nXYZ'),
			{ from: deployerAccount }
		);

		await havven.addNomin(nomin.address, { from: owner });

		// Assert that we've successfully added a Nomin
		assert.bnEqual(await havven.availableNominCount(), previousNominCount.add(web3.utils.toBN(1)));
		// Assert that it's at the end of the array
		assert.equal(await havven.availableNomins(previousNominCount), nomin.address);
		// Assert that it's retrievable by its currencyKey
		assert.equal(await havven.nomins(web3.utils.asciiToHex('nXYZ')), nomin.address);
	});

	it('should disallow adding a Nomin contract when the user is not the owner', async function() {
		const havven = await Havven.deployed();

		const nomin = await Nomin.new(
			account1,
			account2,
			Havven.address,
			'Nomin XYZ',
			'nXYZ',
			owner,
			web3.utils.asciiToHex('nXYZ'),
			{ from: deployerAccount }
		);

		await assert.revert(havven.addNomin(nomin.address, { from: account1 }));
	});

	it('should disallow double adding a Nomin contract with the same address', async function() {
		const havven = await Havven.deployed();

		const nomin = await Nomin.new(
			account1,
			account2,
			Havven.address,
			'Nomin XYZ',
			'nXYZ',
			owner,
			web3.utils.asciiToHex('nXYZ'),
			{ from: deployerAccount }
		);

		await havven.addNomin(nomin.address, { from: owner });
		await assert.revert(havven.addNomin(nomin.address, { from: owner }));
	});

	it('should disallow double adding a Nomin contract with the same currencyKey');
	it('should allow removing a Nomin contract when it has no issued balance');
	it('should disallow removing a Nomin contract when it has an issued balance');
	it('should disallow removing a Nomin contract when requested by a non-owner');
	it('should revert when requesting to remove a non-existent nomin');

	it('should allow the owner to set an Escrow contract');
	it('should disallow a non-owner from setting an Escrow contract');

	it('should allow the owner to set fee period duration');
	it('should disallow a non-owner from setting the fee period duration');
	it('should disallow setting the fee period duration outside the MIN / MAX range');

	it('should allow the owner to set an Exchange Rates contract');
	it('should disallow a non-owner from setting an Exchange Rates contract');

	it('should allow the owner to set the issuance ratio');
	it('should disallow a non-owner from setting the issuance ratio');
	it('should disallow setting the issuance ratio above the MAX ratio');

	it('should allow the owner add someone as a whitelisted issuer');
	it('should disallow a non-owner from adding someone as a whitelisted issuer');

	it('should correctly calculate an exchange rate in effectiveValue()');
	it('should error when relying on a stale exchange rate in effectiveValue()');
	it('should return zero when relying on a non-existant exchange rate in effectiveValue()');

	it('should correctly calculate the total issued nomins in a single currency');
	it('should correctly calculate the total issued nomins in multiple currencies');

	it('should transfer using the ERC20 transfer function');
	it('should revert when exceeding locked havvens and calling the ERC20 transfer function');
	it('should transfer using the ERC20 transferFrom function');
	it('should revert when exceeding locked havvens and calling the ERC20 transferFrom function');

	it('should transfer using the ERC223 transfer function');
	it('should revert when exceeding locked havvens and calling the ERC223 transfer function');
	it('should transfer using the ERC223 transferFrom function');
	it('should revert when exceeding locked havvens and calling the ERC223 transferFrom function');

	it('should allow a whitelisted issuer to issue nomins in one flavour');
	it('should allow a whitelisted issuer to issue nomins in multiple flavours');
	it('should allow a whitelisted issuer to issue max nomins in one flavour');
	it('should allow a whitelisted issuer to issue max nomins via the standard issue call');
	it('should disallow a non-whitelisted issuer from issuing nomins in a single flavour');
	it('should disallow a whitelisted issuer from issuing nomins in a non-existant flavour');
	it(
		'should disallow a whitelisted issuer from issuing nomins beyond their remainingIssuableNomins'
	);

	it('should allow an issuer with outstanding debt to burn nomins and forgive debt');
	it('should disallow an issuer without outstanding debt from burning nomins');

	it('should correctly calculate debt in a multi-issuance scenario');
	it('should correctly calculate debt in a multi-issuance multi-burn scenario');

	it("should correctly calculate a user's maximum issuable nomins without prior issuance");
	it("should correctly calculate a user's maximum issuable nomins with prior issuance");
	it('should error when calculating maximum issuance when the HAV rate is stale');
	it('should error when calculating maximum issuance when the currency rate is stale');
	it('should always return zero maximum issuance if a user is not a whitelisted issuer');

	it("should correctly calculate a user's debt balance without prior issuance");
	it("should correctly calculate a user's debt balance with prior issuance");

	it("should correctly calculate a user's remaining issuable nomins without prior issuance");
	it("should correctly calculate a user's remaining issuable nomins with prior issuance");
});
