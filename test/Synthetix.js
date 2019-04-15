const ExchangeRates = artifacts.require('ExchangeRates');
const Escrow = artifacts.require('SynthetixEscrow');
const FeePool = artifacts.require('FeePool');
const Synthetix = artifacts.require('Synthetix');
const SynthetixState = artifacts.require('SynthetixState');
const Synth = artifacts.require('Synth');

const {
	currentTime,
	fastForward,
	multiplyDecimal,
	divideDecimal,
	toUnit,
	ZERO_ADDRESS,
} = require('../utils/testUtils');

contract('Synthetix', async function(accounts) {
	const [sUSD, sAUD, sEUR, SNX, XDR, sXYZ] = ['sUSD', 'sAUD', 'sEUR', 'SNX', 'XDR', 'sXYZ'].map(
		web3.utils.asciiToHex
	);

	const [
		deployerAccount,
		owner,
		account1,
		account2,
		account3,
		account4,
		account5,
		account6,
	] = accounts;

	let synthetix, synthetixState, exchangeRates, feePool, sUSDContract, sAUDContract;

	beforeEach(async function() {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		exchangeRates = await ExchangeRates.deployed();
		feePool = await FeePool.deployed();

		synthetix = await Synthetix.deployed();
		synthetixState = await SynthetixState.at(await synthetix.synthetixState());
		sUSDContract = await Synth.at(await synthetix.synths(sUSD));
		sAUDContract = await Synth.at(await synthetix.synths(sAUD));

		// Send a price update to guarantee we're not stale.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{
				from: oracle,
			}
		);
	});

	it('should set constructor params on deployment', async function() {
		// constructor(address _proxy, TokenState _tokenState, SynthetixState _synthetixState,
		//     address _owner, ExchangeRates _exchangeRates, FeePool _feePool
		// )
		const instance = await Synthetix.new(
			account1,
			account2,
			account3,
			account4,
			account5,
			account6,
			{
				from: deployerAccount,
			}
		);

		assert.equal(await instance.proxy(), account1);
		assert.equal(await instance.tokenState(), account2);
		assert.equal(await instance.synthetixState(), account3);
		assert.equal(await instance.owner(), account4);
		assert.equal(await instance.exchangeRates(), account5);
		assert.equal(await instance.feePool(), account6);
	});

	it('should allow adding a Synth contract', async function() {
		const previousSynthCount = await synthetix.availableSynthCount();

		const synth = await Synth.new(
			account1,
			account2,
			Synthetix.address,
			FeePool.address,
			'Synth XYZ',
			'sXYZ',
			owner,
			web3.utils.asciiToHex('sXYZ'),
			{ from: deployerAccount }
		);

		await synthetix.addSynth(synth.address, { from: owner });

		// Assert that we've successfully added a Synth
		assert.bnEqual(
			await synthetix.availableSynthCount(),
			previousSynthCount.add(web3.utils.toBN(1))
		);
		// Assert that it's at the end of the array
		assert.equal(await synthetix.availableSynths(previousSynthCount), synth.address);
		// Assert that it's retrievable by its currencyKey
		assert.equal(await synthetix.synths(web3.utils.asciiToHex('sXYZ')), synth.address);
	});

	it('should disallow adding a Synth contract when the user is not the owner', async function() {
		const synth = await Synth.new(
			account1,
			account2,
			Synthetix.address,
			FeePool.address,
			'Synth XYZ',
			'sXYZ',
			owner,
			web3.utils.asciiToHex('sXYZ'),
			{ from: deployerAccount }
		);

		await assert.revert(synthetix.addSynth(synth.address, { from: account1 }));
	});

	it('should disallow double adding a Synth contract with the same address', async function() {
		const synth = await Synth.new(
			account1,
			account2,
			Synthetix.address,
			FeePool.address,
			'Synth XYZ',
			'sXYZ',
			owner,
			web3.utils.asciiToHex('sXYZ'),
			{ from: deployerAccount }
		);

		await synthetix.addSynth(synth.address, { from: owner });
		await assert.revert(synthetix.addSynth(synth.address, { from: owner }));
	});

	it('should disallow double adding a Synth contract with the same currencyKey', async function() {
		const synth1 = await Synth.new(
			account1,
			account2,
			Synthetix.address,
			FeePool.address,
			'Synth XYZ',
			'sXYZ',
			owner,
			web3.utils.asciiToHex('sXYZ'),
			{ from: deployerAccount }
		);

		const synth2 = await Synth.new(
			account1,
			account2,
			Synthetix.address,
			FeePool.address,
			'Synth XYZ',
			'sXYZ',
			owner,
			web3.utils.asciiToHex('sXYZ'),
			{ from: deployerAccount }
		);

		await synthetix.addSynth(synth1.address, { from: owner });
		await assert.revert(synthetix.addSynth(synth2.address, { from: owner }));
	});

	it('should allow removing a Synth contract when it has no issued balance', async function() {
		// Note: This test depends on state in the migration script, that there are hooked up synths
		// without balances and we just remove one.
		const currencyKey = sUSD;
		const synthCount = await synthetix.availableSynthCount();

		assert.notEqual(await synthetix.synths(currencyKey), ZERO_ADDRESS);

		await synthetix.removeSynth(currencyKey, { from: owner });

		// Assert that we have one less synth, and that the specific currency key is gone.
		assert.bnEqual(await synthetix.availableSynthCount(), synthCount.sub(web3.utils.toBN(1)));
		assert.equal(await synthetix.synths(currencyKey), ZERO_ADDRESS);

		// TODO: Check that an event was successfully fired ?
	});

	it('should reject removing the XDR Synth even when it has no issued balance', async function() {
		// Note: This test depends on state in the migration script, that there are hooked up synths
		// without balances and we just remove one.
		await assert.revert(synthetix.removeSynth(XDR, { from: owner }));
	});

	it('should disallow removing a Synth contract when it has an issued balance', async function() {
		// Note: This test depends on state in the migration script, that there are hooked up synths
		// without balances
		const sUSDContractAddress = await synthetix.synths(sUSD);

		// Assert that we can remove the synth and add it back in before we do anything.
		let transaction = await synthetix.removeSynth(sUSD, { from: owner });
		assert.eventEqual(transaction, 'SynthRemoved', {
			currencyKey: sUSD,
			removedSynth: sUSDContractAddress,
		});
		transaction = await synthetix.addSynth(sUSDContractAddress, { from: owner });
		assert.eventEqual(transaction, 'SynthAdded', {
			currencyKey: sUSD,
			newSynth: sUSDContractAddress,
		});

		// Issue one sUSD
		await synthetix.issueSynths(sUSD, toUnit('1'), { from: owner });

		// Assert that we can't remove the synth now
		await assert.revert(synthetix.removeSynth(sUSD, { from: owner }));
	});

	it('should disallow removing a Synth contract when requested by a non-owner', async function() {
		// Note: This test depends on state in the migration script, that there are hooked up synths
		// without balances
		await assert.revert(synthetix.removeSynth(sEUR, { from: account1 }));
	});

	it('should revert when requesting to remove a non-existent synth', async function() {
		// Note: This test depends on state in the migration script, that there are hooked up synths
		// without balances
		const currencyKey = web3.utils.asciiToHex('NOPE');

		// Assert that we can't remove the synth
		await assert.revert(synthetix.removeSynth(currencyKey, { from: owner }));
	});

	// Escrow

	it('should allow the owner to set an Escrow contract', async function() {
		assert.notEqual(await synthetix.escrow(), account1);
		await synthetix.setEscrow(account1, { from: owner });
		assert.equal(await synthetix.escrow(), account1);

		// Note, there's no event for setting the Escrow contract
	});

	it('should disallow a non-owner from setting an Escrow contract', async function() {
		await assert.revert(synthetix.setEscrow(account1, { from: account1 }));
	});

	// Token State contract

	it('should allow the owner to set a TokenState contract', async function() {
		const transaction = await synthetix.setSynthetixState(account1, { from: owner });

		assert.equal(await synthetix.synthetixState(), account1);

		assert.eventEqual(transaction, 'StateContractChanged', {
			stateContract: account1,
		});
	});

	// Exchange Rates contract

	it('should allow the owner to set an Exchange Rates contract', async function() {
		assert.notEqual(await synthetix.exchangeRates(), account1);
		await synthetix.setExchangeRates(account1, { from: owner });
		assert.equal(await synthetix.exchangeRates(), account1);

		// Note, there's no event for setting the ExchangeRates contract
	});

	it('should disallow a non-owner from setting an Exchange Rates contract', async function() {
		await assert.revert(synthetix.setExchangeRates(account1, { from: account1 }));
	});

	// Effective value

	it('should correctly calculate an exchange rate in effectiveValue()', async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// 1 sUSD should be worth 2 sAUD.
		assert.bnEqual(await synthetix.effectiveValue(sUSD, toUnit('1'), sAUD), toUnit('2'));

		// 10 SNX should be worth 1 sUSD.
		assert.bnEqual(await synthetix.effectiveValue(SNX, toUnit('10'), sUSD), toUnit('1'));

		// 2 sEUR should be worth 2.50 sUSD
		assert.bnEqual(await synthetix.effectiveValue(sEUR, toUnit('2'), sUSD), toUnit('2.5'));
	});

	it('should error when relying on a stale exchange rate in effectiveValue()', async function() {
		// Send a price update so we know what time we started with.
		const oracle = await exchangeRates.oracle();
		let timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Add stale period to the time to ensure we go stale.
		await fastForward((await exchangeRates.rateStalePeriod()) + 1);

		timestamp = await currentTime();

		// Update all rates except sUSD.
		await exchangeRates.updateRates([sEUR, SNX], ['1.25', '0.1'].map(toUnit), timestamp, {
			from: oracle,
		});

		const amountOfSynthetixs = toUnit('10');
		const amountOfEur = toUnit('0.8');

		// Should now be able to convert from SNX to sEUR since they are both not stale.
		assert.bnEqual(await synthetix.effectiveValue(SNX, amountOfSynthetixs, sEUR), amountOfEur);

		// But trying to convert from SNX to sAUD should fail as sAUD should be stale.
		await assert.revert(synthetix.effectiveValue(SNX, toUnit('10'), sAUD));
		await assert.revert(synthetix.effectiveValue(sAUD, toUnit('10'), SNX));
	});

	it('should revert when relying on a non-existant exchange rate in effectiveValue()', async function() {
		// Send a price update so we know what time we started with.
		const oracle = await exchangeRates.oracle();
		let timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		await assert.revert(synthetix.effectiveValue(SNX, toUnit('10'), web3.utils.asciiToHex('XYZ')));
	});

	// totalIssuedSynths

	it('should correctly calculate the total issued synths in a single currency', async function() {
		// Two people issue 10 sUSD each. Assert that total issued value is 20 sUSD.

		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1 and account2
		await synthetix.transfer(account1, toUnit('1000'), { from: owner });
		await synthetix.transfer(account2, toUnit('1000'), { from: owner });

		// Issue 10 sUSD each
		await synthetix.issueSynths(sUSD, toUnit('10'), { from: account1 });
		await synthetix.issueSynths(sUSD, toUnit('10'), { from: account2 });

		// Assert that there's 20 sUSD of value in the system
		assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('20'));
	});

	it('should correctly calculate the total issued synths in multiple currencies', async function() {
		// Alice issues 10 sUSD. Bob issues 20 sAUD. Assert that total issued value is 20 sUSD, and 40 sAUD.

		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1 and account2
		await synthetix.transfer(account1, toUnit('1000'), { from: owner });
		await synthetix.transfer(account2, toUnit('1000'), { from: owner });

		// Issue 10 sUSD each
		await synthetix.issueSynths(sUSD, toUnit('10'), { from: account1 });
		await synthetix.issueSynths(sAUD, toUnit('20'), { from: account2 });

		// Assert that there's 20 sUSD of value in the system
		assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('20'));

		// And that there's 40 sAUD of value in the system
		assert.bnEqual(await synthetix.totalIssuedSynths(sAUD), toUnit('40'));
	});

	it('should return the correct value for the different quantity of total issued synths', async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		const rates = ['0.5', '1.25', '0.1'].map(toUnit);

		await exchangeRates.updateRates([sAUD, sEUR, SNX], rates, timestamp, { from: oracle });

		// const snx2usdRate = await exchangeRates.rateForCurrency(SNX);
		const aud2usdRate = await exchangeRates.rateForCurrency(sAUD);
		const eur2usdRate = await exchangeRates.rateForCurrency(sEUR);
		const eur2audRate = divideDecimal(eur2usdRate, aud2usdRate);
		const usd2audRate = divideDecimal(toUnit('1'), aud2usdRate);

		// Give some SNX to account1 and account2
		await synthetix.transfer(account1, toUnit('100000'), { from: owner });
		await synthetix.transfer(account2, toUnit('100000'), { from: owner });

		// Issue
		const issueAmountAUD = toUnit('10');
		const issueAmountUSD = toUnit('5');
		const issueAmountEUR = toUnit('7.4342');

		await synthetix.issueSynths(sUSD, issueAmountUSD, { from: account1 });
		await synthetix.issueSynths(sEUR, issueAmountEUR, { from: account1 });
		await synthetix.issueSynths(sAUD, issueAmountAUD, { from: account1 });
		await synthetix.issueSynths(sUSD, issueAmountUSD, { from: account2 });
		await synthetix.issueSynths(sEUR, issueAmountEUR, { from: account2 });
		await synthetix.issueSynths(sAUD, issueAmountAUD, { from: account2 });

		const aud = issueAmountAUD.add(issueAmountAUD);
		const eur = multiplyDecimal(issueAmountEUR.add(issueAmountEUR), eur2audRate);
		const usd = multiplyDecimal(issueAmountUSD.add(issueAmountUSD), usd2audRate);
		const totalExpectedIssuedSAUD = aud.add(eur).add(usd);
		const totalIssuedAUD = await synthetix.totalIssuedSynths(sAUD);

		assert.bnEqual(totalExpectedIssuedSAUD, totalIssuedAUD);
	});

	it('should not allow checking total issued synths when a rate other than the priced currency is stale', async function() {
		await fastForward((await exchangeRates.rateStalePeriod()).add(web3.utils.toBN('300')));
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates([SNX, sAUD], ['0.1', '0.78'].map(toUnit), timestamp, {
			from: oracle,
		});
		await assert.revert(synthetix.totalIssuedSynths(sAUD));
	});

	it('should not allow checking total issued synths when the priced currency is stale', async function() {
		await fastForward((await exchangeRates.rateStalePeriod()).add(web3.utils.toBN('300')));
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates([SNX, sEUR], ['0.1', '1.25'].map(toUnit), timestamp, {
			from: oracle,
		});
		await assert.revert(synthetix.totalIssuedSynths(sAUD));
	});

	// transfer

	it('should transfer using the ERC20 transfer function', async function() {
		// Ensure our environment is set up correctly for our assumptions
		// e.g. owner owns all SNX.

		assert.bnEqual(await synthetix.totalSupply(), await synthetix.balanceOf(owner));

		const transaction = await synthetix.transfer(account1, toUnit('10'), { from: owner });
		assert.eventEqual(transaction, 'Transfer', {
			from: owner,
			to: account1,
			value: toUnit('10'),
		});

		assert.bnEqual(await synthetix.balanceOf(account1), toUnit('10'));
	});

	it('should revert when exceeding locked synthetix and calling the ERC20 transfer function', async function() {
		// Ensure our environment is set up correctly for our assumptions
		// e.g. owner owns all SNX.
		assert.bnEqual(await synthetix.totalSupply(), await synthetix.balanceOf(owner));

		// Issue max synths.
		await synthetix.issueMaxSynths(sUSD, { from: owner });

		// Try to transfer 0.000000000000000001 SNX
		await assert.revert(synthetix.transfer(account1, '1', { from: owner }));
	});

	it('should transfer using the ERC20 transferFrom function', async function() {
		// Ensure our environment is set up correctly for our assumptions
		// e.g. owner owns all SNX.
		const previousOwnerBalance = await synthetix.balanceOf(owner);
		assert.bnEqual(await synthetix.totalSupply(), previousOwnerBalance);

		// Approve account1 to act on our behalf for 10 SNX.
		let transaction = await synthetix.approve(account1, toUnit('10'), { from: owner });
		assert.eventEqual(transaction, 'Approval', {
			owner,
			spender: account1,
			value: toUnit('10'),
		});

		// Assert that transferFrom works.
		transaction = await synthetix.transferFrom(owner, account2, toUnit('10'), { from: account1 });
		assert.eventEqual(transaction, 'Transfer', {
			from: owner,
			to: account2,
			value: toUnit('10'),
		});

		// Assert that account2 has 10 SNX and owner has 10 less SNX
		assert.bnEqual(await synthetix.balanceOf(account2), toUnit('10'));
		assert.bnEqual(await synthetix.balanceOf(owner), previousOwnerBalance.sub(toUnit('10')));

		// Assert that we can't transfer more even though there's a balance for owner.
		await assert.revert(synthetix.transferFrom(owner, account2, '1', { from: account1 }));
	});

	it('should revert when exceeding locked synthetix and calling the ERC20 transferFrom function', async function() {
		// Ensure our environment is set up correctly for our assumptions
		// e.g. owner owns all SNX.
		assert.bnEqual(await synthetix.totalSupply(), await synthetix.balanceOf(owner));

		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Approve account1 to act on our behalf for 10 SNX.
		let transaction = await synthetix.approve(account1, toUnit('10'), { from: owner });
		assert.eventEqual(transaction, 'Approval', {
			owner,
			spender: account1,
			value: toUnit('10'),
		});

		// Issue max synths
		await synthetix.issueMaxSynths(sUSD, { from: owner });

		// Assert that transferFrom fails even for the smallest amount of SNX.
		await assert.revert(synthetix.transferFrom(owner, account2, '1', { from: account1 }));
	});

	it('should transfer using the ERC223 transfer function', async function() {
		// Ensure our environment is set up correctly for our assumptions
		// e.g. owner owns all SNX.
		assert.bnEqual(await synthetix.totalSupply(), await synthetix.balanceOf(owner));

		const transaction = await synthetix.transfer(
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

		assert.bnEqual(await synthetix.balanceOf(account1), toUnit('10'));
	});

	it('should revert when exceeding locked synthetix and calling the ERC223 transfer function', async function() {
		// Ensure our environment is set up correctly for our assumptions
		// e.g. owner owns all SNX.
		assert.bnEqual(await synthetix.totalSupply(), await synthetix.balanceOf(owner));

		// Issue max synths.
		await synthetix.issueMaxSynths(sUSD, { from: owner });

		// Try to transfer 0.000000000000000001 SNX
		await assert.revert(
			synthetix.transfer(account1, '1', web3.utils.asciiToHex('This is a memo'), { from: owner })
		);
	});

	it('should not allow transfer if the exchange rate for synthetix is stale', async function() {
		// Give some SNX to account1 & account2
		const value = toUnit('300');
		await synthetix.transfer(account1, toUnit('10000'), { from: owner });
		await synthetix.transfer(account2, toUnit('10000'), { from: owner });

		// Ensure that we can do a successful transfer before rates go stale
		await synthetix.transfer(account2, value, { from: account1 });
		const data = web3.utils.asciiToHex('This is a memo');
		await synthetix.transfer(account2, value, data, { from: account1 });

		await synthetix.approve(account3, value, { from: account2 });
		await synthetix.transferFrom(account2, account1, value, { from: account3 });
		await synthetix.approve(account3, value, { from: account2 });
		await synthetix.transferFrom(account2, account1, value, data, { from: account3 });

		// Now jump forward in time so the rates are stale
		await fastForward((await exchangeRates.rateStalePeriod()) + 1);

		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates([sAUD, sEUR], ['0.5', '1.25'].map(toUnit), timestamp, {
			from: oracle,
		});

		// Subsequent transfers fail
		await assert.revert(synthetix.transfer(account2, value, { from: account1 }));
		await assert.revert(synthetix.transfer(account2, value, data), { from: account1 });

		await synthetix.approve(account3, value, { from: account2 });
		await assert.revert(synthetix.transferFrom(account2, account1, value, { from: account3 }));
		await assert.revert(
			synthetix.transferFrom(account2, account1, value, data, { from: account3 })
		);
	});

	it('should not allow transfer of synthetix in escrow', async function() {
		// Setup escrow
		const escrow = await Escrow.new(owner, synthetix.address, { from: owner });
		await synthetix.setEscrow(escrow.address, { from: owner });
		const oneWeek = 60 * 60 * 24 * 7;
		const twelveWeeks = oneWeek * 12;
		const now = await currentTime();
		const escrowedSynthetixs = toUnit('30000');
		await synthetix.transfer(escrow.address, escrowedSynthetixs, { from: owner });
		await escrow.appendVestingEntry(
			account1,
			web3.utils.toBN(now + twelveWeeks),
			escrowedSynthetixs,
			{
				from: owner,
			}
		);

		// Ensure the transfer fails as all the synthetix are in escrow
		await assert.revert(synthetix.transfer(account2, toUnit('100'), { from: account1 }));
	});

	it('should transfer using the ERC223 transferFrom function', async function() {
		// Ensure our environment is set up correctly for our assumptions
		// e.g. owner owns all SNX.
		const previousOwnerBalance = await synthetix.balanceOf(owner);
		assert.bnEqual(await synthetix.totalSupply(), previousOwnerBalance);

		// Approve account1 to act on our behalf for 10 SNX.
		let transaction = await synthetix.approve(account1, toUnit('10'), { from: owner });
		assert.eventEqual(transaction, 'Approval', {
			owner,
			spender: account1,
			value: toUnit('10'),
		});

		// Assert that transferFrom works.
		transaction = await synthetix.transferFrom(
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

		// Assert that account2 has 10 SNX and owner has 10 less SNX
		assert.bnEqual(await synthetix.balanceOf(account2), toUnit('10'));
		assert.bnEqual(await synthetix.balanceOf(owner), previousOwnerBalance.sub(toUnit('10')));

		// Assert that we can't transfer more even though there's a balance for owner.
		await assert.revert(synthetix.transferFrom(owner, account2, '1', { from: account1 }));
	});

	it('should revert when exceeding locked synthetix and calling the ERC223 transferFrom function', async function() {
		// Ensure our environment is set up correctly for our assumptions
		// e.g. owner owns all SNX.
		assert.bnEqual(await synthetix.totalSupply(), await synthetix.balanceOf(owner));

		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Approve account1 to act on our behalf for 10 SNX.
		let transaction = await synthetix.approve(account1, toUnit('10'), { from: owner });
		assert.eventEqual(transaction, 'Approval', {
			owner,
			spender: account1,
			value: toUnit('10'),
		});

		// Issue max synths
		await synthetix.issueMaxSynths(sUSD, { from: owner });

		// Assert that transferFrom fails even for the smallest amount of SNX.
		await assert.revert(
			synthetix.transferFrom(owner, account2, '1', web3.utils.asciiToHex('This is a memo'), {
				from: account1,
			})
		);
	});

	// Issuance

	it('Issuing too small an amount of synths should revert', async function() {
		await synthetix.transfer(account1, toUnit('1000'), { from: owner });

		// Note: The amount will likely be rounded to 0 in the debt register. This will revert.
		// The exact amount depends on the Synth exchange rate and the total supply.
		await assert.revert(synthetix.issueSynths(sAUD, web3.utils.toBN('1'), { from: account1 }));
	});

	it('should allow the issuance of a small amount of synths', async function() {
		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('1000'), { from: owner });

		// account1 should be able to issue
		// Note: If a too small amount of synths are issued here, the amount may be
		// rounded to 0 in the debt register. This will revert. As such, there is a minimum
		// number of synths that need to be issued each time issue is invoked. The exact
		// amount depends on the Synth exchange rate and the total supply.
		await synthetix.issueSynths(sAUD, web3.utils.toBN('5'), { from: account1 });
	});

	it('should be possible to issue the maximum amount of synths via issueSynths', async function() {
		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('1000'), { from: owner });

		const maxSynths = await synthetix.maxIssuableSynths(account1, sUSD);

		// account1 should be able to issue
		await synthetix.issueSynths(sUSD, maxSynths, { from: account1 });
	});

	it('should allow an issuer to issue synths in one flavour', async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('1000'), { from: owner });

		// account1 should be able to issue
		await synthetix.issueSynths(sUSD, toUnit('10'), { from: account1 });

		// There should be 10 sUSD of value in the system
		assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('10'));

		// And account1 should own 100% of the debt.
		assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('10'));
		assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('10'));
	});

	it('should allow an issuer to issue synths in multiple flavours', async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('1000'), { from: owner });

		// account1 should be able to issue sUSD and sAUD
		await synthetix.issueSynths(sUSD, toUnit('10'), { from: account1 });
		await synthetix.issueSynths(sAUD, toUnit('20'), { from: account1 });

		// There should be 20 sUSD of value in the system
		assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('20'));
		// Which equals 40 sAUD of value in the system
		assert.bnEqual(await synthetix.totalIssuedSynths(sAUD), toUnit('40'));

		// And account1 should own 100% of the debt.
		assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('20'));
		assert.bnEqual(await synthetix.debtBalanceOf(account1, sAUD), toUnit('40'));
	});

	// TODO: Check that the rounding errors are acceptable
	it('should allow two issuers to issue synths in one flavour', async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1 and account2
		await synthetix.transfer(account1, toUnit('10000'), { from: owner });
		await synthetix.transfer(account2, toUnit('10000'), { from: owner });

		// Issue
		await synthetix.issueSynths(sUSD, toUnit('10'), { from: account1 });
		await synthetix.issueSynths(sUSD, toUnit('20'), { from: account2 });

		// There should be 30sUSD of value in the system
		assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('30'));

		// And the debt should be split 50/50.
		// But there's a small rounding error.
		// This is ok, as when the last person exits the system, their debt percentage is always 100% so
		// these rounding errors don't cause the system to be out of balance.
		assert.bnClose(await synthetix.debtBalanceOf(account1, sUSD), toUnit('10'));
		assert.bnClose(await synthetix.debtBalanceOf(account2, sUSD), toUnit('20'));
	});

	it('should allow multi-issuance in one flavour', async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1 and account2
		await synthetix.transfer(account1, toUnit('10000'), { from: owner });
		await synthetix.transfer(account2, toUnit('10000'), { from: owner });

		// Issue
		await synthetix.issueSynths(sUSD, toUnit('10'), { from: account1 });
		await synthetix.issueSynths(sUSD, toUnit('20'), { from: account2 });
		await synthetix.issueSynths(sUSD, toUnit('10'), { from: account1 });

		// There should be 40 sUSD of value in the system
		assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('40'));

		// And the debt should be split 50/50.
		// But there's a small rounding error.
		// This is ok, as when the last person exits the system, their debt percentage is always 100% so
		// these rounding errors don't cause the system to be out of balance.
		assert.bnClose(await synthetix.debtBalanceOf(account1, sUSD), toUnit('20'));
		assert.bnClose(await synthetix.debtBalanceOf(account2, sUSD), toUnit('20'));
	});

	it('should allow multiple issuers to issue synths in multiple flavours', async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1 and account2
		await synthetix.transfer(account1, toUnit('10000'), { from: owner });
		await synthetix.transfer(account2, toUnit('10000'), { from: owner });

		// Issue
		await synthetix.issueSynths(sUSD, toUnit('10'), { from: account1 });
		await synthetix.issueSynths(sAUD, toUnit('20'), { from: account2 });

		// There should be 20 sUSD of value in the system
		assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('20'));

		// And the debt should be split 50/50.
		// But there's a small rounding error.
		// This is ok, as when the last person exits the system, their debt percentage is always 100% so
		// these rounding errors don't cause the system to be out of balance.
		assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('10'));
		assert.bnEqual(await synthetix.debtBalanceOf(account2, sUSD), toUnit('10'));
	});

	it('should allow an issuer to issue max synths in one flavour', async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('10000'), { from: owner });

		// Issue
		await synthetix.issueMaxSynths(sUSD, { from: account1 });

		// There should be 200 sUSD of value in the system
		assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('200'));

		// And account1 should own all of it.
		assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('200'));
	});

	it('should allow an issuer to issue max synths via the standard issue call', async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('10000'), { from: owner });

		// Determine maximum amount that can be issued.
		const maxIssuable = await synthetix.maxIssuableSynths(account1, sUSD);

		// Issue
		await synthetix.issueSynths(sUSD, maxIssuable, { from: account1 });

		// There should be 200 sUSD of value in the system
		assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('200'));

		// And account1 should own all of it.
		assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('200'));
	});

	it('should disallow an issuer from issuing synths in a non-existant flavour', async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('10000'), { from: owner });

		// They should now be able to issue sUSD
		await synthetix.issueSynths(sUSD, toUnit('10'), { from: account1 });

		// But should not be able to issue sXYZ because it doesn't exist
		await assert.revert(synthetix.issueSynths(sXYZ, toUnit('10')));
	});

	it('should disallow an issuer from issuing synths beyond their remainingIssuableSynths', async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('10000'), { from: owner });

		// They should now be able to issue sUSD
		const issuableSynths = await synthetix.remainingIssuableSynths(account1, sUSD);
		assert.bnEqual(issuableSynths, toUnit('200'));

		// Issue that amount.
		await synthetix.issueSynths(sUSD, issuableSynths, { from: account1 });

		// They should now have 0 issuable synths.
		assert.bnEqual(await synthetix.remainingIssuableSynths(account1, sUSD), '0');

		// And trying to issue the smallest possible unit of one should fail.
		await assert.revert(synthetix.issueSynths(sUSD, '1', { from: account1 }));
	});

	it('should allow an issuer with outstanding debt to burn synths and decrease debt', async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('10000'), { from: owner });

		// Issue
		await synthetix.issueMaxSynths(sUSD, { from: account1 });

		// account1 should now have 200 sUSD of debt.
		assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('200'));

		// Burn 100 sUSD
		await synthetix.burnSynths(sUSD, toUnit('100'), { from: account1 });

		// account1 should now have 100 sUSD of debt.
		assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('100'));
	});

	it('should disallow an issuer without outstanding debt from burning synths', async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('10000'), { from: owner });

		// Issue
		await synthetix.issueMaxSynths(sUSD, { from: account1 });

		// account2 should not have anything and can't burn.
		await assert.revert(synthetix.burnSynths(sUSD, toUnit('10'), { from: account2 }));

		// And even when we give account2 synths, it should not be able to burn.
		await sUSDContract.transfer(account2, toUnit('100'), { from: account1 });
		await assert.revert(synthetix.burnSynths(sUSD, toUnit('10'), { from: account2 }));
	});

	it('should fail when trying to burn synths that do not exist', async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('10000'), { from: owner });

		// Issue
		await synthetix.issueMaxSynths(sUSD, { from: account1 });

		// Transfer all newly issued synths to account2
		await sUSDContract.transfer(account2, toUnit('200'), { from: account1 });

		// Burning any amount of sUSD from account1 should fail
		await assert.revert(synthetix.burnSynths(sUSD, '1', { from: account1 }));
	});

	it("should only burn up to a user's actual debt level", async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('10000'), { from: owner });
		await synthetix.transfer(account2, toUnit('10000'), { from: owner });

		// Issue
		const fullAmount = toUnit('210');
		const account1Payment = toUnit('10');
		const account2Payment = fullAmount.sub(account1Payment);
		await synthetix.issueSynths(sUSD, account1Payment, { from: account1 });
		await synthetix.issueSynths(sUSD, account2Payment, { from: account2 });

		// Transfer all of account2's synths to account1
		await sUSDContract.transfer(account1, toUnit('200'), { from: account2 });
		// return;

		// Calculate the amount that account1 should actually receive
		const amountReceived = await feePool.amountReceivedFromTransfer(toUnit('200'));

		const balanceOfAccount1 = await sUSDContract.balanceOf(account1);

		// Then try to burn them all. Only 10 synths (and fees) should be gone.
		await synthetix.burnSynths(sUSD, balanceOfAccount1, { from: account1 });
		const balanceOfAccount1AfterBurn = await sUSDContract.balanceOf(account1);

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
		assert.bnClose(balanceOfAccount1AfterBurn, amountReceived, '1000');
	});

	it('should correctly calculate debt in a multi-issuance scenario', async function() {
		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('200000'), { from: owner });
		await synthetix.transfer(account2, toUnit('200000'), { from: owner });

		// Issue
		const issuedSynthsPt1 = toUnit('2000');
		const issuedSynthsPt2 = toUnit('2000');
		await synthetix.issueSynths(sUSD, issuedSynthsPt1, { from: account1 });
		await synthetix.issueSynths(sUSD, issuedSynthsPt2, { from: account1 });
		await synthetix.issueSynths(sUSD, toUnit('1000'), { from: account2 });

		const debt = await synthetix.debtBalanceOf(account1, sUSD);
		assert.bnClose(debt, toUnit('4000'));
	});

	it('should correctly calculate debt in a multi-issuance multi-burn scenario', async function() {
		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('500000'), { from: owner });
		await synthetix.transfer(account2, toUnit('14000'), { from: owner });

		// Issue
		const issuedSynthsPt1 = toUnit('2000');
		const burntSynthsPt1 = toUnit('1500');
		const issuedSynthsPt2 = toUnit('1600');
		const burntSynthsPt2 = toUnit('500');

		await synthetix.issueSynths(sUSD, issuedSynthsPt1, { from: account1 });
		await synthetix.burnSynths(sUSD, burntSynthsPt1, { from: account1 });
		await synthetix.issueSynths(sUSD, issuedSynthsPt2, { from: account1 });

		await synthetix.issueSynths(sUSD, toUnit('100'), { from: account2 });
		await synthetix.issueSynths(sUSD, toUnit('51'), { from: account2 });
		await synthetix.burnSynths(sUSD, burntSynthsPt2, { from: account1 });

		const debt = await synthetix.debtBalanceOf(account1, web3.utils.asciiToHex('sUSD'));
		const expectedDebt = issuedSynthsPt1
			.add(issuedSynthsPt2)
			.sub(burntSynthsPt1)
			.sub(burntSynthsPt2);

		assert.bnClose(debt, expectedDebt);
	});

	it("should allow me to burn all synths I've issued when there are other issuers", async function() {
		const totalSupply = await synthetix.totalSupply();
		const account2Synthetixs = toUnit('120000');
		const account1Synthetixs = totalSupply.sub(account2Synthetixs);

		await synthetix.transfer(account1, account1Synthetixs, { from: owner }); // Issue the massive majority to account1
		await synthetix.transfer(account2, account2Synthetixs, { from: owner }); // Issue a small amount to account2

		// Issue from account1
		const account1AmountToIssue = await synthetix.maxIssuableSynths(account1, sUSD);
		await synthetix.issueMaxSynths(sUSD, { from: account1 });
		const debtBalance1 = await synthetix.debtBalanceOf(account1, sUSD);
		assert.bnClose(debtBalance1, account1AmountToIssue);

		// Issue and burn from account 2
		await synthetix.issueSynths(sUSD, toUnit('43'), { from: account2 });
		let debt = await synthetix.debtBalanceOf(account2, sUSD);
		await synthetix.burnSynths(sUSD, toUnit('43'), { from: account2 });
		debt = await synthetix.debtBalanceOf(account2, sUSD);

		assert.bnEqual(debt, 0);

		assert.deepEqual(await synthetixState.issuanceData(account2), {
			initialDebtOwnership: 0,
			debtEntryIndex: 0,
		});
	});

	// These tests take a long time to run
	// ****************************************

	it('should correctly calculate debt in a high issuance and burn scenario', async function() {
		const getRandomInt = (min, max) => {
			return min + Math.floor(Math.random() * Math.floor(max));
		};

		const totalSupply = await synthetix.totalSupply();
		const account2Synthetixs = toUnit('120000');
		const account1Synthetixs = totalSupply.sub(account2Synthetixs);

		await synthetix.transfer(account1, account1Synthetixs, { from: owner }); // Issue the massive majority to account1
		await synthetix.transfer(account2, account2Synthetixs, { from: owner }); // Issue a small amount to account2

		const account1AmountToIssue = await synthetix.maxIssuableSynths(account1, sUSD);
		await synthetix.issueMaxSynths(sUSD, { from: account1 });
		const debtBalance1 = await synthetix.debtBalanceOf(account1, sUSD);
		assert.bnClose(debtBalance1, account1AmountToIssue);

		let expectedDebtForAccount2 = web3.utils.toBN('0');
		const totalTimesToIssue = 40;
		for (let i = 0; i < totalTimesToIssue; i++) {
			// Seems that in this case, issuing 43 each time leads to increasing the variance regularly each time.
			const amount = toUnit('43');
			await synthetix.issueSynths(sUSD, amount, { from: account2 });
			expectedDebtForAccount2 = expectedDebtForAccount2.add(amount);

			const desiredAmountToBurn = toUnit(web3.utils.toBN(getRandomInt(4, 14)));
			const amountToBurn = desiredAmountToBurn.lte(expectedDebtForAccount2)
				? desiredAmountToBurn
				: expectedDebtForAccount2;
			await synthetix.burnSynths(sUSD, amountToBurn, { from: account2 });
			expectedDebtForAccount2 = expectedDebtForAccount2.sub(amountToBurn);

			// Useful debug logging
			// const db = await synthetix.debtBalanceOf(account2, sUSD);
			// const variance = fromUnit(expectedDebtForAccount2.sub(db));
			// console.log(
			// 	`#### debtBalance: ${db}\t\t expectedDebtForAccount2: ${expectedDebtForAccount2}\t\tvariance: ${variance}`
			// );
		}
		const debtBalance = await synthetix.debtBalanceOf(account2, sUSD);

		// Here we make the variance a calculation of the number of times we issue/burn.
		// This is less than ideal, but is the result of calculating the debt based on
		// the results of the issue/burn each time.
		const variance = web3.utils.toBN(totalTimesToIssue).mul(web3.utils.toBN('2'));
		assert.bnClose(debtBalance, expectedDebtForAccount2, variance);
	});

	it('should correctly calculate debt in a high (random) issuance and burn scenario', async function() {
		const getRandomInt = (min, max) => {
			return min + Math.floor(Math.random() * Math.floor(max));
		};

		const totalSupply = await synthetix.totalSupply();
		const account2Synthetixs = toUnit('120000');
		const account1Synthetixs = totalSupply.sub(account2Synthetixs);

		await synthetix.transfer(account1, account1Synthetixs, { from: owner }); // Issue the massive majority to account1
		await synthetix.transfer(account2, account2Synthetixs, { from: owner }); // Issue a small amount to account2

		const account1AmountToIssue = await synthetix.maxIssuableSynths(account1, sUSD);
		await synthetix.issueMaxSynths(sUSD, { from: account1 });
		const debtBalance1 = await synthetix.debtBalanceOf(account1, sUSD);
		assert.bnClose(debtBalance1, account1AmountToIssue);

		let expectedDebtForAccount2 = web3.utils.toBN('0');
		const totalTimesToIssue = 40;
		for (let i = 0; i < totalTimesToIssue; i++) {
			// Seems that in this case, issuing 43 each time leads to increasing the variance regularly each time.
			const amount = toUnit(web3.utils.toBN(getRandomInt(40, 49)));
			await synthetix.issueSynths(sUSD, amount, { from: account2 });
			expectedDebtForAccount2 = expectedDebtForAccount2.add(amount);

			const desiredAmountToBurn = toUnit(web3.utils.toBN(getRandomInt(37, 46)));
			const amountToBurn = desiredAmountToBurn.lte(expectedDebtForAccount2)
				? desiredAmountToBurn
				: expectedDebtForAccount2;
			await synthetix.burnSynths(sUSD, amountToBurn, { from: account2 });
			expectedDebtForAccount2 = expectedDebtForAccount2.sub(amountToBurn);

			// Useful debug logging
			// const db = await synthetix.debtBalanceOf(account2, sUSD);
			// const variance = fromUnit(expectedDebtForAccount2.sub(db));
			// console.log(
			// 	`#### debtBalance: ${db}\t\t expectedDebtForAccount2: ${expectedDebtForAccount2}\t\tvariance: ${variance}`
			// );
		}
		const debtBalance = await synthetix.debtBalanceOf(account2, sUSD);

		// Here we make the variance a calculation of the number of times we issue/burn.
		// This is less than ideal, but is the result of calculating the debt based on
		// the results of the issue/burn each time.
		const variance = web3.utils.toBN(totalTimesToIssue).mul(web3.utils.toBN('2'));
		assert.bnClose(debtBalance, expectedDebtForAccount2, variance);
	});

	it('should correctly calculate debt in a high volume contrast issuance and burn scenario', async function() {
		const totalSupply = await synthetix.totalSupply();

		// Give only 100 Synthetix to account2
		const account2Synthetixs = toUnit('100');

		// Give the vast majority to account1 (ie. 99,999,900)
		const account1Synthetixs = totalSupply.sub(account2Synthetixs);

		await synthetix.transfer(account1, account1Synthetixs, { from: owner }); // Issue the massive majority to account1
		await synthetix.transfer(account2, account2Synthetixs, { from: owner }); // Issue a small amount to account2

		const account1AmountToIssue = await synthetix.maxIssuableSynths(account1, sUSD);
		await synthetix.issueMaxSynths(sUSD, { from: account1 });
		const debtBalance1 = await synthetix.debtBalanceOf(account1, sUSD);
		assert.bnEqual(debtBalance1, account1AmountToIssue);

		let expectedDebtForAccount2 = web3.utils.toBN('0');
		const totalTimesToIssue = 40;
		for (let i = 0; i < totalTimesToIssue; i++) {
			const amount = toUnit('0.000000000000000002');
			await synthetix.issueSynths(sUSD, amount, { from: account2 });
			expectedDebtForAccount2 = expectedDebtForAccount2.add(amount);
		}
		const debtBalance2 = await synthetix.debtBalanceOf(account2, sUSD);

		// Here we make the variance a calculation of the number of times we issue/burn.
		// This is less than ideal, but is the result of calculating the debt based on
		// the results of the issue/burn each time.
		const variance = web3.utils.toBN(totalTimesToIssue).mul(web3.utils.toBN('2'));
		assert.bnClose(debtBalance2, expectedDebtForAccount2, variance);
	});

	// ****************************************

	it('should not change debt balance if exchange rates change', async function() {
		const oracle = await exchangeRates.oracle();
		let newAUDRate = toUnit('0.5');
		let timestamp = await currentTime();
		await exchangeRates.updateRates([sAUD], [newAUDRate], timestamp, { from: oracle });

		await synthetix.transfer(account1, toUnit('2000'), { from: owner });
		await synthetix.transfer(account2, toUnit('2000'), { from: owner });

		const amountIssued = toUnit('30');
		await synthetix.issueSynths(sUSD, amountIssued, { from: account1 });
		await synthetix.issueSynths(sAUD, amountIssued, { from: account2 });

		const PRECISE_UNIT = web3.utils.toWei(web3.utils.toBN('1'), 'gether');
		let totalIssuedSynthsUSD = await synthetix.totalIssuedSynths(sUSD);
		const account1DebtRatio = divideDecimal(amountIssued, totalIssuedSynthsUSD, PRECISE_UNIT);
		const audExchangeRate = await exchangeRates.rateForCurrency(sAUD);
		const account2DebtRatio = divideDecimal(
			multiplyDecimal(amountIssued, audExchangeRate),
			totalIssuedSynthsUSD,
			PRECISE_UNIT
		);

		timestamp = await currentTime();
		newAUDRate = toUnit('1.85');
		await exchangeRates.updateRates([sAUD], [newAUDRate], timestamp, { from: oracle });

		totalIssuedSynthsUSD = await synthetix.totalIssuedSynths(sUSD);
		const conversionFactor = web3.utils.toBN(1000000000);
		const expectedDebtAccount1 = multiplyDecimal(
			account1DebtRatio,
			totalIssuedSynthsUSD.mul(conversionFactor),
			PRECISE_UNIT
		).div(conversionFactor);
		const expectedDebtAccount2 = multiplyDecimal(
			account2DebtRatio,
			totalIssuedSynthsUSD.mul(conversionFactor),
			PRECISE_UNIT
		).div(conversionFactor);

		assert.bnClose(expectedDebtAccount1, await synthetix.debtBalanceOf(account1, sUSD));
		assert.bnClose(expectedDebtAccount2, await synthetix.debtBalanceOf(account2, sUSD));
	});

	it("should correctly calculate a user's maximum issuable synths without prior issuance", async function() {
		const rate = await exchangeRates.rateForCurrency(web3.utils.asciiToHex('SNX'));
		const issuedSynthetixs = web3.utils.toBN('200000');
		await synthetix.transfer(account1, toUnit(issuedSynthetixs), { from: owner });
		const issuanceRatio = await synthetixState.issuanceRatio();

		const expectedIssuableSynths = multiplyDecimal(
			toUnit(issuedSynthetixs),
			multiplyDecimal(rate, issuanceRatio)
		);
		const maxIssuableSynths = await synthetix.maxIssuableSynths(account1, sUSD);

		assert.bnEqual(expectedIssuableSynths, maxIssuableSynths);
	});

	it("should correctly calculate a user's maximum issuable synths without any havens", async function() {
		const maxIssuableSynths = await synthetix.maxIssuableSynths(account1, sEUR);
		assert.bnEqual(0, maxIssuableSynths);
	});

	it("should correctly calculate a user's maximum issuable synths with prior issuance", async function() {
		const snx2usdRate = await exchangeRates.rateForCurrency(SNX);
		const aud2usdRate = await exchangeRates.rateForCurrency(sAUD);
		const snx2audRate = divideDecimal(snx2usdRate, aud2usdRate);

		const issuedSynthetixs = web3.utils.toBN('320001');
		await synthetix.transfer(account1, toUnit(issuedSynthetixs), { from: owner });

		const issuanceRatio = await synthetixState.issuanceRatio();
		const sAUDIssued = web3.utils.toBN('1234');
		await synthetix.issueSynths(sAUD, toUnit(sAUDIssued), { from: account1 });

		const expectedIssuableSynths = multiplyDecimal(
			toUnit(issuedSynthetixs),
			multiplyDecimal(snx2audRate, issuanceRatio)
		);

		const maxIssuableSynths = await synthetix.maxIssuableSynths(account1, sAUD);
		assert.bnEqual(expectedIssuableSynths, maxIssuableSynths);
	});

	it('should error when calculating maximum issuance when the SNX rate is stale', async function() {
		// Add stale period to the time to ensure we go stale.
		await fastForward((await exchangeRates.rateStalePeriod()) + 1);
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates([sAUD, sEUR], ['0.5', '1.25'].map(toUnit), timestamp, {
			from: oracle,
		});

		await assert.revert(synthetix.maxIssuableSynths(account1, sAUD));
	});

	it('should error when calculating maximum issuance when the currency rate is stale', async function() {
		// Add stale period to the time to ensure we go stale.
		await fastForward((await exchangeRates.rateStalePeriod()) + 1);
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates([sEUR, SNX], ['1.25', '0.12'].map(toUnit), timestamp, {
			from: oracle,
		});

		await assert.revert(synthetix.maxIssuableSynths(account1, sAUD));
	});

	it("should correctly calculate a user's debt balance without prior issuance", async function() {
		await synthetix.transfer(account1, toUnit('200000'), { from: owner });
		await synthetix.transfer(account2, toUnit('10000'), { from: owner });

		const debt1 = await synthetix.debtBalanceOf(account1, web3.utils.asciiToHex('sUSD'));
		const debt2 = await synthetix.debtBalanceOf(account2, web3.utils.asciiToHex('sUSD'));
		assert.bnEqual(debt1, 0);
		assert.bnEqual(debt2, 0);
	});

	it("should correctly calculate a user's debt balance with prior issuance", async function() {
		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('200000'), { from: owner });

		// Issue
		const issuedSynths = toUnit('1001');
		await synthetix.issueSynths(sUSD, issuedSynths, { from: account1 });

		const debt = await synthetix.debtBalanceOf(account1, web3.utils.asciiToHex('sUSD'));
		assert.bnEqual(debt, issuedSynths);
	});

	it("should correctly calculate a user's remaining issuable synths with prior issuance", async function() {
		const snx2usdRate = await exchangeRates.rateForCurrency(SNX);
		const eur2usdRate = await exchangeRates.rateForCurrency(sEUR);
		const snx2eurRate = divideDecimal(snx2usdRate, eur2usdRate);
		const issuanceRatio = await synthetixState.issuanceRatio();

		const issuedSynthetixs = web3.utils.toBN('200012');
		await synthetix.transfer(account1, toUnit(issuedSynthetixs), { from: owner });

		// Issue
		const sEURIssued = toUnit('2011');
		await synthetix.issueSynths(sEUR, sEURIssued, { from: account1 });

		const expectedIssuableSynths = multiplyDecimal(
			toUnit(issuedSynthetixs),
			multiplyDecimal(snx2eurRate, issuanceRatio)
		).sub(sEURIssued);

		const remainingIssuable = await synthetix.remainingIssuableSynths(account1, sEUR);
		assert.bnEqual(remainingIssuable, expectedIssuableSynths);
	});

	it("should correctly calculate a user's remaining issuable synths without prior issuance", async function() {
		const snx2usdRate = await exchangeRates.rateForCurrency(SNX);
		const eur2usdRate = await exchangeRates.rateForCurrency(sEUR);
		const snx2eurRate = divideDecimal(snx2usdRate, eur2usdRate);
		const issuanceRatio = await synthetixState.issuanceRatio();

		const issuedSynthetixs = web3.utils.toBN('20');
		await synthetix.transfer(account1, toUnit(issuedSynthetixs), { from: owner });

		const expectedIssuableSynths = multiplyDecimal(
			toUnit(issuedSynthetixs),
			multiplyDecimal(snx2eurRate, issuanceRatio)
		);

		const remainingIssuable = await synthetix.remainingIssuableSynths(account1, sEUR);
		assert.bnEqual(remainingIssuable, expectedIssuableSynths);
	});

	it('should not be possible to transfer locked synthetix', async function() {
		const issuedSynthetixs = web3.utils.toBN('200000');
		await synthetix.transfer(account1, toUnit(issuedSynthetixs), { from: owner });

		// Issue
		const sEURIssued = toUnit('2000');
		await synthetix.issueSynths(sEUR, sEURIssued, { from: account1 });

		await assert.revert(synthetix.transfer(account2, toUnit(issuedSynthetixs), { from: account1 }));
	});

	it("should lock synthetix if the user's collaterisation changes to be insufficient", async function() {
		const oracle = await exchangeRates.oracle();

		// Set sEUR for purposes of this test
		const timestamp1 = await currentTime();
		await exchangeRates.updateRates([sEUR], [toUnit('0.75')], timestamp1, { from: oracle });

		const issuedSynthetixs = web3.utils.toBN('200000');
		await synthetix.transfer(account1, toUnit(issuedSynthetixs), { from: owner });

		const maxIssuableSynths = await synthetix.maxIssuableSynths(account1, sEUR);

		// Issue
		const synthsToNotIssueYet = web3.utils.toBN('2000');
		const issuedSynths = maxIssuableSynths.sub(synthsToNotIssueYet);
		await synthetix.issueSynths(sEUR, issuedSynths, { from: account1 });

		// Increase the value of sEUR relative to synthetix
		const timestamp2 = await currentTime();
		await exchangeRates.updateRates([sEUR], [toUnit('1.10')], timestamp2, { from: oracle });

		await assert.revert(synthetix.issueSynths(sEUR, synthsToNotIssueYet, { from: account1 }));
	});

	it("should lock newly received synthetix if the user's collaterisation is too high", async function() {
		const oracle = await exchangeRates.oracle();

		// Set sEUR for purposes of this test
		const timestamp1 = await currentTime();
		await exchangeRates.updateRates([sEUR], [toUnit('0.75')], timestamp1, { from: oracle });

		const issuedSynthetixs = web3.utils.toBN('200000');
		await synthetix.transfer(account1, toUnit(issuedSynthetixs), { from: owner });
		await synthetix.transfer(account2, toUnit(issuedSynthetixs), { from: owner });

		const maxIssuableSynths = await synthetix.maxIssuableSynths(account1, sEUR);

		// Issue
		await synthetix.issueSynths(sEUR, maxIssuableSynths, { from: account1 });

		// Ensure that we can transfer in and out of the account successfully
		await synthetix.transfer(account1, toUnit('10000'), { from: account2 });
		await synthetix.transfer(account2, toUnit('10000'), { from: account1 });

		// Increase the value of sEUR relative to synthetix
		const timestamp2 = await currentTime();
		await exchangeRates.updateRates([sEUR], [toUnit('2.10')], timestamp2, { from: oracle });

		// Ensure that the new synthetix account1 receives cannot be transferred out.
		await synthetix.transfer(account1, toUnit('10000'), { from: account2 });
		await assert.revert(synthetix.transfer(account2, toUnit('10000'), { from: account1 }));
	});

	it('should unlock synthetix when collaterisation ratio changes', async function() {
		const oracle = await exchangeRates.oracle();

		// Set sAUD for purposes of this test
		const timestamp1 = await currentTime();
		await exchangeRates.updateRates([sAUD], [toUnit('1.7655')], timestamp1, { from: oracle });

		const issuedSynthetixs = web3.utils.toBN('200000');
		await synthetix.transfer(account1, toUnit(issuedSynthetixs), { from: owner });

		// Issue
		const issuedSynths = await synthetix.maxIssuableSynths(account1, sAUD);
		await synthetix.issueSynths(sAUD, issuedSynths, { from: account1 });
		const remainingIssuable = await synthetix.remainingIssuableSynths(account1, sAUD);
		assert.bnClose(remainingIssuable, '0');

		// Increase the value of sAUD relative to synthetix
		const timestamp2 = await currentTime();
		const newAUDExchangeRate = toUnit('0.9988');
		await exchangeRates.updateRates([sAUD], [newAUDExchangeRate], timestamp2, { from: oracle });

		const maxIssuableSynths2 = await synthetix.maxIssuableSynths(account1, sAUD);
		const remainingIssuable2 = await synthetix.remainingIssuableSynths(account1, sAUD);
		const expectedRemaining = maxIssuableSynths2.sub(issuedSynths);
		assert.bnClose(remainingIssuable2, expectedRemaining);
	});

	// Check user's collaterisation ratio

	it('should return 0 if user has no synthetix when checking the collaterisation ratio', async function() {
		const ratio = await synthetix.collateralisationRatio(account1);
		assert.bnEqual(ratio, new web3.utils.BN(0));
	});

	it('Any user can check the collaterisation ratio for a user', async function() {
		const issuedSynthetixs = web3.utils.toBN('320000');
		await synthetix.transfer(account1, toUnit(issuedSynthetixs), { from: owner });

		// Issue
		const issuedSynths = toUnit(web3.utils.toBN('6400'));
		await synthetix.issueSynths(sAUD, issuedSynths, { from: account1 });

		await synthetix.collateralisationRatio(account1, { from: account2 });
	});

	it('should be able to read collaterisation ratio for a user with synthetix but no debt', async function() {
		const issuedSynthetixs = web3.utils.toBN('30000');
		await synthetix.transfer(account1, toUnit(issuedSynthetixs), { from: owner });

		const ratio = await synthetix.collateralisationRatio(account1);
		assert.bnEqual(ratio, new web3.utils.BN(0));
	});

	it('should be able to read collaterisation ratio for a user with synthetix and debt', async function() {
		const issuedSynthetixs = web3.utils.toBN('320000');
		await synthetix.transfer(account1, toUnit(issuedSynthetixs), { from: owner });

		// Issue
		const issuedSynths = toUnit(web3.utils.toBN('6400'));
		await synthetix.issueSynths(sAUD, issuedSynths, { from: account1 });

		const ratio = await synthetix.collateralisationRatio(account1, { from: account2 });
		assert.unitEqual(ratio, '0.1');
	});

	it("should include escrowed synthetix when calculating a user's collaterisation ratio", async function() {
		const snx2usdRate = await exchangeRates.rateForCurrency(SNX);
		const transferredSynthetixs = toUnit('60000');
		await synthetix.transfer(account1, transferredSynthetixs, { from: owner });

		// Setup escrow
		const escrow = await Escrow.new(owner, synthetix.address, { from: owner });
		await synthetix.setEscrow(escrow.address, { from: owner });
		const oneWeek = 60 * 60 * 24 * 7;
		const twelveWeeks = oneWeek * 12;
		const now = await currentTime();
		const escrowedSynthetixs = toUnit('30000');
		await synthetix.transfer(escrow.address, escrowedSynthetixs, { from: owner });
		await escrow.appendVestingEntry(
			account1,
			web3.utils.toBN(now + twelveWeeks),
			escrowedSynthetixs,
			{
				from: owner,
			}
		);

		// Issue
		const maxIssuable = await synthetix.maxIssuableSynths(account1, sUSD);
		await synthetix.issueSynths(sUSD, maxIssuable, { from: account1 });

		// Compare
		const collaterisationRatio = await synthetix.collateralisationRatio(account1);
		const expectedCollaterisationRatio = divideDecimal(
			maxIssuable,
			multiplyDecimal(escrowedSynthetixs.add(transferredSynthetixs), snx2usdRate)
		);
		assert.bnEqual(collaterisationRatio, expectedCollaterisationRatio);
	});

	it("should permit anyone checking another user's collateral", async function() {
		const amount = toUnit('60000');
		await synthetix.transfer(account1, amount, { from: owner });
		const collateral = await synthetix.collateral(account1, { from: account2 });
		assert.bnEqual(collateral, amount);
	});

	it("should include escrowed synthetix when checking a user's collateral", async function() {
		const escrow = await Escrow.new(owner, synthetix.address, { from: owner });
		await synthetix.setEscrow(escrow.address, { from: owner });
		const oneWeek = 60 * 60 * 24 * 7;
		const twelveWeeks = oneWeek * 12;
		const now = await currentTime();
		const escrowedAmount = toUnit('15000');
		await synthetix.transfer(escrow.address, escrowedAmount, { from: owner });
		await escrow.appendVestingEntry(account1, web3.utils.toBN(now + twelveWeeks), escrowedAmount, {
			from: owner,
		});

		const amount = toUnit('60000');
		await synthetix.transfer(account1, amount, { from: owner });
		const collateral = await synthetix.collateral(account1, { from: account2 });
		assert.bnEqual(collateral, amount.add(escrowedAmount));
	});

	// Stale rate check

	it('should allow anyone to check if any rates are stale', async function() {
		const instance = await ExchangeRates.deployed();
		const result = await instance.anyRateIsStale([sEUR, sAUD], { from: owner });
		assert.equal(result, false);
	});

	it("should calculate a user's remaining issuable synths", async function() {
		const transferredSynthetixs = toUnit('60000');
		await synthetix.transfer(account1, transferredSynthetixs, { from: owner });

		// Issue
		const maxIssuable = await synthetix.maxIssuableSynths(account1, sUSD);
		const issued = maxIssuable.div(web3.utils.toBN(3));
		await synthetix.issueSynths(sUSD, issued, { from: account1 });
		const expectedRemaining = maxIssuable.sub(issued);
		const remaining = await synthetix.remainingIssuableSynths(account1, sUSD);
		assert.bnEqual(expectedRemaining, remaining);
	});

	it("should disallow retrieving a user's remaining issuable synths if that synth doesn't exist", async function() {
		await assert.revert(synthetix.remainingIssuableSynths(account1, web3.utils.asciiToHex('BOG')));
	});

	it("should correctly calculate a user's max issuable synths with escrowed synthetix", async function() {
		const snx2usdRate = await exchangeRates.rateForCurrency(SNX);
		const transferredSynthetixs = toUnit('60000');
		await synthetix.transfer(account1, transferredSynthetixs, { from: owner });

		// Setup escrow
		const escrow = await Escrow.new(owner, synthetix.address, { from: owner });
		await synthetix.setEscrow(escrow.address, { from: owner });
		const oneWeek = 60 * 60 * 24 * 7;
		const twelveWeeks = oneWeek * 12;
		const now = await currentTime();
		const escrowedSynthetixs = toUnit('30000');
		await synthetix.transfer(escrow.address, escrowedSynthetixs, { from: owner });
		await escrow.appendVestingEntry(
			account1,
			web3.utils.toBN(now + twelveWeeks),
			escrowedSynthetixs,
			{
				from: owner,
			}
		);

		const maxIssuable = await synthetix.maxIssuableSynths(account1, sUSD);
		// await synthetix.issueSynths(sUSD, maxIssuable, { from: account1 });

		// Compare
		const issuanceRatio = await synthetixState.issuanceRatio();
		const expectedMaxIssuable = multiplyDecimal(
			multiplyDecimal(escrowedSynthetixs.add(transferredSynthetixs), snx2usdRate),
			issuanceRatio
		);
		assert.bnEqual(maxIssuable, expectedMaxIssuable);
	});

	// Burning Synths

	it("should successfully burn all user's synths", async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates([SNX], [toUnit('0.1')], timestamp, {
			from: oracle,
		});

		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('10000'), { from: owner });

		// Issue
		await synthetix.issueSynths(sUSD, toUnit('199'), { from: account1 });

		// Then try to burn them all. Only 10 synths (and fees) should be gone.
		await synthetix.burnSynths(sUSD, await sUSDContract.balanceOf(account1), { from: account1 });
		assert.bnEqual(await sUSDContract.balanceOf(account1), web3.utils.toBN(0));
	});

	it('should burn the correct amount of synths', async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates([sAUD, SNX], ['0.9', '0.1'].map(toUnit), timestamp, {
			from: oracle,
		});

		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('400000'), { from: owner });

		// Issue
		await synthetix.issueSynths(sAUD, toUnit('3987'), { from: account1 });

		// Then try to burn some of them. There should be 3000 left.
		await synthetix.burnSynths(sAUD, toUnit('987'), { from: account1 });
		assert.bnEqual(await sAUDContract.balanceOf(account1), toUnit('3000'));
	});

	it("should successfully burn all user's synths even with transfer", async function() {
		// Send a price update to guarantee we're not depending on values from outside this test.
		const oracle = await exchangeRates.oracle();
		const timestamp = await currentTime();

		await exchangeRates.updateRates([SNX], [toUnit('0.1')], timestamp, {
			from: oracle,
		});

		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('300000'), { from: owner });

		// Issue
		const amountIssued = toUnit('2000');
		await synthetix.issueSynths(sUSD, amountIssued, { from: account1 });

		// Transfer account1's synths to account2 and back
		const amountToTransfer = toUnit('1800');
		await sUSDContract.transfer(account2, amountToTransfer, { from: account1 });
		const remainingAfterTransfer = await sUSDContract.balanceOf(account1);
		await sUSDContract.transfer(account1, await sUSDContract.balanceOf(account2), {
			from: account2,
		});

		// Calculate the amount that account1 should actually receive
		const amountReceived = await feePool.amountReceivedFromTransfer(toUnit('1800'));
		const amountReceived2 = await feePool.amountReceivedFromTransfer(amountReceived);
		const amountLostToFees = amountToTransfer.sub(amountReceived2);

		// Check that the transfer worked ok.
		const amountExpectedToBeLeftInWallet = amountIssued.sub(amountLostToFees);
		assert.bnEqual(amountReceived2.add(remainingAfterTransfer), amountExpectedToBeLeftInWallet);

		// Now burn 1000 and check we end up with the right amount
		await synthetix.burnSynths(sUSD, toUnit('1000'), { from: account1 });
		assert.bnEqual(
			await sUSDContract.balanceOf(account1),
			amountExpectedToBeLeftInWallet.sub(toUnit('1000'))
		);
	});

	it('should allow the last user in the system to burn all their synths to release their synthetix', async function() {
		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('500000'), { from: owner });
		await synthetix.transfer(account2, toUnit('140000'), { from: owner });
		await synthetix.transfer(account3, toUnit('1400000'), { from: owner });

		// Issue
		const issuedSynths1 = toUnit('2000');
		const issuedSynths2 = toUnit('2000');
		const issuedSynths3 = toUnit('2000');

		await synthetix.issueSynths(sUSD, issuedSynths1, { from: account1 });
		await synthetix.issueSynths(sUSD, issuedSynths2, { from: account2 });
		await synthetix.issueSynths(sUSD, issuedSynths3, { from: account3 });

		const debtBalance1 = await synthetix.debtBalanceOf(account1, sUSD);
		await synthetix.burnSynths(sUSD, debtBalance1, { from: account1 });
		const debtBalance2 = await synthetix.debtBalanceOf(account2, sUSD);
		await synthetix.burnSynths(sUSD, debtBalance2, { from: account2 });
		const debtBalance3 = await synthetix.debtBalanceOf(account3, sUSD);
		await synthetix.burnSynths(sUSD, debtBalance3, { from: account3 });

		const debtBalance1After = await synthetix.debtBalanceOf(account1, sUSD);
		const debtBalance2After = await synthetix.debtBalanceOf(account2, sUSD);
		const debtBalance3After = await synthetix.debtBalanceOf(account3, sUSD);

		assert.bnEqual(debtBalance1After, '0');
		assert.bnEqual(debtBalance2After, '0');
		assert.bnEqual(debtBalance3After, '0');
	});

	it('should allow user to burn all synths issued even after other users have issued', async function() {
		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('500000'), { from: owner });
		await synthetix.transfer(account2, toUnit('140000'), { from: owner });
		await synthetix.transfer(account3, toUnit('1400000'), { from: owner });

		// Issue
		const issuedSynths1 = toUnit('2000');
		const issuedSynths2 = toUnit('2000');
		const issuedSynths3 = toUnit('2000');

		await synthetix.issueSynths(sUSD, issuedSynths1, { from: account1 });
		await synthetix.issueSynths(sUSD, issuedSynths2, { from: account2 });
		await synthetix.issueSynths(sUSD, issuedSynths3, { from: account3 });

		const debtBalanceBefore = await synthetix.debtBalanceOf(account1, sUSD);
		await synthetix.burnSynths(sUSD, debtBalanceBefore, { from: account1 });
		const debtBalanceAfter = await synthetix.debtBalanceOf(account1, sUSD);

		assert.bnEqual(debtBalanceAfter, '0');
	});

	it('should allow a user to burn up to their balance if they try too burn too much', async function() {
		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('500000'), { from: owner });

		// Issue
		const issuedSynths1 = toUnit('10');

		await synthetix.issueSynths(sUSD, issuedSynths1, { from: account1 });
		await synthetix.burnSynths(sUSD, issuedSynths1.add(toUnit('9000')), {
			from: account1,
		});
		const debtBalanceAfter = await synthetix.debtBalanceOf(account1, sUSD);

		assert.bnEqual(debtBalanceAfter, '0');
	});

	it('should allow a user to exchange the synths they hold in one flavour for another', async function() {
		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('300000'), { from: owner });
		// Issue
		const amountIssued = toUnit('2000');
		await synthetix.issueSynths(sUSD, amountIssued, { from: account1 });

		// Exchange sUSD to sAUD
		await synthetix.exchange(sUSD, amountIssued, sAUD, account1, { from: account1 });

		// how much sAUD the user is supposed to get
		const effectiveValue = await synthetix.effectiveValue(sUSD, amountIssued, sAUD);

		// chargeFee = true so we need to minus the fees for this exchange
		const effectiveValueMinusFees = await feePool.amountReceivedFromExchange(effectiveValue);

		const sAUDBalance = await sAUDContract.balanceOf(account1);
		assert.bnEqual(effectiveValueMinusFees, sAUDBalance);
	});

	it('should emit a SynthExchange event', async function() {
		// Give some SNX to account1
		await synthetix.transfer(account1, toUnit('300000'), { from: owner });
		// Issue
		const amountIssued = toUnit('2000');
		await synthetix.issueSynths(sUSD, amountIssued, { from: account1 });

		// Exchange sUSD to sAUD
		const txn = await synthetix.exchange(sUSD, amountIssued, sAUD, account1, {
			from: account1,
		});

		const sAUDBalance = await sAUDContract.balanceOf(account1);

		const synthExchangeEvent = txn.logs.find(log => log.event === 'SynthExchange');
		assert.eventEqual(synthExchangeEvent, 'SynthExchange', {
			account: account1,
			fromCurrencyKey: sUSD,
			fromAmount: amountIssued,
			toCurrencyKey: sAUD,
			toAmount: sAUDBalance,
			toAddress: account1,
		});
	});

	// TODO: Changes in exchange rates tests
	// TODO: Are we testing too much Synth functionality here in Synthetix

	it('should revert if sender tries to issue synths with 0 amount', async function() {
		// Issue 0 amount of synth
		const issuedSynths1 = toUnit('0');

		await assert.revert(synthetix.issueSynths(sUSD, issuedSynths1, { from: account1 }));
	});
});
