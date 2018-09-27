const ExchangeRates = artifacts.require('ExchangeRates');
const Havven = artifacts.require('Havven');
const Nomin = artifacts.require('Nomin');

const { currentTime, fastForward, ZERO_ADDRESS } = require('../utils/testUtils');

contract.only('Havven', async function(accounts) {
	const [deployerAccount, owner, account1, account2, account3, account4] = accounts;

	beforeEach(async function() {
		// Send a price update to guarantee we're not stale.
		const exchangeRates = await ExchangeRates.deployed();

		const oracle = await exchangeRates.oracle();
		const { timestamp } = await web3.eth.getBlock('latest');

		await exchangeRates.updateRates(
			['nUSD', 'nAUD', 'nEUR', 'HAV'].map(web3.utils.asciiToHex),
			['1', '0.5', '1.25', '0.1'].map(number => web3.utils.toWei(number, 'ether')),
			timestamp,
			{ from: oracle }
		);
	});

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

	it('should disallow double adding a Nomin contract with the same currencyKey', async function() {
		const havven = await Havven.deployed();

		const nomin1 = await Nomin.new(
			account1,
			account2,
			Havven.address,
			'Nomin XYZ',
			'nXYZ',
			owner,
			web3.utils.asciiToHex('nXYZ'),
			{ from: deployerAccount }
		);

		const nomin2 = await Nomin.new(
			account1,
			account2,
			Havven.address,
			'Nomin XYZ',
			'nXYZ',
			owner,
			web3.utils.asciiToHex('nXYZ'),
			{ from: deployerAccount }
		);

		await havven.addNomin(nomin1.address, { from: owner });
		await assert.revert(havven.addNomin(nomin2.address, { from: owner }));
	});

	it('should allow removing a Nomin contract when it has no issued balance', async function() {
		// Note: This test depends on state in the migration script, that there are hooked up nomins
		// without balances and we just remove one.
		const havven = await Havven.deployed();
		const nomin = await Nomin.at(await havven.availableNomins(0));
		const currencyKey = await nomin.currencyKey();
		const nominCount = await havven.availableNominCount();

		assert.notEqual(await havven.nomins(currencyKey), ZERO_ADDRESS);

		await havven.removeNomin(currencyKey, { from: owner });

		// Assert that we have one less nomin, and that the specific currency key is gone.
		assert.bnEqual(await havven.availableNominCount(), nominCount.sub(web3.utils.toBN(1)));
		assert.equal(await havven.nomins(currencyKey), ZERO_ADDRESS);
	});

	it('should disallow removing a Nomin contract when it has an issued balance', async function() {
		// Note: This test depends on state in the migration script, that there are hooked up nomins
		// without balances
		const havven = await Havven.deployed();
		const currencyKey = web3.utils.asciiToHex('nUSD');
		const nUSD = await havven.nomins(currencyKey);

		// Assert that we can remove the nomin and add it back in before we do anything.
		let transaction = await havven.removeNomin(currencyKey, { from: owner });
		assert.eventEqual(transaction, 'NominRemoved', { currencyKey, removedNomin: nUSD });
		transaction = await havven.addNomin(nUSD, { from: owner });
		assert.eventEqual(transaction, 'NominAdded', { currencyKey, newNomin: nUSD });

		// Issue one nUSD
		await havven.issueNomins(currencyKey, web3.utils.toWei('1', 'ether'), {
			from: owner,
		});

		// Assert that we can't remove the nomin now
		await assert.revert(havven.removeNomin(currencyKey, { from: owner }));
	});

	it('should disallow removing a Nomin contract when requested by a non-owner', async function() {
		// Note: This test depends on state in the migration script, that there are hooked up nomins
		// without balances
		const havven = await Havven.deployed();
		const currencyKey = web3.utils.asciiToHex('nUSD');

		await assert.revert(havven.removeNomin(currencyKey, { from: account1 }));
	});

	it('should revert when requesting to remove a non-existent nomin', async function() {
		// Note: This test depends on state in the migration script, that there are hooked up nomins
		// without balances
		const havven = await Havven.deployed();
		const currencyKey = web3.utils.asciiToHex('NOPE');

		// Assert that we can't remove the nomin
		await assert.revert(havven.removeNomin(currencyKey, { from: owner }));
	});

	it('should allow the owner to set an Escrow contract', async function() {
		const havven = await Havven.deployed();

		const transaction = await havven.setEscrow(account1, { from: owner });

		assert.eventEqual(transaction, 'EscrowUpdated', { newEscrow: account1 });
	});

	it('should disallow a non-owner from setting an Escrow contract', async function() {
		const havven = await Havven.deployed();

		await assert.revert(havven.setEscrow(account1, { from: account1 }));
	});

	it('should allow the owner to set fee period duration', async function() {
		const havven = await Havven.deployed();

		// Set fee period to 5 days
		const duration = 5 * 24 * 60 * 60;
		const transaction = await havven.setFeePeriodDuration(web3.utils.toBN(duration), {
			from: owner,
		});

		assert.eventEqual(transaction, 'FeePeriodDurationUpdated', { duration });
	});

	it('should disallow a non-owner from setting the fee period duration', async function() {
		const havven = await Havven.deployed();

		// Try to set fee period to 5 days
		const duration = 5 * 24 * 60 * 60;
		await assert.revert(
			havven.setFeePeriodDuration(web3.utils.toBN(duration), {
				from: account1,
			})
		);
	});

	it('should disallow setting the fee period duration below the minimum fee period duration', async function() {
		const havven = await Havven.deployed();

		// Minimum is currently 1 day in the contract
		const minimum = 60 * 60 * 24;

		// Setting to the minimum should succeed
		const transaction = await havven.setFeePeriodDuration(web3.utils.toBN(minimum), {
			from: owner,
		});
		assert.eventEqual(transaction, 'FeePeriodDurationUpdated', { duration: minimum });

		// While setting to minimum - 1 should fail
		await assert.revert(
			havven.setFeePeriodDuration(web3.utils.toBN(minimum - 1), {
				from: owner,
			})
		);
	});

	it('should disallow setting the fee period duration above the maximum fee period duration', async function() {
		const havven = await Havven.deployed();

		// Maximum is currently 26 weeks in the contract
		const maximum = 60 * 60 * 24 * 7 * 26;

		// Setting to the maximum should succeed
		const transaction = await havven.setFeePeriodDuration(web3.utils.toBN(maximum), {
			from: owner,
		});
		assert.eventEqual(transaction, 'FeePeriodDurationUpdated', { duration: maximum });

		// While setting to maximum + 1 should fail
		await assert.revert(
			havven.setFeePeriodDuration(web3.utils.toBN(maximum + 1), {
				from: owner,
			})
		);
	});

	it('should allow the owner to set an Exchange Rates contract', async function() {
		const havven = await Havven.deployed();

		const transaction = await havven.setExchangeRates(account1, { from: owner });

		assert.eventEqual(transaction, 'ExchangeRatesUpdated', { newExchangeRates: account1 });
	});

	it('should disallow a non-owner from setting an Exchange Rates contract', async function() {
		const havven = await Havven.deployed();

		await assert.revert(havven.setExchangeRates(account1, { from: account1 }));
	});

	it('should allow the owner to set the issuance ratio', async function() {
		const havven = await Havven.deployed();
		const ratio = web3.utils.toWei('0.2', 'ether');

		const transaction = await havven.setIssuanceRatio(ratio, {
			from: owner,
		});

		assert.eventEqual(transaction, 'IssuanceRatioUpdated', { newRatio: ratio });
	});

	it('should allow the owner to set the issuance ratio to zero', async function() {
		const havven = await Havven.deployed();
		const ratio = web3.utils.toBN('0');

		const transaction = await havven.setIssuanceRatio(ratio, {
			from: owner,
		});

		assert.eventEqual(transaction, 'IssuanceRatioUpdated', { newRatio: ratio });
	});

	it('should disallow a non-owner from setting the issuance ratio', async function() {
		const havven = await Havven.deployed();
		const ratio = web3.utils.toWei('0.2', 'ether');

		await assert.revert(
			havven.setIssuanceRatio(ratio, {
				from: account1,
			})
		);
	});

	it('should disallow setting the issuance ratio above the MAX ratio', async function() {
		const havven = await Havven.deployed();
		const max = web3.utils.toWei('1', 'ether');

		// It should succeed when setting it to max
		const transaction = await havven.setIssuanceRatio(max, {
			from: owner,
		});
		assert.eventEqual(transaction, 'IssuanceRatioUpdated', { newRatio: max });

		// But max + 1 should fail
		await assert.revert(
			havven.setIssuanceRatio(web3.utils.toBN(max).add(web3.utils.toBN('1')), {
				from: account1,
			})
		);
	});

	it('should allow the owner add someone as a whitelisted issuer', async function() {
		const havven = await Havven.deployed();

		assert.equal(await havven.isIssuer(account1), false);

		const transaction = await havven.setIssuer(account1, true, { from: owner });
		assert.eventEqual(transaction, 'IssuerUpdated', { account: account1, value: true });

		assert.equal(await havven.isIssuer(account1), true);
	});

	it('should disallow a non-owner from adding someone as a whitelisted issuer', async function() {
		const havven = await Havven.deployed();

		assert.equal(await havven.isIssuer(account1), false);

		await assert.revert(havven.setIssuer(account1, true, { from: account1 }));
	});

	it('should correctly calculate an exchange rate in effectiveValue()', async function() {
		// Send a price update to guarantee we're not stale.
		const havven = await Havven.deployed();
		const exchangeRates = await ExchangeRates.deployed();

		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			['nUSD', 'nAUD', 'nEUR', 'HAV'].map(web3.utils.asciiToHex),
			['1', '0.5', '1.25', '0.1'].map(number => web3.utils.toWei(number, 'ether')),
			timestamp,
			{ from: oracle }
		);

		// 1 nUSD should be worth 2 nAUD.
		assert.bnEqual(
			await havven.effectiveValue(
				web3.utils.asciiToHex('nUSD'),
				web3.utils.toWei('1', 'ether'),
				web3.utils.asciiToHex('nAUD')
			),
			web3.utils.toWei('2', 'ether')
		);

		// 10 HAV should be worth 1 nUSD.
		assert.bnEqual(
			await havven.effectiveValue(
				web3.utils.asciiToHex('HAV'),
				web3.utils.toWei('10', 'ether'),
				web3.utils.asciiToHex('nUSD')
			),
			web3.utils.toWei('1', 'ether')
		);

		// 2 nEUR should be worth 2.50 nUSD
		assert.bnEqual(
			await havven.effectiveValue(
				web3.utils.asciiToHex('nEUR'),
				web3.utils.toWei('2', 'ether'),
				web3.utils.asciiToHex('nUSD')
			),
			web3.utils.toWei('2.5', 'ether')
		);
	});

	it('should error when relying on a stale exchange rate in effectiveValue()', async function() {
		// Send a price update so we know what time we started with.
		const havven = await Havven.deployed();
		const exchangeRates = await ExchangeRates.deployed();

		const oracle = await exchangeRates.oracle();
		let timestamp = await currentTime();

		await exchangeRates.updateRates(
			['nUSD', 'nAUD', 'nEUR', 'HAV'].map(web3.utils.asciiToHex),
			['1', '0.5', '1.25', '0.1'].map(number => web3.utils.toWei(number, 'ether')),
			timestamp,
			{ from: oracle }
		);

		// Add stale period to the time to ensure we go stale.
		await fastForward(await exchangeRates.rateStalePeriod());

		timestamp = await currentTime();

		// Update all rates except nUSD.
		await exchangeRates.updateRates(
			['nAUD', 'nEUR', 'HAV'].map(web3.utils.asciiToHex),
			['0.5', '1.25', '0.1'].map(number => web3.utils.toWei(number, 'ether')),
			timestamp,
			{ from: oracle }
		);

		// Should now be able to convert from HAV to nAUD
		assert.bnEqual(
			await havven.effectiveValue(
				web3.utils.asciiToHex('HAV'),
				web3.utils.toWei('10', 'ether'),
				web3.utils.asciiToHex('nAUD')
			),
			web3.utils.toWei('2', 'ether')
		);

		// But trying to convert from HAV to nUSD should fail
		await assert.revert(
			havven.effectiveValue(
				web3.utils.asciiToHex('HAV'),
				web3.utils.toWei('10', 'ether'),
				web3.utils.asciiToHex('nUSD')
			)
		);
	});

	it('should revert when relying on a non-existant exchange rate in effectiveValue()', async function() {
		// Send a price update so we know what time we started with.
		const havven = await Havven.deployed();
		const exchangeRates = await ExchangeRates.deployed();

		const oracle = await exchangeRates.oracle();
		let timestamp = await currentTime();

		await exchangeRates.updateRates(
			['nUSD', 'nAUD', 'nEUR', 'HAV'].map(web3.utils.asciiToHex),
			['1', '0.5', '1.25', '0.1'].map(number => web3.utils.toWei(number, 'ether')),
			timestamp,
			{ from: oracle }
		);

		await assert.revert(
			havven.effectiveValue(
				web3.utils.asciiToHex('HAV'),
				web3.utils.toWei('10', 'ether'),
				web3.utils.asciiToHex('XYZ')
			)
		);
	});

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
