const ExchangeRates = artifacts.require('ExchangeRates');
const Escrow = artifacts.require('HavvenEscrow');
const FeePool = artifacts.require('FeePool');
const Havven = artifacts.require('Havven');
const Nomin = artifacts.require('Nomin');

const {
	assertBNClose,
	assertUnitEqual,
	currentTime,
	fastForward,
	multiplyDecimal,
	divideDecimal,
	toUnit,
	ZERO_ADDRESS,
} = require('../utils/testUtils');

contract.only('Havven', async function(accounts) {
	const [nUSD, nAUD, nEUR, HAV, HDR, nXYZ] = ['nUSD', 'nAUD', 'nEUR', 'HAV', 'HDR', 'nXYZ'].map(
		web3.utils.asciiToHex
	);

	const [deployerAccount, owner, account1, account2, account3, account4, account5] = accounts;

	let havven, exchangeRates, nUSDContract, nAUDContract;

	beforeEach(async function() {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		exchangeRates = await ExchangeRates.deployed();

		havven = await Havven.deployed();
		nUSDContract = await Nomin.at(await havven.nomins(nUSD));
		nAUDContract = await Nomin.at(await havven.nomins(nAUD));

		// Send a price update to guarantee we're not stale.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

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
		// constructor(address _proxy, TokenState _tokenState, address _owner, ExchangeRates _exchangeRates, FeePool _feePool, Havven _oldHavven)
		const instance = await Havven.new(
			account1,
			account2,
			account3,
			account4,
			account5,
			ZERO_ADDRESS,
			{
				from: deployerAccount,
			}
		);

		assert.equal(await instance.proxy(), account1);
		assert.equal(await instance.tokenState(), account2);
		assert.equal(await instance.owner(), account3);
		assert.equal(await instance.exchangeRates(), account4);
		assert.equal(await instance.feePool(), account5);
		// TODO: Fee period start time check
		// TODO: Last fee period start time check
	});

	it('should correctly upgrade from the previous nUSD contract deployment');

	it('should allow adding a Nomin contract', async function() {
		const previousNominCount = await havven.availableNominCount();

		const nomin = await Nomin.new(
			account1,
			account2,
			Havven.address,
			FeePool.address,
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
			FeePool.address,
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
			FeePool.address,
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
			FeePool.address,
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
			FeePool.address,
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

		// TODO: Check that an event was successfully fired ?
	});

	it('should disallow removing a Nomin contract when it has an issued balance', async function() {
		// Note: This test depends on state in the migration script, that there are hooked up nomins
		// without balances
		const nUSDContractAddress = await havven.nomins(nUSD);

		// Assert that we can remove the nomin and add it back in before we do anything.
		let transaction = await havven.removeNomin(nUSD, { from: owner });
		assert.eventEqual(transaction, 'NominRemoved', {
			currencyKey: nUSD,
			removedNomin: nUSDContractAddress,
		});
		transaction = await havven.addNomin(nUSDContractAddress, { from: owner });
		assert.eventEqual(transaction, 'NominAdded', {
			currencyKey: nUSD,
			newNomin: nUSDContractAddress,
		});

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

	// Escrow

	it('should allow the owner to set an Escrow contract', async function() {
		const transaction = await havven.setEscrow(account1, { from: owner });

		assert.eventEqual(transaction, 'EscrowUpdated', { newEscrow: account1 });
	});

	it('should disallow a non-owner from setting an Escrow contract', async function() {
		await assert.revert(havven.setEscrow(account1, { from: account1 }));
	});

	// Set fees

	// it('should allow the owner to set fee period duration', async function() {
	// 	// Set fee period to 5 days
	// 	const duration = 5 * 24 * 60 * 60;
	// 	const transaction = await havven.setFeePeriodDuration(web3.utils.toBN(duration), {
	// 		from: owner,
	// 	});

	// 	assert.eventEqual(transaction, 'FeePeriodDurationUpdated', { duration });
	// });

	// it('should disallow a non-owner from setting the fee period duration', async function() {
	// 	// Try to set fee period to 5 days
	// 	const duration = 5 * 24 * 60 * 60;
	// 	await assert.revert(
	// 		havven.setFeePeriodDuration(web3.utils.toBN(duration), {
	// 			from: account1,
	// 		})
	// 	);
	// });

	// it('should disallow setting the fee period duration below the minimum fee period duration', async function() {
	// 	// Minimum is currently 1 day in the contract
	// 	const minimum = 60 * 60 * 24;

	// 	// Setting to the minimum should succeed
	// 	const transaction = await havven.setFeePeriodDuration(web3.utils.toBN(minimum), {
	// 		from: owner,
	// 	});
	// 	assert.eventEqual(transaction, 'FeePeriodDurationUpdated', { duration: minimum });

	// 	// While setting to minimum - 1 should fail
	// 	await assert.revert(
	// 		havven.setFeePeriodDuration(web3.utils.toBN(minimum - 1), {
	// 			from: owner,
	// 		})
	// 	);
	// });

	// it('should disallow setting the fee period duration above the maximum fee period duration', async function() {
	// 	// Maximum is currently 26 weeks in the contract
	// 	const maximum = 60 * 60 * 24 * 7 * 26;

	// 	// Setting to the maximum should succeed
	// 	const transaction = await havven.setFeePeriodDuration(web3.utils.toBN(maximum), {
	// 		from: owner,
	// 	});
	// 	assert.eventEqual(transaction, 'FeePeriodDurationUpdated', { duration: maximum });

	// 	// While setting to maximum + 1 should fail
	// 	await assert.revert(
	// 		havven.setFeePeriodDuration(web3.utils.toBN(maximum + 1), {
	// 			from: owner,
	// 		})
	// 	);
	// });

	// Exchange Rates contract

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

	// Issuance ratio

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

	// Effective value

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
			[nUSD, nEUR, HAV],
			['1', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		const amountOfHavvens = toUnit('10');
		const amountOfEur = toUnit('0.8');

		// Should now be able to convert from HAV to nEUR
		assert.bnEqual(await havven.effectiveValue(HAV, amountOfHavvens, nEUR), amountOfEur);

		// But trying to convert from HAV to nAUD should fail
		await assert.revert(havven.effectiveValue(HAV, toUnit('10'), nAUD));
		await assert.revert(havven.effectiveValue(nAUD, toUnit('10'), HAV));
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

	// totalIssuedNomins

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

		// Issue 10 nUSD each
		await havven.issueNomins(nUSD, toUnit('10'), { from: account1 });
		await havven.issueNomins(nAUD, toUnit('20'), { from: account2 });

		// Assert that there's 20 nUSD of value in the system
		assert.bnEqual(await havven.totalIssuedNomins(nUSD), toUnit('20'));

		// And that there's 40 nAUD of value in the system
		assert.bnEqual(await havven.totalIssuedNomins(nAUD), toUnit('40'));
	});

	it('should return the correct value for the different quantity of total issued nomins', async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		const rates = [toUnit('1'), toUnit('0.5'), toUnit('1.25'), toUnit('0.1')];

		await exchangeRates.updateRates([nUSD, nAUD, nEUR, HAV], rates, timestamp, { from: oracle });

		// const hav2usdRate = await exchangeRates.rateForCurrency(HAV);
		const aud2usdRate = await exchangeRates.rateForCurrency(nAUD);
		const eur2usdRate = await exchangeRates.rateForCurrency(nEUR);
		const eur2audRate = divideDecimal(eur2usdRate, aud2usdRate);
		const usd2audRate = divideDecimal(toUnit('1'), aud2usdRate);

		// Give some HAV to account1 and account2
		await havven.transfer(account1, toUnit('100000'), { from: owner });
		await havven.transfer(account2, toUnit('100000'), { from: owner });

		// Issue
		const issueAmountAUD = toUnit('10');
		const issueAmountUSD = toUnit('5');
		const issueAmountEUR = toUnit('7.4342');

		await havven.issueNomins(nUSD, issueAmountUSD, { from: account1 });
		await havven.issueNomins(nEUR, issueAmountEUR, { from: account1 });
		await havven.issueNomins(nAUD, issueAmountAUD, { from: account1 });
		await havven.issueNomins(nUSD, issueAmountUSD, { from: account2 });
		await havven.issueNomins(nEUR, issueAmountEUR, { from: account2 });
		await havven.issueNomins(nAUD, issueAmountAUD, { from: account2 });

		const aud = issueAmountAUD.add(issueAmountAUD);
		const eur = multiplyDecimal(issueAmountEUR.add(issueAmountEUR), eur2audRate);
		const usd = multiplyDecimal(issueAmountUSD.add(issueAmountUSD), usd2audRate);
		const totalExpectedIssuedNAUD = aud.add(eur).add(usd);
		const totalIssuedAUD = await havven.totalIssuedNomins(nAUD);

		assert.bnEqual(totalExpectedIssuedNAUD, totalIssuedAUD);
	});

	it('should not allow checking total issued nomins when a rate other than the priced currency is stale', async function() {
		await fastForward((await exchangeRates.rateStalePeriod()).add(web3.utils.toBN('300')));
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[HAV, nUSD, nAUD],
			['0.1', '1', '0.78'].map(toUnit),
			timestamp,
			{ from: oracle }
		);
		await assert.revert(havven.totalIssuedNomins(nAUD));
	});

	it('should not allow checking total issued nomins when the priced currency is stale', async function() {
		await fastForward((await exchangeRates.rateStalePeriod()).add(web3.utils.toBN('300')));
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[HAV, nUSD, nEUR],
			['0.1', '1', '1.25'].map(toUnit),
			timestamp,
			{ from: oracle }
		);
		await assert.revert(havven.totalIssuedNomins(nAUD));
	});

	// transfer

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

	it('should not allow transfer if the exchange rate for havvens is stale', async function() {
		// Give some HAV to account1 & account2
		const value = toUnit('300');
		await havven.transfer(account1, toUnit('10000'), { from: owner });
		await havven.transfer(account2, toUnit('10000'), { from: owner });

		// Ensure that we can do a successful transfer before rates go stale
		await havven.transfer(account2, value, { from: account1 });
		const data = web3.utils.asciiToHex('This is a memo');
		await havven.transfer(account2, value, data, { from: account1 });

		await havven.approve(account3, value, { from: account2 });
		await havven.transferFrom(account2, account1, value, { from: account3 });
		await havven.approve(account3, value, { from: account2 });
		await havven.transferFrom(account2, account1, value, data, { from: account3 });

		// Now jump forward in time so the rates are stale
		await fastForward(await exchangeRates.rateStalePeriod());

		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[nUSD, nAUD, nEUR],
			['1', '0.5', '1.25'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Subsequent transfers fail
		await assert.revert(havven.transfer(account2, value, { from: account1 }));
		await assert.revert(havven.transfer(account2, value, data), { from: account1 });

		await havven.approve(account3, value, { from: account2 });
		await assert.revert(havven.transferFrom(account2, account1, value, { from: account3 }));
		await assert.revert(havven.transferFrom(account2, account1, value, data, { from: account3 }));
	});

	it('should not allow transfer of havvens in escrow', async function() {
		// Setup escrow
		const escrow = await Escrow.new(owner, havven.address, { from: owner });
		await havven.setEscrow(escrow.address, { from: owner });
		const oneWeek = 60 * 60 * 24 * 7;
		const twelveWeeks = oneWeek * 12;
		const now = await currentTime();
		const escrowedHavvens = toUnit('30000');
		await havven.transfer(escrow.address, escrowedHavvens, { from: owner });
		await escrow.appendVestingEntry(account1, web3.utils.toBN(now + twelveWeeks), escrowedHavvens, {
			from: owner,
		});

		// Ensure the transfer fails as all the havvens are in escrow
		await assert.revert(havven.transfer(account2, toUnit('100'), { from: account1 }));
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

	// Issuance

	// TODO: Adding the exchange rates together for the HDR exchange value increases the chance that the amount
	//  to be issued will be < 1 (ie. the smallest unit possible). This means that the user will in effect end up issuing
	//  0 as we can't do any amounts less than 1 in Solidity.
	//  Also, it seems that SafeDecimalMath truncates and doesn't round. So, 0.78 becomes 0 instead of 1. Is this a problem?
	//  Generally storing everything in HDRs means that some nomins that need smaller units becomes the victim of lost value
	//  But then again, maybe that is why we use 18 decimal places, so we can ignore the lost value?
	it('should be possible to issue a small amount of nomins', async function() {
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

		// account1 should be able to issue
		await havven.issueNomins(nUSD, web3.utils.toBN('1'), { from: account1 });

		// const txn = await havven.issueNomins(nUSD, web3.utils.toBN('1'), { from: account1 });
		// console.log('##### txn', txn);
		// for (let i = 0; i < txn.logs.length; i++) {
		// 	const result = txn.logs[i].args;
		// 	console.log('##### txn ???', result);
		// 	for (let j = 0; j < result.__length__; j++) {
		// 		if (txn.logs[i].event === web3.utils.asciiToHex('SomethingElse') && j === 0) {
		// 			console.log(`##### txn str ${i}`, web3.utils.hexToAscii(txn.logs[i].args[j]));
		// 		} else {
		// 			console.log(`##### txn ${i}`, txn.logs[i].args[j].toString());
		// 		}
		// 	}
		// }
	});

	it('should be possible to issue the maximum amount of nomins via issueNomins', async function() {
		// Give some HAV to account1
		await havven.transfer(account1, toUnit('1000'), { from: owner });

		const maxNomins = await havven.maxIssuableNomins(account1, nUSD);

		// account1 should be able to issue
		await havven.issueNomins(nUSD, maxNomins, { from: account1 });
	});

	it('should allow an issuer to issue nomins in one flavour', async function() {
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

		// account1 should be able to issue
		await havven.issueNomins(nUSD, toUnit('10'), { from: account1 });

		// There should be 10 nUSD of value in the system
		assert.bnEqual(await havven.totalIssuedNomins(nUSD), toUnit('10'));

		// And account1 should own 100% of the debt.
		assert.bnEqual(await havven.totalIssuedNomins(nUSD), toUnit('10'));
		assert.bnEqual(await havven.debtBalanceOf(account1, nUSD), toUnit('10'));
	});

	it('should allow an issuer to issue nomins in multiple flavours', async function() {
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

		// account1 should be able to issue nUSD and nAUD
		await havven.issueNomins(nUSD, toUnit('10'), { from: account1 });
		await havven.issueNomins(nAUD, toUnit('20'), { from: account1 });

		// There should be 20 nUSD of value in the system
		assert.bnEqual(await havven.totalIssuedNomins(nUSD), toUnit('20'));
		// Which equals 40 nAUD of value in the system
		assert.bnEqual(await havven.totalIssuedNomins(nAUD), toUnit('40'));

		// And account1 should own 100% of the debt.
		assert.bnEqual(await havven.debtBalanceOf(account1, nUSD), toUnit('20'));
		assert.bnEqual(await havven.debtBalanceOf(account1, nAUD), toUnit('40'));
	});

	// TODO: Check that the rounding errors are acceptable
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

		// Issue
		await havven.issueNomins(nUSD, toUnit('10'), { from: account1 });
		await havven.issueNomins(nUSD, toUnit('20'), { from: account2 });

		// There should be 30nUSD of value in the system
		assert.bnEqual(await havven.totalIssuedNomins(nUSD), toUnit('30'));

		// And the debt should be split 50/50.
		// But there's a small rounding error.
		// This is ok, as when the last person exits the system, their debt percentage is always 100% so
		// these rounding errors don't cause the system to be out of balance.
		assert.bnEqual(await havven.debtBalanceOf(account1, nUSD), toUnit('10.00000000000000002'));
		assert.bnEqual(await havven.debtBalanceOf(account2, nUSD), toUnit('19.99999999999999998'));
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

		// Issue
		await havven.issueNomins(nUSD, toUnit('10'), { from: account1 });
		await havven.issueNomins(nUSD, toUnit('20'), { from: account2 });
		await havven.issueNomins(nUSD, toUnit('10'), { from: account1 });

		// There should be 40 nUSD of value in the system
		assert.bnEqual(await havven.totalIssuedNomins(nUSD), toUnit('40'));

		// And the debt should be split 50/50.
		// But there's a small rounding error.
		// This is ok, as when the last person exits the system, their debt percentage is always 100% so
		// these rounding errors don't cause the system to be out of balance.
		assert.bnEqual(await havven.debtBalanceOf(account1, nUSD), toUnit('20'));
		assert.bnEqual(await havven.debtBalanceOf(account2, nUSD), toUnit('19.99999999999999992'));
	});

	it('should allow multiple issuers to issue nomins in multiple flavours', async function() {
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

		// Issue
		await havven.issueNomins(nUSD, toUnit('10'), { from: account1 });
		await havven.issueNomins(nAUD, toUnit('20'), { from: account2 });

		// There should be 20 nUSD of value in the system
		assert.bnEqual(await havven.totalIssuedNomins(nUSD), toUnit('20'));

		// And the debt should be split 50/50.
		// But there's a small rounding error.
		// This is ok, as when the last person exits the system, their debt percentage is always 100% so
		// these rounding errors don't cause the system to be out of balance.
		assert.bnEqual(await havven.debtBalanceOf(account1, nUSD), toUnit('10'));
		assert.bnEqual(await havven.debtBalanceOf(account2, nUSD), toUnit('10'));
	});

	it('should allow an issuer to issue max nomins in one flavour', async function() {
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
		await havven.transfer(account1, toUnit('10000'), { from: owner });

		// Issue
		await havven.issueMaxNomins(nUSD, { from: account1 });

		// There should be 200 nUSD of value in the system
		assert.bnEqual(await havven.totalIssuedNomins(nUSD), toUnit('200'));

		// And account1 should own all of it.
		assert.bnEqual(await havven.debtBalanceOf(account1, nUSD), toUnit('200'));
	});

	it('should allow an issuer to issue max nomins via the standard issue call', async function() {
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
		await havven.transfer(account1, toUnit('10000'), { from: owner });

		// Determine maximum amount that can be issued.
		const maxIssuable = await havven.maxIssuableNomins(account1, nUSD);

		// Issue
		await havven.issueNomins(nUSD, maxIssuable, { from: account1 });

		// There should be 200 nUSD of value in the system
		assert.bnEqual(await havven.totalIssuedNomins(nUSD), toUnit('200'));

		// And account1 should own all of it.
		assert.bnEqual(await havven.debtBalanceOf(account1, nUSD), toUnit('200'));
	});

	it('should disallow an issuer from issuing nomins in a non-existant flavour', async function() {
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
		await havven.transfer(account1, toUnit('10000'), { from: owner });

		// They should now be able to issue nUSD
		await havven.issueNomins(nUSD, toUnit('10'), { from: account1 });

		// But should not be able to issue nXYZ because it doesn't exist
		await assert.revert(havven.issueNomins(nXYZ, toUnit('10')));
	});

	it('should disallow an issuer from issuing nomins beyond their remainingIssuableNomins', async function() {
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
		await havven.transfer(account1, toUnit('10000'), { from: owner });

		// They should now be able to issue nUSD
		const issuableNomins = await havven.remainingIssuableNomins(account1, nUSD);
		assert.bnEqual(issuableNomins, toUnit('200'));

		// Issue that amount.
		await havven.issueNomins(nUSD, issuableNomins, { from: account1 });

		// They should now have 0 issuable nomins.
		assert.bnEqual(await havven.remainingIssuableNomins(account1, nUSD), '0');

		// And trying to issue the smallest possible unit of one should fail.
		await assert.revert(havven.issueNomins(nUSD, '1', { from: account1 }));
	});

	it('should allow an issuer with outstanding debt to burn nomins and decrease debt', async function() {
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
		await havven.transfer(account1, toUnit('10000'), { from: owner });

		// Issue
		await havven.issueMaxNomins(nUSD, { from: account1 });

		// account1 should now have 200 nUSD of debt.
		assert.bnEqual(await havven.debtBalanceOf(account1, nUSD), toUnit('200'));

		// Burn 100 nUSD
		await havven.burnNomins(nUSD, toUnit('100'), { from: account1 });

		// account1 should now have 100 nUSD of debt.
		assert.bnEqual(await havven.debtBalanceOf(account1, nUSD), toUnit('100'));
	});

	it('should disallow an issuer without outstanding debt from burning nomins', async function() {
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
		await havven.transfer(account1, toUnit('10000'), { from: owner });

		// Issue
		await havven.issueMaxNomins(nUSD, { from: account1 });

		// account2 should not have anything and can't burn.
		await assert.revert(havven.burnNomins(nUSD, toUnit('10'), { from: account2 }));

		// And even when we give account2 nomins, it should not be able to burn.
		await nUSDContract.transfer(account2, toUnit('100'), { from: account1 });
		await assert.revert(havven.burnNomins(nUSD, toUnit('10'), { from: account2 }));
	});

	it('should fail when trying to burn nomins that do not exist', async function() {
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
		await havven.transfer(account1, toUnit('10000'), { from: owner });

		// Issue
		await havven.issueMaxNomins(nUSD, { from: account1 });

		// Transfer all newly issued nomins to account2
		await nUSDContract.transfer(account2, toUnit('200'), { from: account1 });

		// Burning any amount of nUSD from account1 should fail
		await assert.revert(havven.burnNomins(nUSD, '1', { from: account1 }));
	});

	it("should only burn up to a user's actual debt level", async function() {
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
		await havven.transfer(account1, toUnit('10000'), { from: owner });
		await havven.transfer(account2, toUnit('10000'), { from: owner });

		// Issue
		const fullAmount = toUnit('210');
		const account1Payment = toUnit('10');
		const account2Payment = fullAmount.sub(account1Payment);
		await havven.issueNomins(nUSD, account1Payment, { from: account1 });
		await havven.issueNomins(nUSD, account2Payment, { from: account2 });

		// Transfer all of account2's nomins to account1
		await nUSDContract.transfer(account1, toUnit('200'), { from: account2 });
		// return;

		// Calculate the amount that account1 should actually receive
		const amountReceived = await nUSDContract.amountReceived(toUnit('200'));

		const balanceOfAccount1 = await nUSDContract.balanceOf(account1);

		// Then try to burn them all. Only 10 nomins (and fees) should be gone.
		await havven.burnNomins(nUSD, balanceOfAccount1, { from: account1 });
		const balanceOfAccount1AfterBurn = await nUSDContract.balanceOf(account1);

		// console.log('##### txn', txn);
		// for (let i = 0; i < txn.logs.length; i++) {
		// 	const result = txn.logs[i].args;
		// 	// console.log('##### txn ???', result);
		// 	for (let j = 0; j < result.__length__; j++) {
		// 		if (txn.logs[i].event === 'SomethingElse' && j === 0) {
		// 			console.log(`##### txn ${i} str`, web3.utils.hexToAscii(txn.logs[i].args[j]));
		// 		} else {
		// 			console.log(`##### txn ${i}`, txn.logs[i].args[j].toString());
		// 		}
		// 	}
		// }

		// Recording debts in the debt ledger reduces accuracy.
		//   Let's allow for a 1000 margin of error.
		assertBNClose(balanceOfAccount1AfterBurn, amountReceived, 1000);
	});

	it('should correctly calculate debt in a multi-issuance scenario', async function() {
		// Give some HAV to account1
		await havven.transfer(account1, toUnit('200000'), { from: owner });
		await havven.transfer(account2, toUnit('200000'), { from: owner });

		// Issue
		const issuedNominsPt1 = toUnit('2000');
		const issuedNominsPt2 = toUnit('2000');
		await havven.issueNomins(nUSD, issuedNominsPt1, { from: account1 });
		await havven.issueNomins(nUSD, issuedNominsPt2, { from: account1 });
		await havven.issueNomins(nUSD, toUnit('1000'), { from: account2 });

		const debt = await havven.debtBalanceOf(account1, nUSD);

		assert.bnEqual(debt, toUnit('4000'));
	});

	it('should correctly calculate debt in a multi-issuance multi-burn scenario', async function() {
		// Give some HAV to account1
		await havven.transfer(account1, toUnit('500000'), { from: owner });
		await havven.transfer(account2, toUnit('14000'), { from: owner });

		// Issue
		const issuedNominsPt1 = toUnit('2000');
		const burntNominsPt1 = toUnit('1500');
		const issuedNominsPt2 = toUnit('1600');
		const burntNominsPt2 = toUnit('500');

		await havven.issueNomins(nUSD, issuedNominsPt1, { from: account1 });
		await havven.burnNomins(nUSD, burntNominsPt1, { from: account1 });
		await havven.issueNomins(nUSD, issuedNominsPt2, { from: account1 });

		await havven.issueNomins(nUSD, toUnit('100'), { from: account2 });
		await havven.issueNomins(nUSD, toUnit('51'), { from: account2 });
		await havven.burnNomins(nUSD, burntNominsPt2, { from: account1 });

		const debt = await havven.debtBalanceOf(account1, web3.utils.asciiToHex('nUSD'));
		const expectedDebt = issuedNominsPt1
			.add(issuedNominsPt2)
			.sub(burntNominsPt1)
			.sub(burntNominsPt2);

		// TODO: The variance we are getting here seems suspect. Let's investigate
		assertBNClose(debt, expectedDebt, '10000');
	});

	it.only('should correctly calculate debt in a high volume issuance and burn scenario', async function() {
		const getRandomInt = (min, max) => {
			return min + Math.floor(Math.random() * Math.floor(max));
		};

		const getDebtLedgerArray = async () => {
			const length = await havven.debtLedger.length.call();
			let results = [];
			for (let i = 0; i < length; i++) {
				results.push(await havven.debtLedger.call(i));
			}
			return results;
		};

		await havven.transfer(account1, toUnit('50000000'), { from: owner });
		await havven.transfer(account2, toUnit('50000000'), { from: owner });

		// Make accounts issuers
		await havven.setIssuer(account1, true, { from: owner });
		await havven.setIssuer(account2, true, { from: owner });

		// const nominsIssuedEachTime = web3.utils.toBN('10000');
		const loopCount = 80;
		// let expectedDebt = web3.utils.toBN(0);
		let expectedDebt = toUnit('0');
		// await havven.issueNomins(nUSD, expectedDebt, { from: account1 });
		let timeBeforeLoopIssued = 0;

		// let totalNominsIssued = 0;
		for (let i = 0; i < loopCount; i++) {
			const oracle = await exchangeRates.oracle();
			const timestamp = await currentTime();
			const nUSDRate = toUnit('1');
			const nAUDRate = toUnit(parseFloat((Math.random() * 2).toString()).toFixed(18));
			const nEURRate = toUnit(parseFloat((Math.random() * 2).toString()).toFixed(18));
			const HAVRate = toUnit(parseFloat((Math.random() / 10).toString()).toFixed(18));
			const rates = `nAUD: ${fromUnit(nAUDRate)}\t\tnEUR: ${fromUnit(nEURRate)}\t\tHAV: ${fromUnit(
				HAVRate
			)}\t\tnUSD: ${fromUnit(nUSDRate)}`;
			console.log(`#### Rates: ${rates}`);
			await exchangeRates.updateRates(
				[nUSD, nAUD, nEUR, HAV],
				[nUSDRate, nAUDRate, nEURRate, HAVRate],
				timestamp,
				{ from: oracle }
			);

			// const amount = web3.utils.toBN(getRandomInt(100000, 800000000));
			const amount = toUnit('5');
			await havven.issueNomins(nUSD, amount, { from: account1 });

			let index = i * 2 + timeBeforeLoopIssued;
			// let debtEntry = await havven.debtLedger.call(index);
			// let totalIssuedNomins = await havven.totalIssuedNomins(nUSD);
			// console.log(
			// 	`###### debtEntry for account1 at index ${index}: ${debtEntry}\t\ttotal issued nomins (nUSD): ${totalIssuedNomins}`
			// );
			console.log('##### debt array: ', await getDebtLedgerArray());

			await havven.issueNomins(nUSD, amount, { from: account2 });
			index = i * 2 + timeBeforeLoopIssued + 1;
			// debtEntry = await havven.debtLedger.call(index);
			// totalIssuedNomins = await havven.totalIssuedNomins(nUSD);
			// console.log(
			// 	`###### debtEntry for account1 at index ${index}: ${debtEntry}\t\ttotal issued nomins (nUSD): ${totalIssuedNomins}`
			// );
			console.log('##### debt array: ', await getDebtLedgerArray());

			console.log(`##### Adding: ${amount}...`);
			const account1nUSDBalance = await nUSDContract.balanceOf(account1);
			const account2nUSDBalance = await nUSDContract.balanceOf(account2);
			console.log(
				`#### account1nUSDBalance: ${account1nUSDBalance}\t\taccount2nUSDBalance: ${account2nUSDBalance}`
			);
			expectedDebt = expectedDebt.add(amount);
			// const expectedDebt = nominsIssuedEachTime.mul(web3.utils.toBN(i + 1));
			const account1Debt = await havven.debtBalanceOf(account1, nUSD);
			const variance = account1Debt.sub(expectedDebt);
			console.log(
				`##### expectedDebt: ${expectedDebt}\t\taccount1Debt: ${account1Debt}\t\t variance: ${variance}`
			);
			// const amountToBurn = web3.utils.toBN('1000000');
			// const one = toUnit('1');
			// if (i % 2 === 0) {
			// 	const one = web3.utils.toBN(99999999999);
			// 	const amountToBurn = (one.lte(account1Debt) ? one : account1Debt).sub(web3.utils.toBN(100));
			// 	console.log(`##### Burning: ${fromUnit(amountToBurn)}`);
			// 	await havven.burnNomins(nUSD, amountToBurn, { from: account1 });
			// 	expectedDebt = expectedDebt.sub(amountToBurn);
			// }
			console.log('------------------------------------');
		}
		// const expectedDebt = nominsIssuedEachTime.mul(web3.utils.toBN(loopCount));
		// const account1Debt = await havven.debtBalanceOf(account1, nUSD);

		// assert.bnEqual(account1Debt, expectedDebt);
	});

	// TODO: Can't burn balance :-/

	it.skip('should correctly calculate debt in a high transaction scenario', async function() {
		// TODO: Work in progress. Most likely won't run with restoreTransactions

		await havven.transfer(account1, toUnit('5000000'), { from: owner });
		await havven.transfer(account2, toUnit('5000000'), { from: owner });

		const nominsIssuedEachTime = web3.utils.toBN('100');
		const loopCount = 500;
		for (let i = 0; i < loopCount; i++) {
			console.log('##### loop: ', i);
			await havven.issueNomins(nUSD, nominsIssuedEachTime, { from: account1 });
			await havven.issueNomins(nUSD, nominsIssuedEachTime, { from: account2 });
		}
		const expectedDebt = nominsIssuedEachTime.mul(web3.utils.toBN(loopCount));
		console.log('##### loop done. ');
		const account1Debt = await havven.debtBalanceOf(account1, nUSD);
		const account2Debt = await havven.debtBalanceOf(account1, nUSD);

		console.log('##### expected debt1: ', expectedDebt.toString());
		console.log('##### debt1: ', account1Debt.toString());
		console.log('##### debt2: ', account2Debt.toString());
	});

	it("should correctly calculate a user's maximum issuable nomins without prior issuance", async function() {
		const rate = await exchangeRates.rateForCurrency(web3.utils.asciiToHex('HAV'));
		const issuedHavvens = web3.utils.toBN('200000');
		await havven.transfer(account1, toUnit(issuedHavvens), { from: owner });
		const issuanceRatio = await havven.issuanceRatio.call();

		const expectedIssuableNomins = multiplyDecimal(
			toUnit(issuedHavvens),
			multiplyDecimal(rate, issuanceRatio)
		);
		const maxIssuableNomins = await havven.maxIssuableNomins(account1, nUSD);

		assert.bnEqual(expectedIssuableNomins, maxIssuableNomins);
	});

	it("should correctly calculate a user's maximum issuable nomins without any havens", async function() {
		const maxIssuableNomins = await havven.maxIssuableNomins(account1, nEUR);
		assert.bnEqual(0, maxIssuableNomins);
	});

	it("should correctly calculate a user's maximum issuable nomins with prior issuance", async function() {
		const hav2usdRate = await exchangeRates.rateForCurrency(HAV);
		const aud2usdRate = await exchangeRates.rateForCurrency(nAUD);
		const hav2audRate = divideDecimal(hav2usdRate, aud2usdRate);

		const issuedHavvens = web3.utils.toBN('320001');
		await havven.transfer(account1, toUnit(issuedHavvens), { from: owner });

		const issuanceRatio = await havven.issuanceRatio.call();
		const nAUDIssued = web3.utils.toBN('1234');
		await havven.issueNomins(nAUD, toUnit(nAUDIssued), { from: account1 });

		const expectedIssuableNomins = multiplyDecimal(
			toUnit(issuedHavvens),
			multiplyDecimal(hav2audRate, issuanceRatio)
		);

		const maxIssuableNomins = await havven.maxIssuableNomins(account1, nAUD);
		assert.bnEqual(expectedIssuableNomins, maxIssuableNomins);
	});

	it('should error when calculating maximum issuance when the HAV rate is stale', async function() {
		// Add stale period to the time to ensure we go stale.
		await fastForward(await exchangeRates.rateStalePeriod());
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[nUSD, nAUD, nEUR],
			['1', '0.5', '1.25'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		await assert.revert(havven.maxIssuableNomins(account1, nAUD));
	});

	it('should error when calculating maximum issuance when the currency rate is stale', async function() {
		// Add stale period to the time to ensure we go stale.
		await fastForward(await exchangeRates.rateStalePeriod());
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[nUSD, nEUR, HAV],
			['1', '1.25', '0.12'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		await assert.revert(havven.maxIssuableNomins(account1, nAUD));
	});

	it("should correctly calculate a user's debt balance without prior issuance", async function() {
		await havven.transfer(account1, toUnit('200000'), { from: owner });
		await havven.transfer(account2, toUnit('10000'), { from: owner });

		const debt1 = await havven.debtBalanceOf(account1, web3.utils.asciiToHex('nUSD'));
		const debt2 = await havven.debtBalanceOf(account2, web3.utils.asciiToHex('nUSD'));
		assert.bnEqual(debt1, 0);
		assert.bnEqual(debt2, 0);
	});

	it("should correctly calculate a user's debt balance with prior issuance", async function() {
		// Give some HAV to account1
		await havven.transfer(account1, toUnit('200000'), { from: owner });

		// Issue
		const issuedNomins = toUnit('1001');
		await havven.issueNomins(nUSD, issuedNomins, { from: account1 });

		const debt = await havven.debtBalanceOf(account1, web3.utils.asciiToHex('nUSD'));
		assert.bnEqual(debt, issuedNomins);
	});

	it("should correctly calculate a user's remaining issuable nomins with prior issuance", async function() {
		const hav2usdRate = await exchangeRates.rateForCurrency(HAV);
		const eur2usdRate = await exchangeRates.rateForCurrency(nEUR);
		const hav2eurRate = divideDecimal(hav2usdRate, eur2usdRate);
		const issuanceRatio = await havven.issuanceRatio.call();

		const issuedHavvens = web3.utils.toBN('200012');
		await havven.transfer(account1, toUnit(issuedHavvens), { from: owner });

		// Issue
		const nEURIssued = toUnit('2011');
		await havven.issueNomins(nEUR, nEURIssued, { from: account1 });

		const expectedIssuableNomins = multiplyDecimal(
			toUnit(issuedHavvens),
			multiplyDecimal(hav2eurRate, issuanceRatio)
		).sub(nEURIssued);

		const remainingIssuable = await havven.remainingIssuableNomins(account1, nEUR);
		assert.bnEqual(remainingIssuable, expectedIssuableNomins);
	});

	it("should correctly calculate a user's remaining issuable nomins without prior issuance", async function() {
		const hav2usdRate = await exchangeRates.rateForCurrency(HAV);
		const eur2usdRate = await exchangeRates.rateForCurrency(nEUR);
		const hav2eurRate = divideDecimal(hav2usdRate, eur2usdRate);
		const issuanceRatio = await havven.issuanceRatio.call();

		const issuedHavvens = web3.utils.toBN('20');
		await havven.transfer(account1, toUnit(issuedHavvens), { from: owner });

		const expectedIssuableNomins = multiplyDecimal(
			toUnit(issuedHavvens),
			multiplyDecimal(hav2eurRate, issuanceRatio)
		);

		const remainingIssuable = await havven.remainingIssuableNomins(account1, nEUR);
		assert.bnEqual(remainingIssuable, expectedIssuableNomins);
	});

	it('should not be possible to transfer locked havvens', async function() {
		const issuedHavvens = web3.utils.toBN('200000');
		await havven.transfer(account1, toUnit(issuedHavvens), { from: owner });

		// Issue
		const nEURIssued = toUnit('2000');
		await havven.issueNomins(nEUR, nEURIssued, { from: account1 });

		await assert.revert(havven.transfer(account2, toUnit(issuedHavvens), { from: account1 }));
	});

	it("should lock havvens if the user's collaterisation changes to be insufficient", async function() {
		const oracle = await exchangeRates.oracle();

		// Set nEUR for purposes of this test
		const timestamp1 = await currentTime();
		await exchangeRates.updateRates([nEUR], [toUnit('0.75')], timestamp1, { from: oracle });

		const issuedHavvens = web3.utils.toBN('200000');
		await havven.transfer(account1, toUnit(issuedHavvens), { from: owner });

		const maxIssuableNomins = await havven.maxIssuableNomins(account1, nEUR);

		// Issue
		const nominsToNotIssueYet = web3.utils.toBN('2000');
		const issuedNomins = maxIssuableNomins.sub(nominsToNotIssueYet);
		await havven.issueNomins(nEUR, issuedNomins, { from: account1 });

		// Increase the value of nEUR relative to havvens
		const timestamp2 = await currentTime();
		await exchangeRates.updateRates([nEUR], [toUnit('1.10')], timestamp2, { from: oracle });

		await assert.revert(havven.issueNomins(nEUR, nominsToNotIssueYet, { from: account1 }));
	});

	it("should lock newly received havvens if the user's collaterisation is too high", async function() {
		const oracle = await exchangeRates.oracle();

		// Set nEUR for purposes of this test
		const timestamp1 = await currentTime();
		await exchangeRates.updateRates([nEUR], [toUnit('0.75')], timestamp1, { from: oracle });

		const issuedHavvens = web3.utils.toBN('200000');
		await havven.transfer(account1, toUnit(issuedHavvens), { from: owner });
		await havven.transfer(account2, toUnit(issuedHavvens), { from: owner });

		const maxIssuableNomins = await havven.maxIssuableNomins(account1, nEUR);

		// Issue
		await havven.issueNomins(nEUR, maxIssuableNomins, { from: account1 });

		// Ensure that we can transfer in and out of the account successfully
		await havven.transfer(account1, toUnit('10000'), { from: account2 });
		await havven.transfer(account2, toUnit('10000'), { from: account1 });

		// Increase the value of nEUR relative to havvens
		const timestamp2 = await currentTime();
		await exchangeRates.updateRates([nEUR], [toUnit('2.10')], timestamp2, { from: oracle });

		// Ensure that the new havvens account1 receives cannot be transferred out.
		await havven.transfer(account1, toUnit('10000'), { from: account2 });
		await assert.revert(havven.transfer(account2, toUnit('10000'), { from: account1 }));
	});

	it('should unlock havvens when collaterisation ratio changes', async function() {
		const oracle = await exchangeRates.oracle();

		// Set nAUD for purposes of this test
		const timestamp1 = await currentTime();
		await exchangeRates.updateRates([nAUD], [toUnit('1.7655')], timestamp1, { from: oracle });

		const issuedHavvens = web3.utils.toBN('200000');
		await havven.transfer(account1, toUnit(issuedHavvens), { from: owner });

		// Issue
		const issuedNomins = await havven.maxIssuableNomins(account1, nAUD);
		await havven.issueNomins(nAUD, issuedNomins, { from: account1 });
		const remainingIssuable = await havven.remainingIssuableNomins(account1, nAUD);
		assertBNClose(remainingIssuable, '0', '1');

		// Increase the value of nAUD relative to havvens
		const timestamp2 = await currentTime();
		const newAUDExchangeRate = toUnit('0.9988');
		await exchangeRates.updateRates([nAUD], [newAUDExchangeRate], timestamp2, { from: oracle });

		const maxIssuableNomins2 = await havven.maxIssuableNomins(account1, nAUD);
		const remainingIssuable2 = await havven.remainingIssuableNomins(account1, nAUD);
		const expectedRemaining = maxIssuableNomins2.sub(issuedNomins);
		assertBNClose(remainingIssuable2, expectedRemaining, '1');
	});

	// Check user's collaterisation ratio

	it('should return 0 if user has no havvens when checking the collaterisation ratio', async function() {
		const ratio = await havven.collateralisationRatio(account1);
		assert.bnEqual(ratio, new web3.utils.BN(0));
	});

	it('Any user can check the collaterisation ratio for a user', async function() {
		const issuedHavvens = web3.utils.toBN('320000');
		await havven.transfer(account1, toUnit(issuedHavvens), { from: owner });

		// Issue
		const issuedNomins = toUnit(web3.utils.toBN('6400'));
		await havven.issueNomins(nAUD, issuedNomins, { from: account1 });

		await havven.collateralisationRatio(account1, { from: account2 });
	});

	it('should be able to read collaterisation ratio for a user with havvens but no debt', async function() {
		const issuedHavvens = web3.utils.toBN('30000');
		await havven.transfer(account1, toUnit(issuedHavvens), { from: owner });

		const ratio = await havven.collateralisationRatio(account1);
		assert.bnEqual(ratio, new web3.utils.BN(0));
	});

	it('should be able to read collaterisation ratio for a user with havvens and debt', async function() {
		const issuedHavvens = web3.utils.toBN('320000');
		await havven.transfer(account1, toUnit(issuedHavvens), { from: owner });

		// Issue
		const issuedNomins = toUnit(web3.utils.toBN('6400'));
		await havven.issueNomins(nAUD, issuedNomins, { from: account1 });

		const ratio = await havven.collateralisationRatio(account1, { from: account2 });
		assertUnitEqual(ratio, '0.1');
	});

	it('should allow anyone to inspect issuance data for any user and the issuance count is correct', async function() {
		// First add some issuance data for the user
		const issuedHavvens = web3.utils.toBN('320000');
		await havven.transfer(account1, toUnit(issuedHavvens), { from: owner });
		await havven.transfer(account2, toUnit(issuedHavvens), { from: owner });
		const issuedNomins = toUnit(web3.utils.toBN('6400'));
		await havven.issueNomins(nAUD, issuedNomins, { from: account1 });
		await havven.issueNomins(nAUD, issuedNomins, { from: account2 });

		const issuanceData = await havven.issuanceData.call(account2);

		// Check that account2 was the second entry and it owns 50% of the debt
		await assert.bnEqual(issuanceData[0], toUnit('0.5'), 1);

		// Also check the totalIssuerCount
		const totalIssuerCount = await havven.totalIssuerCount.call();
		await assert.bnEqual(totalIssuerCount, web3.utils.toBN(2));
	});

	it("should include escrowed havvens when calculating a user's collaterisation ratio", async function() {
		const hav2usdRate = await exchangeRates.rateForCurrency(HAV);
		const transferredHavvens = toUnit('60000');
		await havven.transfer(account1, transferredHavvens, { from: owner });

		// Setup escrow
		const escrow = await Escrow.new(owner, havven.address, { from: owner });
		await havven.setEscrow(escrow.address, { from: owner });
		const oneWeek = 60 * 60 * 24 * 7;
		const twelveWeeks = oneWeek * 12;
		const now = await currentTime();
		const escrowedHavvens = toUnit('30000');
		await havven.transfer(escrow.address, escrowedHavvens, { from: owner });
		await escrow.appendVestingEntry(account1, web3.utils.toBN(now + twelveWeeks), escrowedHavvens, {
			from: owner,
		});

		// Issue
		const maxIssuable = await havven.maxIssuableNomins(account1, nUSD);
		await havven.issueNomins(nUSD, maxIssuable, { from: account1 });

		// Compare
		const collaterisationRatio = await havven.collateralisationRatio(account1);
		const expectedCollaterisationRatio = divideDecimal(
			maxIssuable,
			multiplyDecimal(escrowedHavvens.add(transferredHavvens), hav2usdRate)
		);
		assert.bnEqual(collaterisationRatio, expectedCollaterisationRatio);
	});

	it("should permit anyone checking another user's collateral", async function() {
		const amount = toUnit('60000');
		await havven.transfer(account1, amount, { from: owner });
		const collateral = await havven.collateral(account1, { from: account2 });
		assert.bnEqual(collateral, amount);
	});

	it("should include escrowed havvens when checking a user's collateral", async function() {
		const escrow = await Escrow.new(owner, havven.address, { from: owner });
		await havven.setEscrow(escrow.address, { from: owner });
		const oneWeek = 60 * 60 * 24 * 7;
		const twelveWeeks = oneWeek * 12;
		const now = await currentTime();
		const escrowedAmount = toUnit('15000');
		await havven.transfer(escrow.address, escrowedAmount, { from: owner });
		await escrow.appendVestingEntry(account1, web3.utils.toBN(now + twelveWeeks), escrowedAmount, {
			from: owner,
		});

		const amount = toUnit('60000');
		await havven.transfer(account1, amount, { from: owner });
		const collateral = await havven.collateral(account1, { from: account2 });
		assert.bnEqual(collateral, amount.add(escrowedAmount));
	});

	// Stale rate check

	it('should allow anyone to check if any rates are stale', async function() {
		const instance = await ExchangeRates.deployed();
		const result = await instance.anyRateIsStale([nEUR, nAUD], { from: owner });
		assert.equal(result, false);
	});

	it("should calculate a user's remaining issuable nomins", async function() {
		const transferredHavvens = toUnit('60000');
		await havven.transfer(account1, transferredHavvens, { from: owner });

		// Issue
		const maxIssuable = await havven.maxIssuableNomins(account1, nUSD);
		const issued = maxIssuable.div(web3.utils.toBN(3));
		await havven.issueNomins(nUSD, issued, { from: account1 });
		const expectedRemaining = maxIssuable.sub(issued);
		const remaining = await havven.remainingIssuableNomins(account1, nUSD);
		assert.bnEqual(expectedRemaining, remaining);
	});

	it("should disallow retrieving a user's remaining issuable nomins if that nomin doesn't exist", async function() {
		await assert.revert(havven.remainingIssuableNomins(account1, web3.utils.asciiToHex('BOG')));
	});

	it("should correctly calculate a user's max issuable nomins with escrowed havvens", async function() {
		const hav2usdRate = await exchangeRates.rateForCurrency(HAV);
		const transferredHavvens = toUnit('60000');
		await havven.transfer(account1, transferredHavvens, { from: owner });

		// Setup escrow
		const escrow = await Escrow.new(owner, havven.address, { from: owner });
		await havven.setEscrow(escrow.address, { from: owner });
		const oneWeek = 60 * 60 * 24 * 7;
		const twelveWeeks = oneWeek * 12;
		const now = await currentTime();
		const escrowedHavvens = toUnit('30000');
		await havven.transfer(escrow.address, escrowedHavvens, { from: owner });
		await escrow.appendVestingEntry(account1, web3.utils.toBN(now + twelveWeeks), escrowedHavvens, {
			from: owner,
		});

		const maxIssuable = await havven.maxIssuableNomins(account1, nUSD);
		// await havven.issueNomins(nUSD, maxIssuable, { from: account1 });

		// Compare
		const issuanceRatio = await havven.issuanceRatio.call();
		const expectedMaxIssuable = multiplyDecimal(
			multiplyDecimal(escrowedHavvens.add(transferredHavvens), hav2usdRate),
			issuanceRatio
		);
		assert.bnEqual(maxIssuable, expectedMaxIssuable);
	});

	// Burning Nomins

	it("should successfully burn all user's nomins", async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates([nUSD, HAV], ['1', '0.1'].map(toUnit), timestamp, {
			from: oracle,
		});

		// Give some HAV to account1
		await havven.transfer(account1, toUnit('10000'), { from: owner });

		// Issue
		await havven.issueNomins(nUSD, toUnit('199'), { from: account1 });

		// Then try to burn them all. Only 10 nomins (and fees) should be gone.
		await havven.burnNomins(nUSD, await nUSDContract.balanceOf(account1), { from: account1 });
		assert.bnEqual(await nUSDContract.balanceOf(account1), web3.utils.toBN(0));
	});

	it('should burn the correct amount of nomins', async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates([nAUD, HAV], ['0.9', '0.1'].map(toUnit), timestamp, {
			from: oracle,
		});

		// Give some HAV to account1
		await havven.transfer(account1, toUnit('400000'), { from: owner });

		// Issue
		await havven.issueNomins(nAUD, toUnit('3987'), { from: account1 });

		// Then try to burn some of them. There should be 3000 left.
		await havven.burnNomins(nAUD, toUnit('987'), { from: account1 });
		assert.bnEqual(await nAUDContract.balanceOf(account1), toUnit('3000'));
	});

	it("should successfully burn all user's nomins even with transfer", async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates([nUSD, HAV], ['1', '0.1'].map(toUnit), timestamp, {
			from: oracle,
		});

		// Give some HAV to account1
		await havven.transfer(account1, toUnit('300000'), { from: owner });

		// Issue
		const amountIssued = toUnit('2000');
		await havven.issueNomins(nUSD, amountIssued, { from: account1 });

		// Transfer account1's nomins to account2 and back
		const amountToTransfer = toUnit('1800');
		await nUSDContract.transfer(account2, amountToTransfer, { from: account1 });
		const remainingAfterTransfer = await nUSDContract.balanceOf(account1);
		await nUSDContract.transfer(account1, await nUSDContract.balanceOf(account2), {
			from: account2,
		});

		// Calculate the amount that account1 should actually receive
		const amountReceived = await nUSDContract.amountReceived(toUnit('1800'));
		const amountReceived2 = await nUSDContract.amountReceived(amountReceived);
		const amountLostToFees = amountToTransfer.sub(amountReceived2);

		// Check that the transfer worked ok.
		const amountExpectedToBeLeftInWallet = amountIssued.sub(amountLostToFees);
		assert.bnEqual(amountReceived2.add(remainingAfterTransfer), amountExpectedToBeLeftInWallet);

		// Now burn 1000 and check we end up with the right amount
		await havven.burnNomins(nUSD, toUnit('1000'), { from: account1 });
		assert.bnEqual(
			await nUSDContract.balanceOf(account1),
			amountExpectedToBeLeftInWallet.sub(toUnit('1000'))
		);
	});

	it('should allow the last user in the system to burn all their nomins to release their havvens', async function() {
		// Give some HAV to account1
		await havven.transfer(account1, toUnit('500000'), { from: owner });
		await havven.transfer(account2, toUnit('140000'), { from: owner });
		await havven.transfer(account3, toUnit('1400000'), { from: owner });

		// Issue
		const issuedNomins1 = toUnit('2000');
		const issuedNomins2 = toUnit('2000');
		const issuedNomins3 = toUnit('2000');

		await havven.issueNomins(nUSD, issuedNomins1, { from: account1 });
		await havven.issueNomins(nUSD, issuedNomins2, { from: account2 });
		await havven.issueNomins(nUSD, issuedNomins3, { from: account3 });

		const debtBalance1 = await havven.debtBalanceOf(account1, nUSD);
		await havven.burnNomins(nUSD, debtBalance1, { from: account1 });
		const debtBalance2 = await havven.debtBalanceOf(account2, nUSD);
		await havven.burnNomins(nUSD, debtBalance2, { from: account2 });
		const debtBalance3 = await havven.debtBalanceOf(account3, nUSD);
		await havven.burnNomins(nUSD, debtBalance3, { from: account3 });

		assert.equal(debtBalance1, web3.utils.toBN('0'));
		assert.equal(debtBalance2, web3.utils.toBN('0'));
		assert.equal(debtBalance3, web3.utils.toBN('0'));
	});

	it('should allow user to burn all nomins issued even after other users have issued', async function() {
		// Give some HAV to account1
		await havven.transfer(account1, toUnit('500000'), { from: owner });
		await havven.transfer(account2, toUnit('140000'), { from: owner });
		await havven.transfer(account3, toUnit('1400000'), { from: owner });

		// Issue
		const issuedNomins1 = toUnit('2000');
		const issuedNomins2 = toUnit('2000');
		const issuedNomins3 = toUnit('2000');

		await havven.issueNomins(nUSD, issuedNomins1, { from: account1 });
		await havven.issueNomins(nUSD, issuedNomins2, { from: account2 });
		await havven.issueNomins(nUSD, issuedNomins3, { from: account3 });

		const debtBalance = await havven.debtBalanceOf(account1, nUSD);
		await havven.burnNomins(nUSD, debtBalance, { from: account1 });
		assert.equal(debtBalance, web3.utils.toBN('0'));
	});

	// Changes in exchange rates tests
});
