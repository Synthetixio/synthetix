const ExchangeRates = artifacts.require('ExchangeRates');
const Havven = artifacts.require('Havven');
const Nomin = artifacts.require('Nomin');

const { currentTime, fastForward, fromUnit, toUnit, ZERO_ADDRESS } = require('../utils/testUtils');

const logIssuanceData = issuanceData => {
	const { initialDebtOwnership, debtEntryIndex } = issuanceData;

	console.log('--------------------------');
	console.log('Initial Debt Ownership', fromUnit(initialDebtOwnership));
	console.log('Debt Entry Index', debtEntryIndex.toString());
	console.log('--------------------------');
};

contract.only('Havven', async function(accounts) {
	const [nUSD, nAUD, nEUR, HAV, HDR] = ['nUSD', 'nAUD', 'nEUR', 'HAV', 'HDR'].map(
		web3.utils.asciiToHex
	);

	const [deployerAccount, owner, account1, account2, account3, account4] = accounts;

	let havven, exchangeRates;

	beforeEach(async function() {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		havven = await Havven.deployed();
		exchangeRates = await ExchangeRates.deployed();

		// Send a price update to guarantee we're not stale.

		const oracle = await exchangeRates.oracle();
		const { timestamp } = await web3.eth.getBlock('latest');

		await exchangeRates.updateRates(
			[nUSD, nAUD, nEUR, HAV],
			['1', '0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{
				from: oracle,
			}
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
		const nUSDContract = await havven.nomins(nUSD);

		// Assert that we can remove the nomin and add it back in before we do anything.
		let transaction = await havven.removeNomin(nUSD, { from: owner });
		assert.eventEqual(transaction, 'NominRemoved', {
			currencyKey: nUSD,
			removedNomin: nUSDContract,
		});
		transaction = await havven.addNomin(nUSDContract, { from: owner });
		assert.eventEqual(transaction, 'NominAdded', { currencyKey: nUSD, newNomin: nUSDContract });

		// Issue one nUSD
		await havven.issueNomins(nUSD, toUnit('1'), { from: owner });

		// Assert that we can't remove the nomin now
		await assert.revert(havven.removeNomin(nUSD, { from: owner }));
	});

	it('should disallow removing a Nomin contract when requested by a non-owner', async function() {
		// Note: This test depends on state in the migration script, that there are hooked up nomins
		// without balances
		await assert.revert(havven.removeNomin(nEUR, { from: account1 }));
	});

	it('should revert when requesting to remove a non-existent nomin', async function() {
		// Note: This test depends on state in the migration script, that there are hooked up nomins
		// without balances
		const currencyKey = web3.utils.asciiToHex('NOPE');

		// Assert that we can't remove the nomin
		await assert.revert(havven.removeNomin(currencyKey, { from: owner }));
	});

	it('should allow the owner to set an Escrow contract', async function() {
		const transaction = await havven.setEscrow(account1, { from: owner });

		assert.eventEqual(transaction, 'EscrowUpdated', { newEscrow: account1 });
	});

	it('should disallow a non-owner from setting an Escrow contract', async function() {
		await assert.revert(havven.setEscrow(account1, { from: account1 }));
	});

	it('should allow the owner to set fee period duration', async function() {
		// Set fee period to 5 days
		const duration = 5 * 24 * 60 * 60;
		const transaction = await havven.setFeePeriodDuration(web3.utils.toBN(duration), {
			from: owner,
		});

		assert.eventEqual(transaction, 'FeePeriodDurationUpdated', { duration });
	});

	it('should disallow a non-owner from setting the fee period duration', async function() {
		// Try to set fee period to 5 days
		const duration = 5 * 24 * 60 * 60;
		await assert.revert(
			havven.setFeePeriodDuration(web3.utils.toBN(duration), {
				from: account1,
			})
		);
	});

	it('should disallow setting the fee period duration below the minimum fee period duration', async function() {
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
		const transaction = await havven.setExchangeRates(account1, { from: owner });

		assert.eventEqual(transaction, 'ExchangeRatesUpdated', { newExchangeRates: account1 });
	});

	it('should disallow a non-owner from setting an Exchange Rates contract', async function() {
		await assert.revert(havven.setExchangeRates(account1, { from: account1 }));
	});

	it('should allow the owner to set the issuance ratio', async function() {
		const ratio = toUnit('0.2');

		const transaction = await havven.setIssuanceRatio(ratio, {
			from: owner,
		});

		assert.eventEqual(transaction, 'IssuanceRatioUpdated', { newRatio: ratio });
	});

	it('should allow the owner to set the issuance ratio to zero', async function() {
		const ratio = web3.utils.toBN('0');

		const transaction = await havven.setIssuanceRatio(ratio, {
			from: owner,
		});

		assert.eventEqual(transaction, 'IssuanceRatioUpdated', { newRatio: ratio });
	});

	it('should disallow a non-owner from setting the issuance ratio', async function() {
		const ratio = toUnit('0.2');

		await assert.revert(
			havven.setIssuanceRatio(ratio, {
				from: account1,
			})
		);
	});

	it('should disallow setting the issuance ratio above the MAX ratio', async function() {
		const max = toUnit('1');

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
		assert.equal(await havven.isIssuer(account1), false);

		const transaction = await havven.setIssuer(account1, true, { from: owner });
		assert.eventEqual(transaction, 'IssuerUpdated', { account: account1, value: true });

		assert.equal(await havven.isIssuer(account1), true);
	});

	it('should disallow a non-owner from adding someone as a whitelisted issuer', async function() {
		assert.equal(await havven.isIssuer(account1), false);

		await assert.revert(havven.setIssuer(account1, true, { from: account1 }));
	});

	it('should correctly calculate an exchange rate in effectiveValue()', async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[nUSD, nAUD, nEUR, HAV],
			['1', '0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// 1 nUSD should be worth 2 nAUD.
		assert.bnEqual(await havven.effectiveValue(nUSD, toUnit('1'), nAUD), toUnit('2'));

		// 10 HAV should be worth 1 nUSD.
		assert.bnEqual(await havven.effectiveValue(HAV, toUnit('10'), nUSD), toUnit('1'));

		// 2 nEUR should be worth 2.50 nUSD
		assert.bnEqual(await havven.effectiveValue(nEUR, toUnit('2'), nUSD), toUnit('2.5'));
	});

	it('should error when relying on a stale exchange rate in effectiveValue()', async function() {
		// Send a price update so we know what time we started with.
		const oracle = await exchangeRates.oracle();
		let timestamp = await currentTime();

		await exchangeRates.updateRates(
			[nUSD, nAUD, nEUR, HAV],
			['1', '0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Add stale period to the time to ensure we go stale.
		await fastForward(await exchangeRates.rateStalePeriod());

		timestamp = await currentTime();

		// Update all rates except nUSD.
		await exchangeRates.updateRates(
			[nAUD, nEUR, HAV],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Should now be able to convert from HAV to nAUD
		assert.bnEqual(await havven.effectiveValue(HAV, toUnit('10'), nAUD), toUnit('2'));

		// But trying to convert from HAV to nUSD should fail
		await assert.revert(havven.effectiveValue(HAV, toUnit('10'), nUSD));
	});

	it('should revert when relying on a non-existant exchange rate in effectiveValue()', async function() {
		// Send a price update so we know what time we started with.
		const oracle = await exchangeRates.oracle();
		let timestamp = await currentTime();

		await exchangeRates.updateRates(
			[nUSD, nAUD, nEUR, HAV],
			['1', '0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		await assert.revert(havven.effectiveValue(HAV, toUnit('10'), web3.utils.asciiToHex('XYZ')));
	});

	it('should correctly calculate the total issued nomins in a single currency', async function() {
		// Two people issue 10 nUSD each. Assert that total issued value is 20 nUSD.

		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[nUSD, nAUD, nEUR, HAV],
			['1', '0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some HAV to account1 and account2
		await havven.transfer(account1, toUnit('1000'), { from: owner });
		await havven.transfer(account2, toUnit('1000'), { from: owner });

		// Make them issuers
		await havven.setIssuer(account1, true, { from: owner });
		await havven.setIssuer(account2, true, { from: owner });

		// Issue 10 nUSD each
		await havven.issueNomins(nUSD, toUnit('10'), { from: account1 });
		await havven.issueNomins(nUSD, toUnit('10'), { from: account2 });

		// Assert that there's 20 nUSD of value in the system
		assert.bnEqual(await havven.totalIssuedNomins(nUSD), toUnit('20'));
	});

	it('should correctly calculate the total issued nomins in multiple currencies', async function() {
		// Alice issues 10 nUSD. Bob issues 20 nAUD. Assert that total issued value is 20 nUSD, and 40 nAUD.

		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[nUSD, nAUD, nEUR, HAV],
			['1', '0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some HAV to account1 and account2
		await havven.transfer(account1, toUnit('1000'), { from: owner });
		await havven.transfer(account2, toUnit('1000'), { from: owner });

		// Make them issuers
		await havven.setIssuer(account1, true, { from: owner });
		await havven.setIssuer(account2, true, { from: owner });

		// Issue 10 nUSD each
		await havven.issueNomins(nUSD, toUnit('10'), { from: account1 });
		await havven.issueNomins(nAUD, toUnit('20'), { from: account2 });

		// Assert that there's 20 nUSD of value in the system
		assert.bnEqual(await havven.totalIssuedNomins(nUSD), toUnit('20'));

		// And that there's 40 nAUD of value in the system
		assert.bnEqual(await havven.totalIssuedNomins(nAUD), toUnit('40'));
	});

	it('should transfer using the ERC20 transfer function', async function() {
		// Ensure our environment is set up correctly for our assumptions
		// e.g. owner owns all HAV.
		assert.bnEqual(await havven.totalSupply(), await havven.balanceOf(owner));

		const transaction = await havven.transfer(account1, toUnit('10'), { from: owner });
		assert.eventEqual(transaction, 'Transfer', {
			from: owner,
			to: account1,
			value: toUnit('10'),
		});

		assert.bnEqual(await havven.balanceOf(account1), toUnit('10'));
	});

	it('should revert when exceeding locked havvens and calling the ERC20 transfer function', async function() {
		// Ensure our environment is set up correctly for our assumptions
		// e.g. owner owns all HAV.
		assert.bnEqual(await havven.totalSupply(), await havven.balanceOf(owner));

		// Issue max nomins.
		await havven.issueMaxNomins(nUSD, { from: owner });

		// Try to transfer 0.000000000000000001 HAV
		await assert.revert(havven.transfer(account1, '1', { from: owner }));
	});

	it('should transfer using the ERC20 transferFrom function', async function() {
		// Ensure our environment is set up correctly for our assumptions
		// e.g. owner owns all HAV.
		const previousOwnerBalance = await havven.balanceOf(owner);
		assert.bnEqual(await havven.totalSupply(), previousOwnerBalance);

		// Approve account1 to act on our behalf for 10 HAV.
		let transaction = await havven.approve(account1, toUnit('10'), { from: owner });
		assert.eventEqual(transaction, 'Approval', {
			owner,
			spender: account1,
			value: toUnit('10'),
		});

		// Assert that transferFrom works.
		transaction = await havven.transferFrom(owner, account2, toUnit('10'), { from: account1 });
		assert.eventEqual(transaction, 'Transfer', {
			from: owner,
			to: account2,
			value: toUnit('10'),
		});

		// Assert that account2 has 10 HAV and owner has 10 less HAV
		assert.bnEqual(await havven.balanceOf(account2), toUnit('10'));
		assert.bnEqual(await havven.balanceOf(owner), previousOwnerBalance.sub(toUnit('10')));

		// Assert that we can't transfer more even though there's a balance for owner.
		await assert.revert(havven.transferFrom(owner, account2, '1', { from: account1 }));
	});

	it('should revert when exceeding locked havvens and calling the ERC20 transferFrom function', async function() {
		// Ensure our environment is set up correctly for our assumptions
		// e.g. owner owns all HAV.
		assert.bnEqual(await havven.totalSupply(), await havven.balanceOf(owner));

		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[nUSD, nAUD, nEUR, HAV],
			['1', '0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Approve account1 to act on our behalf for 10 HAV.
		let transaction = await havven.approve(account1, toUnit('10'), { from: owner });
		assert.eventEqual(transaction, 'Approval', {
			owner,
			spender: account1,
			value: toUnit('10'),
		});

		// Issue max nomins
		await havven.issueMaxNomins(nUSD, { from: owner });

		// Assert that transferFrom fails even for the smallest amount of HAV.
		await assert.revert(havven.transferFrom(owner, account2, '1', { from: account1 }));
	});

	it('should transfer using the ERC223 transfer function', async function() {
		// Ensure our environment is set up correctly for our assumptions
		// e.g. owner owns all HAV.
		assert.bnEqual(await havven.totalSupply(), await havven.balanceOf(owner));

		const transaction = await havven.transfer(
			account1,
			toUnit('10'),
			web3.utils.asciiToHex('This is a memo'),
			{ from: owner }
		);

		// Note, this is an ERC20 event, not ERC223 to maintain backwards compatibility with
		// tools that expect ERC20 events, since solidity does not support event overloading.
		assert.eventEqual(transaction, 'Transfer', {
			from: owner,
			to: account1,
			value: toUnit('10'),
		});

		assert.bnEqual(await havven.balanceOf(account1), toUnit('10'));
	});

	it('should revert when exceeding locked havvens and calling the ERC223 transfer function', async function() {
		// Ensure our environment is set up correctly for our assumptions
		// e.g. owner owns all HAV.
		assert.bnEqual(await havven.totalSupply(), await havven.balanceOf(owner));

		// Issue max nomins.
		await havven.issueMaxNomins(nUSD, { from: owner });

		// Try to transfer 0.000000000000000001 HAV
		await assert.revert(
			havven.transfer(account1, '1', web3.utils.asciiToHex('This is a memo'), { from: owner })
		);
	});

	it('should transfer using the ERC223 transferFrom function', async function() {
		// Ensure our environment is set up correctly for our assumptions
		// e.g. owner owns all HAV.
		const previousOwnerBalance = await havven.balanceOf(owner);
		assert.bnEqual(await havven.totalSupply(), previousOwnerBalance);

		// Approve account1 to act on our behalf for 10 HAV.
		let transaction = await havven.approve(account1, toUnit('10'), { from: owner });
		assert.eventEqual(transaction, 'Approval', {
			owner,
			spender: account1,
			value: toUnit('10'),
		});

		// Assert that transferFrom works.
		transaction = await havven.transferFrom(
			owner,
			account2,
			toUnit('10'),
			web3.utils.asciiToHex('This is a memo'),
			{ from: account1 }
		);
		assert.eventEqual(transaction, 'Transfer', {
			from: owner,
			to: account2,
			value: toUnit('10'),
		});

		// Assert that account2 has 10 HAV and owner has 10 less HAV
		assert.bnEqual(await havven.balanceOf(account2), toUnit('10'));
		assert.bnEqual(await havven.balanceOf(owner), previousOwnerBalance.sub(toUnit('10')));

		// Assert that we can't transfer more even though there's a balance for owner.
		await assert.revert(havven.transferFrom(owner, account2, '1', { from: account1 }));
	});

	it('should revert when exceeding locked havvens and calling the ERC223 transferFrom function', async function() {
		// Ensure our environment is set up correctly for our assumptions
		// e.g. owner owns all HAV.
		assert.bnEqual(await havven.totalSupply(), await havven.balanceOf(owner));

		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[nUSD, nAUD, nEUR, HAV],
			['1', '0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Approve account1 to act on our behalf for 10 HAV.
		let transaction = await havven.approve(account1, toUnit('10'), { from: owner });
		assert.eventEqual(transaction, 'Approval', {
			owner,
			spender: account1,
			value: toUnit('10'),
		});

		// Issue max nomins
		await havven.issueMaxNomins(nUSD, { from: owner });

		// Assert that transferFrom fails even for the smallest amount of HAV.
		await assert.revert(
			havven.transferFrom(owner, account2, '1', web3.utils.asciiToHex('This is a memo'), {
				from: account1,
			})
		);
	});

	it('should allow a whitelisted issuer to issue nomins in one flavour', async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[nUSD, nAUD, nEUR, HAV],
			['1', '0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some HAV to account1
		await havven.transfer(account1, toUnit('1000'), { from: owner });

		// Make account1 an issuer
		await havven.setIssuer(account1, true, { from: owner });

		// account1 should be able to issue
		await havven.issueNomins(nUSD, toUnit('10'), { from: account1 });

		// There should be 10 nUSD of value in the system
		assert.bnEqual(await havven.totalIssuedNomins(nUSD), toUnit('10'));

		// And account1 should own 100% of the debt.
		assert.bnEqual(await havven.totalIssuedNomins(nUSD), toUnit('10'));
		assert.bnEqual(await havven.debtBalanceOf(account1, nUSD), toUnit('10'));
	});

	it('should allow a whitelisted issuer to issue nomins in multiple flavours', async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[nUSD, nAUD, nEUR, HAV],
			['1', '0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some HAV to account1
		await havven.transfer(account1, toUnit('1000'), { from: owner });

		// Make account1 an issuer
		await havven.setIssuer(account1, true, { from: owner });

		// account1 should be able to issue nUSD and nAUD
		await havven.issueNomins(nUSD, toUnit('10'), { from: account1 });
		logIssuanceData(await havven.issuanceData(account1));

		await havven.issueNomins(nAUD, toUnit('20'), { from: account1 });
		logIssuanceData(await havven.issuanceData(account1));

		// There should be 20 nUSD of value in the system
		assert.bnEqual(await havven.totalIssuedNomins(nUSD), toUnit('20'));
		// Which equals 40 nAUD of value in the system
		assert.bnEqual(await havven.totalIssuedNomins(nAUD), toUnit('40'));

		// And account1 should own 100% of the debt.
		assert.bnEqual(await havven.debtBalanceOf(account1, nUSD), toUnit('20'));
		assert.bnEqual(await havven.debtBalanceOf(account1, nAUD), toUnit('40'));
	});

	it('should allow two issuers to issue nomins in one flavour', async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[nUSD, nAUD, nEUR, HAV],
			['1', '0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some HAV to account1 and account2
		await havven.transfer(account1, toUnit('10000'), { from: owner });
		await havven.transfer(account2, toUnit('10000'), { from: owner });

		// Make accounts issuers
		await havven.setIssuer(account1, true, { from: owner });
		await havven.setIssuer(account2, true, { from: owner });

		// Issue
		await havven.issueNomins(nUSD, toUnit('10'), { from: account1 });

		console.log('-----------------------');
		console.log('Account1 Debt', fromUnit(await havven.debtBalanceOf(account1, nUSD)));
		console.log('Account2 Debt', fromUnit(await havven.debtBalanceOf(account2, nUSD)));
		let debtLedger = [];
		for (let i = 0; i < 1; i++) {
			debtLedger.push(fromUnit(await havven.debtLedger(i)));
		}
		console.log(`debtLedger[${debtLedger.join(', ')}]`);

		await havven.issueNomins(nUSD, toUnit('20'), { from: account2 });

		console.log('-----------------------');
		console.log('Account1 Debt', fromUnit(await havven.debtBalanceOf(account1, nUSD)));
		console.log('Account2 Debt', fromUnit(await havven.debtBalanceOf(account2, nUSD)));
		debtLedger = [];
		for (let i = 0; i < 2; i++) {
			debtLedger.push(fromUnit(await havven.debtLedger(i)));
		}
		console.log(`debtLedger[${debtLedger.join(', ')}]`);

		await havven.issueNomins(nUSD, toUnit('10'), { from: account1 });

		console.log('-----------------------');
		console.log('Account1 Debt', fromUnit(await havven.debtBalanceOf(account1, nUSD)));
		console.log('Account2 Debt', fromUnit(await havven.debtBalanceOf(account2, nUSD)));
		debtLedger = [];
		for (let i = 0; i < 3; i++) {
			debtLedger.push(fromUnit(await havven.debtLedger(i)));
		}
		console.log(`debtLedger[${debtLedger.join(', ')}]`);

		// There should be 40 nUSD of value in the system
		assert.bnEqual(await havven.totalIssuedNomins(nUSD), toUnit('40'));

		// And the debt should be split 50/50.
		assert.bnEqual(await havven.debtBalanceOf(account1, nUSD), toUnit('20'));

		// But there's a small rounding error.
		// This is ok, as when the last person exits the system, their debt percentage is always 100% so
		// these rounding errors don't cause the system to be out of balance.
		assert.bnEqual(await havven.debtBalanceOf(account2, nUSD), toUnit('19.99999999999999992'));
	});

	it('should allow multi-issuance in one flavour', async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[nUSD, nAUD, nEUR, HAV],
			['1', '0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some HAV to account1 and account2
		await havven.transfer(account1, toUnit('10000'), { from: owner });
		await havven.transfer(account2, toUnit('10000'), { from: owner });

		// Make accounts issuers
		await havven.setIssuer(account1, true, { from: owner });
		await havven.setIssuer(account2, true, { from: owner });

		// Issue
		await havven.issueNomins(nUSD, toUnit('10'), { from: account1 });
		await havven.issueNomins(nUSD, toUnit('20'), { from: account2 });
		await havven.issueNomins(nUSD, toUnit('10'), { from: account1 });

		// There should be 40 nUSD of value in the system
		assert.bnEqual(await havven.totalIssuedNomins(nUSD), toUnit('40'));

		// And the debt should be split 50/50.
		assert.bnEqual(await havven.debtBalanceOf(account1, nUSD), toUnit('20'));

		// But there's a small rounding error.
		// This is ok, as when the last person exits the system, their debt percentage is always 100% so
		// these rounding errors don't cause the system to be out of balance.
		assert.bnEqual(await havven.debtBalanceOf(account2, nUSD), toUnit('19.99999999999999992'));
	});

	it('should allow multiple issuers to issue nomins in multiple flavours', async function() {});

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
