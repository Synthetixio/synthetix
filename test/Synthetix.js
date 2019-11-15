const ExchangeRates = artifacts.require('ExchangeRates');
const Escrow = artifacts.require('SynthetixEscrow');
const RewardEscrow = artifacts.require('RewardEscrow');
const RewardsDistribution = artifacts.require('RewardsDistribution');
const FeePool = artifacts.require('FeePool');
const SupplySchedule = artifacts.require('SupplySchedule');
const Synthetix = artifacts.require('Synthetix');
const SynthetixState = artifacts.require('SynthetixState');
const Synth = artifacts.require('Synth');

const {
	currentTime,
	fastForward,
	fastForwardTo,
	multiplyDecimal,
	divideDecimal,
	toUnit,
	ZERO_ADDRESS,
	bytesToString,
} = require('../utils/testUtils');

contract('Synthetix', async accounts => {
	const [sUSD, sAUD, sEUR, SNX, XDR, sXYZ123, sBTC, iBTC] = [
		'sUSD',
		'sAUD',
		'sEUR',
		'SNX',
		'XDR',
		'sXYZ123',
		'sBTC',
		'iBTC',
	].map(web3.utils.asciiToHex);

	const [
		deployerAccount,
		owner,
		account1,
		account2,
		account3,
		account4,
		account5,
		account6,
		account7,
		account8,
	] = accounts;

	let synthetix,
		synthetixState,
		exchangeRates,
		feePool,
		supplySchedule,
		sUSDContract,
		sAUDContract,
		sBTCContract,
		escrow,
		rewardEscrow,
		rewardsDistribution,
		sEURContract,
		oracle,
		gasLimitOracle,
		timestamp;

	// Updates rates with defaults so they're not stale.
	const updateRatesWithDefaults = async () => {
		const timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX, sBTC, iBTC],
			['0.5', '1.25', '0.1', '5000', '4000'].map(toUnit),
			timestamp,
			{
				from: oracle,
			}
		);
	};

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		exchangeRates = await ExchangeRates.deployed();
		feePool = await FeePool.deployed();
		supplySchedule = await SupplySchedule.deployed();
		escrow = await Escrow.deployed();
		rewardEscrow = await RewardEscrow.deployed();
		rewardsDistribution = await RewardsDistribution.deployed();

		synthetix = await Synthetix.deployed();
		synthetixState = await SynthetixState.at(await synthetix.synthetixState());
		sUSDContract = await Synth.at(await synthetix.synths(sUSD));
		sAUDContract = await Synth.at(await synthetix.synths(sAUD));
		sEURContract = await Synth.at(await synthetix.synths(sEUR));
		sBTCContract = await Synth.at(await synthetix.synths(sBTC));

		// Send a price update to guarantee we're not stale.
		oracle = await exchangeRates.oracle();
		timestamp = await currentTime();

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX, sBTC, iBTC],
			['0.5', '1.25', '0.1', '5000', '4000'].map(toUnit),
			timestamp,
			{
				from: oracle,
			}
		);

		// Load the gasLimitOracle address
		gasLimitOracle = await synthetix.gasLimitOracle();
	});

	it('should set constructor params on deployment', async () => {
		// constructor(address _proxy, TokenState _tokenState, SynthetixState _synthetixState,
		// 	address _owner, IExchangeRates _exchangeRates, IFeePool _feePool, SupplySchedule _supplySchedule,
		// 	ISynthetixEscrow _rewardEscrow, ISynthetixEscrow _escrow, IRewardsDistribution _rewardsDistribution, uint _totalSupply
		// )
		const SYNTHETIX_TOTAL_SUPPLY = web3.utils.toWei('100000000');
		const instance = await Synthetix.new(
			account1,
			account2,
			account3,
			owner,
			account4,
			account5,
			account6,
			account7,
			account8,
			rewardsDistribution.address,
			SYNTHETIX_TOTAL_SUPPLY,
			{
				from: deployerAccount,
			}
		);

		assert.equal(await instance.proxy(), account1);
		assert.equal(await instance.tokenState(), account2);
		assert.equal(await instance.synthetixState(), account3);
		assert.equal(await instance.owner(), owner);
		assert.equal(await instance.exchangeRates(), account4);
		assert.equal(await instance.feePool(), account5);
		assert.equal(await instance.supplySchedule(), account6);
		assert.equal(await instance.rewardEscrow(), account7);
		assert.equal(await instance.escrow(), account8);
		assert.equal(await instance.rewardsDistribution(), rewardsDistribution.address);
		assert.equal(await instance.totalSupply(), SYNTHETIX_TOTAL_SUPPLY);
	});

	it('should set constructor params on upgrade to new totalSupply', async () => {
		// constructor(address _proxy, TokenState _tokenState, SynthetixState _synthetixState,
		// 	address _owner, IExchangeRates _exchangeRates, IFeePool _feePool, SupplySchedule _supplySchedule,
		// 	ISynthetixEscrow _rewardEscrow, ISynthetixEscrow _escrow, uint _totalSupply
		// )
		const YEAR_2_SYNTHETIX_TOTAL_SUPPLY = web3.utils.toWei('175000000');
		const instance = await Synthetix.new(
			account1,
			account2,
			account3,
			owner,
			account4,
			account5,
			account6,
			account7,
			account8,
			rewardsDistribution.address,
			YEAR_2_SYNTHETIX_TOTAL_SUPPLY,
			{
				from: deployerAccount,
			}
		);

		assert.equal(await instance.proxy(), account1);
		assert.equal(await instance.tokenState(), account2);
		assert.equal(await instance.synthetixState(), account3);
		assert.equal(await instance.owner(), owner);
		assert.equal(await instance.exchangeRates(), account4);
		assert.equal(await instance.feePool(), account5);
		assert.equal(await instance.supplySchedule(), account6);
		assert.equal(await instance.rewardEscrow(), account7);
		assert.equal(await instance.escrow(), account8);
		assert.equal(await instance.rewardsDistribution(), rewardsDistribution.address);
		assert.equal(await instance.totalSupply(), YEAR_2_SYNTHETIX_TOTAL_SUPPLY);
	});

	it('should allow adding a Synth contract', async () => {
		const previousSynthCount = await synthetix.availableSynthCount();

		const synth = await Synth.new(
			account1,
			account2,
			Synthetix.address,
			FeePool.address,
			'Synth XYZ123',
			'sXYZ123',
			owner,
			web3.utils.asciiToHex('sXYZ123'),
			web3.utils.toWei('0'), // _totalSupply
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
		assert.equal(await synthetix.synths(web3.utils.asciiToHex('sXYZ123')), synth.address);
	});

	it('should disallow adding a Synth contract when the user is not the owner', async () => {
		const synth = await Synth.new(
			account1,
			account2,
			Synthetix.address,
			FeePool.address,
			'Synth XYZ123',
			'sXYZ123',
			owner,
			web3.utils.asciiToHex('sXYZ123'),
			web3.utils.toWei('0'),
			{ from: deployerAccount }
		);

		await assert.revert(synthetix.addSynth(synth.address, { from: account1 }));
	});

	it('should disallow double adding a Synth contract with the same address', async () => {
		const synth = await Synth.new(
			account1,
			account2,
			Synthetix.address,
			FeePool.address,
			'Synth XYZ123',
			'sXYZ123',
			owner,
			web3.utils.asciiToHex('sXYZ123'),
			web3.utils.toWei('0'),
			{ from: deployerAccount }
		);

		await synthetix.addSynth(synth.address, { from: owner });
		await assert.revert(synthetix.addSynth(synth.address, { from: owner }));
	});

	it('should disallow double adding a Synth contract with the same currencyKey', async () => {
		const synth1 = await Synth.new(
			account1,
			account2,
			Synthetix.address,
			FeePool.address,
			'Synth XYZ123',
			'sXYZ123',
			owner,
			web3.utils.asciiToHex('sXYZ123'),
			web3.utils.toWei('0'),
			{ from: deployerAccount }
		);

		const synth2 = await Synth.new(
			account1,
			account2,
			Synthetix.address,
			FeePool.address,
			'Synth XYZ123',
			'sXYZ123',
			owner,
			web3.utils.asciiToHex('sXYZ123'),
			web3.utils.toWei('0'),
			{ from: deployerAccount }
		);

		await synthetix.addSynth(synth1.address, { from: owner });
		await assert.revert(synthetix.addSynth(synth2.address, { from: owner }));
	});

	it('should allow removing a Synth contract when it has no issued balance', async () => {
		// Note: This test depends on state in the migration script, that there are hooked up synths
		// without balances and we just remove one.
		const currencyKey = sAUD;
		const synthCount = await synthetix.availableSynthCount();

		assert.notEqual(await synthetix.synths(currencyKey), ZERO_ADDRESS);

		await synthetix.removeSynth(currencyKey, { from: owner });

		// Assert that we have one less synth, and that the specific currency key is gone.
		assert.bnEqual(await synthetix.availableSynthCount(), synthCount.sub(web3.utils.toBN(1)));
		assert.equal(await synthetix.synths(currencyKey), ZERO_ADDRESS);

		// TODO: Check that an event was successfully fired ?
	});

	it('should reject removing the XDR Synth even when it has no issued balance', async () => {
		// Note: This test depends on state in the migration script, that there are hooked up synths
		// without balances and we just remove one.
		await assert.revert(synthetix.removeSynth(XDR, { from: owner }));
	});

	it('should disallow removing a Synth contract when it has an issued balance', async () => {
		// Note: This test depends on state in the migration script, that there are hooked up synths
		// without balances
		const sAUDContractAddress = await synthetix.synths(sAUD);

		// Assert that we can remove the synth and add it back in before we do anything.
		await synthetix.removeSynth(sAUD, { from: owner });
		await synthetix.addSynth(sAUDContractAddress, { from: owner });

		// Issue one sAUD
		await synthetix.issueSynths(sAUD, toUnit('1'), { from: owner });

		// Assert that we can't remove the synth now
		await assert.revert(synthetix.removeSynth(sAUD, { from: owner }));
	});

	it('should disallow removing a Synth contract when requested by a non-owner', async () => {
		// Note: This test depends on state in the migration script, that there are hooked up synths
		// without balances
		await assert.revert(synthetix.removeSynth(sEUR, { from: account1 }));
	});

	it('should revert when requesting to remove a non-existent synth', async () => {
		// Note: This test depends on state in the migration script, that there are hooked up synths
		// without balances
		const currencyKey = web3.utils.asciiToHex('NOPE');

		// Assert that we can't remove the synth
		await assert.revert(synthetix.removeSynth(currencyKey, { from: owner }));
	});

	// Effective value

	it('should correctly calculate an exchange rate in effectiveValue()', async () => {
		// Send a price update to guarantee we're not depending on values from outside this test.

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

	it('should error when relying on a stale exchange rate in effectiveValue()', async () => {
		// Send a price update so we know what time we started with.
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

	it('should revert when relying on a non-existant exchange rate in effectiveValue()', async () => {
		// Send a price update so we know what time we started with.

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		await assert.revert(synthetix.effectiveValue(SNX, toUnit('10'), web3.utils.asciiToHex('XYZ')));
	});

	// totalIssuedSynths

	it('should correctly calculate the total issued synths in a single currency', async () => {
		// Two people issue 10 sUSD each. Assert that total issued value is 20 sUSD.

		// Send a price update to guarantee we're not depending on values from outside this test.

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1 and account2
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('1000'), { from: owner });
		await synthetix.methods['transfer(address,uint256)'](account2, toUnit('1000'), { from: owner });

		// Issue 10 sUSD each
		await synthetix.issueSynths(sUSD, toUnit('10'), { from: account1 });
		await synthetix.issueSynths(sUSD, toUnit('10'), { from: account2 });

		// Assert that there's 20 sUSD of value in the system
		assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('20'));
	});

	it('should correctly calculate the total issued synths in multiple currencies', async () => {
		// Alice issues 10 sUSD. Bob issues 20 sAUD. Assert that total issued value is 20 sUSD, and 40 sAUD.

		// Send a price update to guarantee we're not depending on values from outside this test.

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1 and account2
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('1000'), { from: owner });
		await synthetix.methods['transfer(address,uint256)'](account2, toUnit('1000'), { from: owner });

		// Issue 10 sUSD each
		await synthetix.issueSynths(sUSD, toUnit('10'), { from: account1 });
		await synthetix.issueSynths(sAUD, toUnit('20'), { from: account2 });

		// Assert that there's 20 sUSD of value in the system
		assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('20'));

		// And that there's 40 sAUD of value in the system
		assert.bnEqual(await synthetix.totalIssuedSynths(sAUD), toUnit('40'));
	});

	it('should return the correct value for the different quantity of total issued synths', async () => {
		// Send a price update to guarantee we're not depending on values from outside this test.

		const rates = ['0.5', '1.25', '0.1'].map(toUnit);

		await exchangeRates.updateRates([sAUD, sEUR, SNX], rates, timestamp, { from: oracle });

		// const snx2usdRate = await exchangeRates.rateForCurrency(SNX);
		const aud2usdRate = await exchangeRates.rateForCurrency(sAUD);
		const eur2usdRate = await exchangeRates.rateForCurrency(sEUR);
		const eur2audRate = divideDecimal(eur2usdRate, aud2usdRate);
		const usd2audRate = divideDecimal(toUnit('1'), aud2usdRate);

		// Give some SNX to account1 and account2
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('100000'), {
			from: owner,
		});
		await synthetix.methods['transfer(address,uint256)'](account2, toUnit('100000'), {
			from: owner,
		});

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

	it('should not allow checking total issued synths when a rate other than the priced currency is stale', async () => {
		await fastForward((await exchangeRates.rateStalePeriod()).add(web3.utils.toBN('300')));

		await exchangeRates.updateRates([SNX, sAUD], ['0.1', '0.78'].map(toUnit), timestamp, {
			from: oracle,
		});
		await assert.revert(synthetix.totalIssuedSynths(sAUD));
	});

	it('should not allow checking total issued synths when the priced currency is stale', async () => {
		await fastForward((await exchangeRates.rateStalePeriod()).add(web3.utils.toBN('300')));

		await exchangeRates.updateRates([SNX, sEUR], ['0.1', '1.25'].map(toUnit), timestamp, {
			from: oracle,
		});
		await assert.revert(synthetix.totalIssuedSynths(sAUD));
	});

	// transfer

	it('should transfer using the ERC20 transfer function', async () => {
		// Ensure our environment is set up correctly for our assumptions
		// e.g. owner owns all SNX.

		assert.bnEqual(await synthetix.totalSupply(), await synthetix.balanceOf(owner));

		const transaction = await synthetix.methods['transfer(address,uint256)'](
			account1,
			toUnit('10'),
			{ from: owner }
		);
		assert.eventEqual(transaction, 'Transfer', {
			from: owner,
			to: account1,
			value: toUnit('10'),
		});

		assert.bnEqual(await synthetix.balanceOf(account1), toUnit('10'));
	});

	it('should revert when exceeding locked synthetix and calling the ERC20 transfer function', async () => {
		// Ensure our environment is set up correctly for our assumptions
		// e.g. owner owns all SNX.
		assert.bnEqual(await synthetix.totalSupply(), await synthetix.balanceOf(owner));

		// Issue max synths.
		await synthetix.issueMaxSynths(sUSD, { from: owner });

		// Try to transfer 0.000000000000000001 SNX
		await assert.revert(
			synthetix.methods['transfer(address,uint256)'](account1, '1', { from: owner })
		);
	});

	it('should transfer using the ERC20 transferFrom function', async () => {
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
		transaction = await synthetix.methods['transferFrom(address,address,uint256)'](
			owner,
			account2,
			toUnit('10'),
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
		await assert.revert(
			synthetix.methods['transferFrom(address,address,uint256)'](owner, account2, '1', {
				from: account1,
			})
		);
	});

	it('should revert when exceeding locked synthetix and calling the ERC20 transferFrom function', async () => {
		// Ensure our environment is set up correctly for our assumptions
		// e.g. owner owns all SNX.
		assert.bnEqual(await synthetix.totalSupply(), await synthetix.balanceOf(owner));

		// Send a price update to guarantee we're not depending on values from outside this test.

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Approve account1 to act on our behalf for 10 SNX.
		const transaction = await synthetix.approve(account1, toUnit('10'), { from: owner });
		assert.eventEqual(transaction, 'Approval', {
			owner,
			spender: account1,
			value: toUnit('10'),
		});

		// Issue max synths
		await synthetix.issueMaxSynths(sUSD, { from: owner });

		// Assert that transferFrom fails even for the smallest amount of SNX.
		await assert.revert(
			synthetix.methods['transferFrom(address,address,uint256)'](owner, account2, '1', {
				from: account1,
			})
		);
	});

	it('should transfer using the ERC223 transfer function', async () => {
		// Ensure our environment is set up correctly for our assumptions
		// e.g. owner owns all SNX.
		assert.bnEqual(await synthetix.totalSupply(), await synthetix.balanceOf(owner));

		const transaction = await synthetix.methods['transfer(address,uint256,bytes)'](
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

	it('should revert when exceeding locked synthetix and calling the ERC223 transfer function', async () => {
		// Ensure our environment is set up correctly for our assumptions
		// e.g. owner owns all SNX.
		assert.bnEqual(await synthetix.totalSupply(), await synthetix.balanceOf(owner));

		// Issue max synths.
		await synthetix.issueMaxSynths(sUSD, { from: owner });

		// Try to transfer 0.000000000000000001 SNX
		await assert.revert(
			synthetix.methods['transfer(address,uint256,bytes)'](
				account1,
				'1',
				web3.utils.asciiToHex('This is a memo'),
				{ from: owner }
			)
		);
	});

	it('should not allow transfer if the exchange rate for synthetix is stale', async () => {
		// Give some SNX to account1 & account2
		const value = toUnit('300');
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('10000'), {
			from: owner,
		});
		await synthetix.methods['transfer(address,uint256)'](account2, toUnit('10000'), {
			from: owner,
		});

		// Ensure that we can do a successful transfer before rates go stale
		await synthetix.methods['transfer(address,uint256)'](account2, value, { from: account1 });
		const data = web3.utils.asciiToHex('This is a memo');
		await synthetix.methods['transfer(address,uint256,bytes)'](account2, value, data, {
			from: account1,
		});

		await synthetix.approve(account3, value, { from: account2 });
		await synthetix.methods['transferFrom(address,address,uint256)'](account2, account1, value, {
			from: account3,
		});
		await synthetix.approve(account3, value, { from: account2 });
		await synthetix.methods['transferFrom(address,address,uint256,bytes)'](
			account2,
			account1,
			value,
			data,
			{ from: account3 }
		);

		// Now jump forward in time so the rates are stale
		await fastForward((await exchangeRates.rateStalePeriod()) + 1);

		// Send a price update to guarantee we're not depending on values from outside this test.

		await exchangeRates.updateRates([sAUD, sEUR], ['0.5', '1.25'].map(toUnit), timestamp, {
			from: oracle,
		});

		// Subsequent transfers fail
		await assert.revert(
			synthetix.methods['transfer(address,uint256)'](account2, value, { from: account1 })
		);
		await assert.revert(
			synthetix.methods['transfer(address,uint256,bytes)'](account2, value, data),
			{
				from: account1,
			}
		);

		await synthetix.approve(account3, value, { from: account2 });
		await assert.revert(
			synthetix.methods['transferFrom(address,address,uint256)'](account2, account1, value, {
				from: account3,
			})
		);
		await assert.revert(
			synthetix.methods['transferFrom(address,address,uint256,bytes)'](
				account2,
				account1,
				value,
				data,
				{ from: account3 }
			)
		);
	});

	it('should not allow transfer of synthetix in escrow', async () => {
		// Setup escrow
		const oneWeek = 60 * 60 * 24 * 7;
		const twelveWeeks = oneWeek * 12;
		const now = await currentTime();
		const escrowedSynthetixs = toUnit('30000');
		await synthetix.methods['transfer(address,uint256)'](escrow.address, escrowedSynthetixs, {
			from: owner,
		});
		await escrow.appendVestingEntry(
			account1,
			web3.utils.toBN(now + twelveWeeks),
			escrowedSynthetixs,
			{
				from: owner,
			}
		);

		// Ensure the transfer fails as all the synthetix are in escrow
		await assert.revert(
			synthetix.methods['transfer(address,uint256)'](account2, toUnit('100'), { from: account1 })
		);
	});

	it('should transfer using the ERC223 transferFrom function', async () => {
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
		transaction = await synthetix.methods['transferFrom(address,address,uint256,bytes)'](
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
		await assert.revert(
			synthetix.methods['transferFrom(address,address,uint256)'](owner, account2, '1', {
				from: account1,
			})
		);
	});

	it('should revert when exceeding locked synthetix and calling the ERC223 transferFrom function', async () => {
		// Ensure our environment is set up correctly for our assumptions
		// e.g. owner owns all SNX.
		assert.bnEqual(await synthetix.totalSupply(), await synthetix.balanceOf(owner));

		// Send a price update to guarantee we're not depending on values from outside this test.

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Approve account1 to act on our behalf for 10 SNX.
		const transaction = await synthetix.approve(account1, toUnit('10'), { from: owner });
		assert.eventEqual(transaction, 'Approval', {
			owner,
			spender: account1,
			value: toUnit('10'),
		});

		// Issue max synths
		await synthetix.issueMaxSynths(sUSD, { from: owner });

		// Assert that transferFrom fails even for the smallest amount of SNX.
		await assert.revert(
			synthetix.methods['transferFrom(address,address,uint256,bytes)'](
				owner,
				account2,
				'1',
				web3.utils.asciiToHex('This is a memo'),
				{
					from: account1,
				}
			)
		);
	});

	// Issuance

	it('Issuing too small an amount of synths should revert', async () => {
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('1000'), { from: owner });

		// Note: The amount will likely be rounded to 0 in the debt register. This will revert.
		// The exact amount depends on the Synth exchange rate and the total supply.
		await assert.revert(synthetix.issueSynths(sAUD, web3.utils.toBN('1'), { from: account1 }));
	});

	it('should allow the issuance of a small amount of synths', async () => {
		// Give some SNX to account1
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('1000'), { from: owner });

		// account1 should be able to issue
		// Note: If a too small amount of synths are issued here, the amount may be
		// rounded to 0 in the debt register. This will revert. As such, there is a minimum
		// number of synths that need to be issued each time issue is invoked. The exact
		// amount depends on the Synth exchange rate and the total supply.
		await synthetix.issueSynths(sAUD, web3.utils.toBN('5'), { from: account1 });
	});

	it('should be possible to issue the maximum amount of synths via issueSynths', async () => {
		// Give some SNX to account1
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('1000'), { from: owner });

		const maxSynths = await synthetix.maxIssuableSynths(account1, sUSD);

		// account1 should be able to issue
		await synthetix.issueSynths(sUSD, maxSynths, { from: account1 });
	});

	it('should allow an issuer to issue synths in one flavour', async () => {
		// Send a price update to guarantee we're not depending on values from outside this test.

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('1000'), { from: owner });

		// account1 should be able to issue
		await synthetix.issueSynths(sUSD, toUnit('10'), { from: account1 });

		// There should be 10 sUSD of value in the system
		assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('10'));

		// And account1 should own 100% of the debt.
		assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('10'));
		assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('10'));
	});

	it('should allow an issuer to issue synths in multiple flavours', async () => {
		// Send a price update to guarantee we're not depending on values from outside this test.

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('1000'), { from: owner });

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
	it('should allow two issuers to issue synths in one flavour', async () => {
		// Send a price update to guarantee we're not depending on values from outside this test.

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1 and account2
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('10000'), {
			from: owner,
		});
		await synthetix.methods['transfer(address,uint256)'](account2, toUnit('10000'), {
			from: owner,
		});

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

	it('should allow multi-issuance in one flavour', async () => {
		// Send a price update to guarantee we're not depending on values from outside this test.

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1 and account2
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('10000'), {
			from: owner,
		});
		await synthetix.methods['transfer(address,uint256)'](account2, toUnit('10000'), {
			from: owner,
		});

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

	it('should allow multiple issuers to issue synths in multiple flavours', async () => {
		// Send a price update to guarantee we're not depending on values from outside this test.

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1 and account2
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('10000'), {
			from: owner,
		});
		await synthetix.methods['transfer(address,uint256)'](account2, toUnit('10000'), {
			from: owner,
		});

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

	it('should allow an issuer to issue max synths in one flavour', async () => {
		// Send a price update to guarantee we're not depending on values from outside this test.

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('10000'), {
			from: owner,
		});

		// Issue
		await synthetix.issueMaxSynths(sUSD, { from: account1 });

		// There should be 200 sUSD of value in the system
		assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('200'));

		// And account1 should own all of it.
		assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('200'));
	});

	it('should allow an issuer to issue max synths via the standard issue call', async () => {
		// Send a price update to guarantee we're not depending on values from outside this test.

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('10000'), {
			from: owner,
		});

		// Determine maximum amount that can be issued.
		const maxIssuable = await synthetix.maxIssuableSynths(account1, sUSD);

		// Issue
		await synthetix.issueSynths(sUSD, maxIssuable, { from: account1 });

		// There should be 200 sUSD of value in the system
		assert.bnEqual(await synthetix.totalIssuedSynths(sUSD), toUnit('200'));

		// And account1 should own all of it.
		assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('200'));
	});

	it('should disallow an issuer from issuing synths in a non-existant flavour', async () => {
		// Send a price update to guarantee we're not depending on values from outside this test.

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('10000'), {
			from: owner,
		});

		// They should now be able to issue sUSD
		await synthetix.issueSynths(sUSD, toUnit('10'), { from: account1 });

		// But should not be able to issue sXYZ123 because it doesn't exist
		await assert.revert(synthetix.issueSynths(sXYZ123, toUnit('10')));
	});

	it('should disallow an issuer from issuing synths beyond their remainingIssuableSynths', async () => {
		// Send a price update to guarantee we're not depending on values from outside this test.

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('10000'), {
			from: owner,
		});

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

	it('should allow an issuer with outstanding debt to burn synths and decrease debt', async () => {
		// Send a price update to guarantee we're not depending on values from outside this test.

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('10000'), {
			from: owner,
		});

		// Issue
		await synthetix.issueMaxSynths(sUSD, { from: account1 });

		// account1 should now have 200 sUSD of debt.
		assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('200'));

		// Burn 100 sUSD
		await synthetix.burnSynths(sUSD, toUnit('100'), { from: account1 });

		// account1 should now have 100 sUSD of debt.
		assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('100'));
	});

	it('should disallow an issuer without outstanding debt from burning synths', async () => {
		// Send a price update to guarantee we're not depending on values from outside this test.
		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('10000'), {
			from: owner,
		});

		// Issue
		await synthetix.issueMaxSynths(sUSD, { from: account1 });

		// account2 should not have anything and can't burn.
		await assert.revert(synthetix.burnSynths(sUSD, toUnit('10'), { from: account2 }));

		// And even when we give account2 synths, it should not be able to burn.
		await sUSDContract.methods['transfer(address,uint256)'](account2, toUnit('100'), {
			from: account1,
		});
		await assert.revert(synthetix.burnSynths(sUSD, toUnit('10'), { from: account2 }));
	});

	it('should fail when trying to burn synths that do not exist', async () => {
		// Send a price update to guarantee we're not depending on values from outside this test.

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('10000'), {
			from: owner,
		});

		// Issue
		await synthetix.issueMaxSynths(sUSD, { from: account1 });

		// Transfer all newly issued synths to account2
		await sUSDContract.methods['transfer(address,uint256)'](account2, toUnit('200'), {
			from: account1,
		});

		// Burning any amount of sUSD from account1 should fail
		await assert.revert(synthetix.burnSynths(sUSD, '1', { from: account1 }));
	});

	it("should only burn up to a user's actual debt level", async () => {
		// Send a price update to guarantee we're not depending on values from outside this test.

		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// Give some SNX to account1
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('10000'), {
			from: owner,
		});
		await synthetix.methods['transfer(address,uint256)'](account2, toUnit('10000'), {
			from: owner,
		});

		// Issue
		const fullAmount = toUnit('210');
		const account1Payment = toUnit('10');
		const account2Payment = fullAmount.sub(account1Payment);
		await synthetix.issueSynths(sUSD, account1Payment, { from: account1 });
		await synthetix.issueSynths(sUSD, account2Payment, { from: account2 });

		// Transfer all of account2's synths to account1
		await sUSDContract.methods['transfer(address,uint256)'](account1, toUnit('200'), {
			from: account2,
		});
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

	it('should correctly calculate debt in a multi-issuance scenario', async () => {
		// Give some SNX to account1
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('200000'), {
			from: owner,
		});
		await synthetix.methods['transfer(address,uint256)'](account2, toUnit('200000'), {
			from: owner,
		});

		// Issue
		const issuedSynthsPt1 = toUnit('2000');
		const issuedSynthsPt2 = toUnit('2000');
		await synthetix.issueSynths(sUSD, issuedSynthsPt1, { from: account1 });
		await synthetix.issueSynths(sUSD, issuedSynthsPt2, { from: account1 });
		await synthetix.issueSynths(sUSD, toUnit('1000'), { from: account2 });

		const debt = await synthetix.debtBalanceOf(account1, sUSD);
		assert.bnClose(debt, toUnit('4000'));
	});

	it('should correctly calculate debt in a multi-issuance multi-burn scenario', async () => {
		// Give some SNX to account1
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('500000'), {
			from: owner,
		});
		await synthetix.methods['transfer(address,uint256)'](account2, toUnit('14000'), {
			from: owner,
		});

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

	it("should allow me to burn all synths I've issued when there are other issuers", async () => {
		const totalSupply = await synthetix.totalSupply();
		const account2Synthetixs = toUnit('120000');
		const account1Synthetixs = totalSupply.sub(account2Synthetixs);

		await synthetix.methods['transfer(address,uint256)'](account1, account1Synthetixs, {
			from: owner,
		}); // Issue the massive majority to account1
		await synthetix.methods['transfer(address,uint256)'](account2, account2Synthetixs, {
			from: owner,
		}); // Issue a small amount to account2

		// Issue from account1
		const account1AmountToIssue = await synthetix.maxIssuableSynths(account1, sUSD);
		await synthetix.issueMaxSynths(sUSD, { from: account1 });
		const debtBalance1 = await synthetix.debtBalanceOf(account1, sUSD);
		assert.bnClose(debtBalance1, account1AmountToIssue);

		// Issue and burn from account 2 all debt
		await synthetix.issueSynths(sUSD, toUnit('43'), { from: account2 });
		let debt = await synthetix.debtBalanceOf(account2, sUSD);
		await synthetix.burnSynths(sUSD, toUnit('43'), { from: account2 });
		debt = await synthetix.debtBalanceOf(account2, sUSD);

		assert.bnEqual(debt, 0);

		// Should set user issuanceData to 0 debtOwnership and retain debtEntryIndex of last action
		assert.deepEqual(await synthetixState.issuanceData(account2), {
			initialDebtOwnership: 0,
			debtEntryIndex: 2,
		});
	});

	// These tests take a long time to run
	// ****************************************

	it('should correctly calculate debt in a high issuance and burn scenario', async () => {
		const getRandomInt = (min, max) => {
			return min + Math.floor(Math.random() * Math.floor(max));
		};

		const totalSupply = await synthetix.totalSupply();
		const account2Synthetixs = toUnit('120000');
		const account1Synthetixs = totalSupply.sub(account2Synthetixs);

		await synthetix.methods['transfer(address,uint256)'](account1, account1Synthetixs, {
			from: owner,
		}); // Issue the massive majority to account1
		await synthetix.methods['transfer(address,uint256)'](account2, account2Synthetixs, {
			from: owner,
		}); // Issue a small amount to account2

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

	it('should correctly calculate debt in a high (random) issuance and burn scenario', async () => {
		const getRandomInt = (min, max) => {
			return min + Math.floor(Math.random() * Math.floor(max));
		};

		const totalSupply = await synthetix.totalSupply();
		const account2Synthetixs = toUnit('120000');
		const account1Synthetixs = totalSupply.sub(account2Synthetixs);

		await synthetix.methods['transfer(address,uint256)'](account1, account1Synthetixs, {
			from: owner,
		}); // Issue the massive majority to account1
		await synthetix.methods['transfer(address,uint256)'](account2, account2Synthetixs, {
			from: owner,
		}); // Issue a small amount to account2

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

	it('should correctly calculate debt in a high volume contrast issuance and burn scenario', async () => {
		const totalSupply = await synthetix.totalSupply();

		// Give only 100 Synthetix to account2
		const account2Synthetixs = toUnit('100');

		// Give the vast majority to account1 (ie. 99,999,900)
		const account1Synthetixs = totalSupply.sub(account2Synthetixs);

		await synthetix.methods['transfer(address,uint256)'](account1, account1Synthetixs, {
			from: owner,
		}); // Issue the massive majority to account1
		await synthetix.methods['transfer(address,uint256)'](account2, account2Synthetixs, {
			from: owner,
		}); // Issue a small amount to account2

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

	it('should not change debt balance if exchange rates change', async () => {
		let newAUDRate = toUnit('0.5');
		let timestamp = await currentTime();
		await exchangeRates.updateRates([sAUD], [newAUDRate], timestamp, { from: oracle });

		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('2000'), { from: owner });
		await synthetix.methods['transfer(address,uint256)'](account2, toUnit('2000'), { from: owner });

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

	it("should correctly calculate a user's maximum issuable synths without prior issuance", async () => {
		const rate = await exchangeRates.rateForCurrency(web3.utils.asciiToHex('SNX'));
		const issuedSynthetixs = web3.utils.toBN('200000');
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit(issuedSynthetixs), {
			from: owner,
		});
		const issuanceRatio = await synthetixState.issuanceRatio();

		const expectedIssuableSynths = multiplyDecimal(
			toUnit(issuedSynthetixs),
			multiplyDecimal(rate, issuanceRatio)
		);
		const maxIssuableSynths = await synthetix.maxIssuableSynths(account1, sUSD);

		assert.bnEqual(expectedIssuableSynths, maxIssuableSynths);
	});

	it("should correctly calculate a user's maximum issuable synths without any SNX", async () => {
		const maxIssuableSynths = await synthetix.maxIssuableSynths(account1, sEUR);
		assert.bnEqual(0, maxIssuableSynths);
	});

	it("should correctly calculate a user's maximum issuable synths with prior issuance", async () => {
		const snx2usdRate = await exchangeRates.rateForCurrency(SNX);
		const aud2usdRate = await exchangeRates.rateForCurrency(sAUD);
		const snx2audRate = divideDecimal(snx2usdRate, aud2usdRate);

		const issuedSynthetixs = web3.utils.toBN('320001');
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit(issuedSynthetixs), {
			from: owner,
		});

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

	it('should error when calculating maximum issuance when the SNX rate is stale', async () => {
		// Add stale period to the time to ensure we go stale.
		await fastForward((await exchangeRates.rateStalePeriod()) + 1);

		await exchangeRates.updateRates([sAUD, sEUR], ['0.5', '1.25'].map(toUnit), timestamp, {
			from: oracle,
		});

		await assert.revert(synthetix.maxIssuableSynths(account1, sAUD));
	});

	it('should error when calculating maximum issuance when the currency rate is stale', async () => {
		// Add stale period to the time to ensure we go stale.
		await fastForward((await exchangeRates.rateStalePeriod()) + 1);

		await exchangeRates.updateRates([sEUR, SNX], ['1.25', '0.12'].map(toUnit), timestamp, {
			from: oracle,
		});

		await assert.revert(synthetix.maxIssuableSynths(account1, sAUD));
	});

	it("should correctly calculate a user's debt balance without prior issuance", async () => {
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('200000'), {
			from: owner,
		});
		await synthetix.methods['transfer(address,uint256)'](account2, toUnit('10000'), {
			from: owner,
		});

		const debt1 = await synthetix.debtBalanceOf(account1, web3.utils.asciiToHex('sUSD'));
		const debt2 = await synthetix.debtBalanceOf(account2, web3.utils.asciiToHex('sUSD'));
		assert.bnEqual(debt1, 0);
		assert.bnEqual(debt2, 0);
	});

	it("should correctly calculate a user's debt balance with prior issuance", async () => {
		// Give some SNX to account1
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('200000'), {
			from: owner,
		});

		// Issue
		const issuedSynths = toUnit('1001');
		await synthetix.issueSynths(sUSD, issuedSynths, { from: account1 });

		const debt = await synthetix.debtBalanceOf(account1, web3.utils.asciiToHex('sUSD'));
		assert.bnEqual(debt, issuedSynths);
	});

	it("should correctly calculate a user's remaining issuable synths with prior issuance", async () => {
		const snx2usdRate = await exchangeRates.rateForCurrency(SNX);
		const eur2usdRate = await exchangeRates.rateForCurrency(sEUR);
		const snx2eurRate = divideDecimal(snx2usdRate, eur2usdRate);
		const issuanceRatio = await synthetixState.issuanceRatio();

		const issuedSynthetixs = web3.utils.toBN('200012');
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit(issuedSynthetixs), {
			from: owner,
		});

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

	it("should correctly calculate a user's remaining issuable synths without prior issuance", async () => {
		const snx2usdRate = await exchangeRates.rateForCurrency(SNX);
		const eur2usdRate = await exchangeRates.rateForCurrency(sEUR);
		const snx2eurRate = divideDecimal(snx2usdRate, eur2usdRate);
		const issuanceRatio = await synthetixState.issuanceRatio();

		const issuedSynthetixs = web3.utils.toBN('20');
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit(issuedSynthetixs), {
			from: owner,
		});

		const expectedIssuableSynths = multiplyDecimal(
			toUnit(issuedSynthetixs),
			multiplyDecimal(snx2eurRate, issuanceRatio)
		);

		const remainingIssuable = await synthetix.remainingIssuableSynths(account1, sEUR);
		assert.bnEqual(remainingIssuable, expectedIssuableSynths);
	});

	it('should not be possible to transfer locked synthetix', async () => {
		const issuedSynthetixs = web3.utils.toBN('200000');
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit(issuedSynthetixs), {
			from: owner,
		});

		// Issue
		const sEURIssued = toUnit('2000');
		await synthetix.issueSynths(sEUR, sEURIssued, { from: account1 });

		await assert.revert(
			synthetix.methods['transfer(address,uint256)'](account2, toUnit(issuedSynthetixs), {
				from: account1,
			})
		);
	});

	it("should lock synthetix if the user's collaterisation changes to be insufficient", async () => {
		// Set sEUR for purposes of this test
		const timestamp1 = await currentTime();
		await exchangeRates.updateRates([sEUR], [toUnit('0.75')], timestamp1, { from: oracle });

		const issuedSynthetixs = web3.utils.toBN('200000');
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit(issuedSynthetixs), {
			from: owner,
		});

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

	it("should lock newly received synthetix if the user's collaterisation is too high", async () => {
		// Set sEUR for purposes of this test
		const timestamp1 = await currentTime();
		await exchangeRates.updateRates([sEUR], [toUnit('0.75')], timestamp1, { from: oracle });

		const issuedSynthetixs = web3.utils.toBN('200000');
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit(issuedSynthetixs), {
			from: owner,
		});
		await synthetix.methods['transfer(address,uint256)'](account2, toUnit(issuedSynthetixs), {
			from: owner,
		});

		const maxIssuableSynths = await synthetix.maxIssuableSynths(account1, sEUR);

		// Issue
		await synthetix.issueSynths(sEUR, maxIssuableSynths, { from: account1 });

		// Ensure that we can transfer in and out of the account successfully
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('10000'), {
			from: account2,
		});
		await synthetix.methods['transfer(address,uint256)'](account2, toUnit('10000'), {
			from: account1,
		});

		// Increase the value of sEUR relative to synthetix
		const timestamp2 = await currentTime();
		await exchangeRates.updateRates([sEUR], [toUnit('2.10')], timestamp2, { from: oracle });

		// Ensure that the new synthetix account1 receives cannot be transferred out.
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('10000'), {
			from: account2,
		});
		await assert.revert(
			synthetix.methods['transfer(address,uint256)'](account2, toUnit('10000'), { from: account1 })
		);
	});

	it('should unlock synthetix when collaterisation ratio changes', async () => {
		// Set sAUD for purposes of this test
		const timestamp1 = await currentTime();
		await exchangeRates.updateRates([sAUD], [toUnit('1.7655')], timestamp1, { from: oracle });

		const issuedSynthetixs = web3.utils.toBN('200000');
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit(issuedSynthetixs), {
			from: owner,
		});

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

	it('should return 0 if user has no synthetix when checking the collaterisation ratio', async () => {
		const ratio = await synthetix.collateralisationRatio(account1);
		assert.bnEqual(ratio, new web3.utils.BN(0));
	});

	it('Any user can check the collaterisation ratio for a user', async () => {
		const issuedSynthetixs = web3.utils.toBN('320000');
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit(issuedSynthetixs), {
			from: owner,
		});

		// Issue
		const issuedSynths = toUnit(web3.utils.toBN('6400'));
		await synthetix.issueSynths(sAUD, issuedSynths, { from: account1 });

		await synthetix.collateralisationRatio(account1, { from: account2 });
	});

	it('should be able to read collaterisation ratio for a user with synthetix but no debt', async () => {
		const issuedSynthetixs = web3.utils.toBN('30000');
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit(issuedSynthetixs), {
			from: owner,
		});

		const ratio = await synthetix.collateralisationRatio(account1);
		assert.bnEqual(ratio, new web3.utils.BN(0));
	});

	it('should be able to read collaterisation ratio for a user with synthetix and debt', async () => {
		const issuedSynthetixs = web3.utils.toBN('320000');
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit(issuedSynthetixs), {
			from: owner,
		});

		// Issue
		const issuedSynths = toUnit(web3.utils.toBN('6400'));
		await synthetix.issueSynths(sAUD, issuedSynths, { from: account1 });

		const ratio = await synthetix.collateralisationRatio(account1, { from: account2 });
		assert.unitEqual(ratio, '0.1');
	});

	it("should include escrowed synthetix when calculating a user's collaterisation ratio", async () => {
		const snx2usdRate = await exchangeRates.rateForCurrency(SNX);
		const transferredSynthetixs = toUnit('60000');
		await synthetix.methods['transfer(address,uint256)'](account1, transferredSynthetixs, {
			from: owner,
		});

		// Setup escrow
		const oneWeek = 60 * 60 * 24 * 7;
		const twelveWeeks = oneWeek * 12;
		const now = await currentTime();
		const escrowedSynthetixs = toUnit('30000');
		await synthetix.methods['transfer(address,uint256)'](escrow.address, escrowedSynthetixs, {
			from: owner,
		});
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

	it("should include escrowed reward synthetix when calculating a user's collaterisation ratio", async () => {
		const snx2usdRate = await exchangeRates.rateForCurrency(SNX);
		const transferredSynthetixs = toUnit('60000');
		await synthetix.methods['transfer(address,uint256)'](account1, transferredSynthetixs, {
			from: owner,
		});

		// Setup reward escrow
		const feePoolAccount = account6;
		await rewardEscrow.setFeePool(feePoolAccount, { from: owner });

		const escrowedSynthetixs = toUnit('30000');
		await synthetix.methods['transfer(address,uint256)'](rewardEscrow.address, escrowedSynthetixs, {
			from: owner,
		});
		await rewardEscrow.appendVestingEntry(account1, escrowedSynthetixs, { from: feePoolAccount });

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

	it('should permit user to issue sUSD debt with only escrowed SNX as collateral (no SNX in wallet)', async () => {
		const oneWeek = 60 * 60 * 24 * 7;
		const twelveWeeks = oneWeek * 12;
		const now = await currentTime();

		// Send a price update to guarantee we're not depending on values from outside this test.
		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// ensure collateral of account1 is empty
		let collateral = await synthetix.collateral(account1, { from: account1 });
		assert.bnEqual(collateral, 0);

		// ensure account1 has no SNX balance
		const snxBalance = await synthetix.balanceOf(account1);
		assert.bnEqual(snxBalance, 0);

		// Append escrow amount to account1
		const escrowedAmount = toUnit('15000');
		await synthetix.methods['transfer(address,uint256)'](escrow.address, escrowedAmount, {
			from: owner,
		});
		await escrow.appendVestingEntry(account1, web3.utils.toBN(now + twelveWeeks), escrowedAmount, {
			from: owner,
		});

		// collateral should include escrowed amount
		collateral = await synthetix.collateral(account1, { from: account1 });
		assert.bnEqual(collateral, escrowedAmount);

		// Issue max synths. (300 sUSD)
		await synthetix.issueMaxSynths(sUSD, { from: account1 });

		// There should be 300 sUSD of value for account1
		assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('300'));
	});

	it('should permit user to issue sUSD debt with only reward escrow as collateral (no SNX in wallet)', async () => {
		// Setup reward escrow
		const feePoolAccount = account6;
		await rewardEscrow.setFeePool(feePoolAccount, { from: owner });

		// Send a price update to guarantee we're not depending on values from outside this test.
		await exchangeRates.updateRates(
			[sAUD, sEUR, SNX],
			['0.5', '1.25', '0.1'].map(toUnit),
			timestamp,
			{ from: oracle }
		);

		// ensure collateral of account1 is empty
		let collateral = await synthetix.collateral(account1, { from: account1 });
		assert.bnEqual(collateral, 0);

		// ensure account1 has no SNX balance
		const snxBalance = await synthetix.balanceOf(account1);
		assert.bnEqual(snxBalance, 0);

		// Append escrow amount to account1
		const escrowedAmount = toUnit('15000');
		await synthetix.methods['transfer(address,uint256)'](RewardEscrow.address, escrowedAmount, {
			from: owner,
		});
		await rewardEscrow.appendVestingEntry(account1, escrowedAmount, { from: feePoolAccount });

		// collateral now should include escrowed amount
		collateral = await synthetix.collateral(account1, { from: account1 });
		assert.bnEqual(collateral, escrowedAmount);

		// Issue max synths. (300 sUSD)
		await synthetix.issueMaxSynths(sUSD, { from: account1 });

		// There should be 300 sUSD of value for account1
		assert.bnEqual(await synthetix.debtBalanceOf(account1, sUSD), toUnit('300'));
	});

	it("should permit anyone checking another user's collateral", async () => {
		const amount = toUnit('60000');
		await synthetix.methods['transfer(address,uint256)'](account1, amount, { from: owner });
		const collateral = await synthetix.collateral(account1, { from: account2 });
		assert.bnEqual(collateral, amount);
	});

	it("should include escrowed synthetix when checking a user's collateral", async () => {
		const oneWeek = 60 * 60 * 24 * 7;
		const twelveWeeks = oneWeek * 12;
		const now = await currentTime();
		const escrowedAmount = toUnit('15000');
		await synthetix.methods['transfer(address,uint256)'](escrow.address, escrowedAmount, {
			from: owner,
		});
		await escrow.appendVestingEntry(account1, web3.utils.toBN(now + twelveWeeks), escrowedAmount, {
			from: owner,
		});

		const amount = toUnit('60000');
		await synthetix.methods['transfer(address,uint256)'](account1, amount, { from: owner });
		const collateral = await synthetix.collateral(account1, { from: account2 });
		assert.bnEqual(collateral, amount.add(escrowedAmount));
	});

	it("should include escrowed reward synthetix when checking a user's collateral", async () => {
		const feePoolAccount = account6;
		const escrowedAmount = toUnit('15000');
		await synthetix.methods['transfer(address,uint256)'](rewardEscrow.address, escrowedAmount, {
			from: owner,
		});
		await rewardEscrow.setFeePool(feePoolAccount, { from: owner });
		await rewardEscrow.appendVestingEntry(account1, escrowedAmount, { from: feePoolAccount });
		const amount = toUnit('60000');
		await synthetix.methods['transfer(address,uint256)'](account1, amount, { from: owner });
		const collateral = await synthetix.collateral(account1, { from: account2 });
		assert.bnEqual(collateral, amount.add(escrowedAmount));
	});

	// Stale rate check

	it('should allow anyone to check if any rates are stale', async () => {
		const instance = await ExchangeRates.deployed();
		const result = await instance.anyRateIsStale([sEUR, sAUD], { from: owner });
		assert.equal(result, false);
	});

	it("should calculate a user's remaining issuable synths", async () => {
		const transferredSynthetixs = toUnit('60000');
		await synthetix.methods['transfer(address,uint256)'](account1, transferredSynthetixs, {
			from: owner,
		});

		// Issue
		const maxIssuable = await synthetix.maxIssuableSynths(account1, sUSD);
		const issued = maxIssuable.div(web3.utils.toBN(3));
		await synthetix.issueSynths(sUSD, issued, { from: account1 });
		const expectedRemaining = maxIssuable.sub(issued);
		const remaining = await synthetix.remainingIssuableSynths(account1, sUSD);
		assert.bnEqual(expectedRemaining, remaining);
	});

	it("should disallow retrieving a user's remaining issuable synths if that synth doesn't exist", async () => {
		await assert.revert(synthetix.remainingIssuableSynths(account1, web3.utils.asciiToHex('BOG')));
	});

	it("should correctly calculate a user's max issuable synths with escrowed synthetix", async () => {
		const snx2usdRate = await exchangeRates.rateForCurrency(SNX);
		const transferredSynthetixs = toUnit('60000');
		await synthetix.methods['transfer(address,uint256)'](account1, transferredSynthetixs, {
			from: owner,
		});

		// Setup escrow
		const oneWeek = 60 * 60 * 24 * 7;
		const twelveWeeks = oneWeek * 12;
		const now = await currentTime();
		const escrowedSynthetixs = toUnit('30000');
		await synthetix.methods['transfer(address,uint256)'](escrow.address, escrowedSynthetixs, {
			from: owner,
		});
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

	it("should successfully burn all user's synths", async () => {
		// Send a price update to guarantee we're not depending on values from outside this test.

		await exchangeRates.updateRates([SNX], [toUnit('0.1')], timestamp, {
			from: oracle,
		});

		// Give some SNX to account1
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('10000'), {
			from: owner,
		});

		// Issue
		await synthetix.issueSynths(sUSD, toUnit('199'), { from: account1 });

		// Then try to burn them all. Only 10 synths (and fees) should be gone.
		await synthetix.burnSynths(sUSD, await sUSDContract.balanceOf(account1), { from: account1 });
		assert.bnEqual(await sUSDContract.balanceOf(account1), web3.utils.toBN(0));
	});

	it('should burn the correct amount of synths', async () => {
		// Send a price update to guarantee we're not depending on values from outside this test.

		await exchangeRates.updateRates([sAUD, SNX], ['0.9', '0.1'].map(toUnit), timestamp, {
			from: oracle,
		});

		// Give some SNX to account1
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('400000'), {
			from: owner,
		});

		// Issue
		await synthetix.issueSynths(sAUD, toUnit('3987'), { from: account1 });

		// Then try to burn some of them. There should be 3000 left.
		await synthetix.burnSynths(sAUD, toUnit('987'), { from: account1 });
		assert.bnEqual(await sAUDContract.balanceOf(account1), toUnit('3000'));
	});

	it("should successfully burn all user's synths even with transfer", async () => {
		// Send a price update to guarantee we're not depending on values from outside this test.

		await exchangeRates.updateRates([SNX], [toUnit('0.1')], timestamp, {
			from: oracle,
		});

		// Give some SNX to account1
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('300000'), {
			from: owner,
		});

		// Issue
		const amountIssued = toUnit('2000');
		await synthetix.issueSynths(sUSD, amountIssued, { from: account1 });

		// Transfer account1's synths to account2 and back
		const amountToTransfer = toUnit('1800');
		await sUSDContract.methods['transfer(address,uint256)'](account2, amountToTransfer, {
			from: account1,
		});
		const remainingAfterTransfer = await sUSDContract.balanceOf(account1);
		await sUSDContract.methods['transfer(address,uint256)'](
			account1,
			await sUSDContract.balanceOf(account2),
			{
				from: account2,
			}
		);

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

	it('should allow the last user in the system to burn all their synths to release their synthetix', async () => {
		// Give some SNX to account1
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('500000'), {
			from: owner,
		});
		await synthetix.methods['transfer(address,uint256)'](account2, toUnit('140000'), {
			from: owner,
		});
		await synthetix.methods['transfer(address,uint256)'](account3, toUnit('1400000'), {
			from: owner,
		});

		// Issue
		const issuedSynths1 = toUnit('2000');
		const issuedSynths2 = toUnit('2000');
		const issuedSynths3 = toUnit('2000');

		// Send more than their synth balance to burn all
		const burnAllSynths = toUnit('2050');

		await synthetix.issueSynths(sUSD, issuedSynths1, { from: account1 });
		await synthetix.issueSynths(sUSD, issuedSynths2, { from: account2 });
		await synthetix.issueSynths(sUSD, issuedSynths3, { from: account3 });

		await synthetix.burnSynths(sUSD, burnAllSynths, { from: account1 });
		await synthetix.burnSynths(sUSD, burnAllSynths, { from: account2 });
		await synthetix.burnSynths(sUSD, burnAllSynths, { from: account3 });

		const debtBalance1After = await synthetix.debtBalanceOf(account1, sUSD);
		const debtBalance2After = await synthetix.debtBalanceOf(account2, sUSD);
		const debtBalance3After = await synthetix.debtBalanceOf(account3, sUSD);

		assert.bnEqual(debtBalance1After, '0');
		assert.bnEqual(debtBalance2After, '0');
		assert.bnEqual(debtBalance3After, '0');
	});

	it('should allow user to burn all synths issued even after other users have issued', async () => {
		// Give some SNX to account1
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('500000'), {
			from: owner,
		});
		await synthetix.methods['transfer(address,uint256)'](account2, toUnit('140000'), {
			from: owner,
		});
		await synthetix.methods['transfer(address,uint256)'](account3, toUnit('1400000'), {
			from: owner,
		});

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

	it('should allow a user to burn up to their balance if they try too burn too much', async () => {
		// Give some SNX to account1
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('500000'), {
			from: owner,
		});

		// Issue
		const issuedSynths1 = toUnit('10');

		await synthetix.issueSynths(sUSD, issuedSynths1, { from: account1 });
		await synthetix.burnSynths(sUSD, issuedSynths1.add(toUnit('9000')), {
			from: account1,
		});
		const debtBalanceAfter = await synthetix.debtBalanceOf(account1, sUSD);

		assert.bnEqual(debtBalanceAfter, '0');
	});

	it('should allow users to burn their debt and adjust the debtBalanceOf correctly for remaining users', async () => {
		// Give some SNX to account1
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('40000000'), {
			from: owner,
		});
		await synthetix.methods['transfer(address,uint256)'](account2, toUnit('40000000'), {
			from: owner,
		});

		// Issue
		const issuedSynths1 = toUnit('150000');
		const issuedSynths2 = toUnit('50000');

		await synthetix.issueSynths(sUSD, issuedSynths1, { from: account1 });
		await synthetix.issueSynths(sUSD, issuedSynths2, { from: account2 });

		let debtBalance1After = await synthetix.debtBalanceOf(account1, sUSD);
		let debtBalance2After = await synthetix.debtBalanceOf(account2, sUSD);

		// debtBalanceOf has rounding error but is within tolerance
		assert.bnClose(debtBalance1After, toUnit('150000'));
		assert.bnClose(debtBalance2After, toUnit('50000'));

		// Account 1 burns 100,000
		await synthetix.burnSynths(sUSD, toUnit('100000'), { from: account1 });

		debtBalance1After = await synthetix.debtBalanceOf(account1, sUSD);
		debtBalance2After = await synthetix.debtBalanceOf(account2, sUSD);

		assert.bnClose(debtBalance1After, toUnit('50000'));
		assert.bnClose(debtBalance2After, toUnit('50000'));
	});

	it('should allow a user to exchange the synths they hold in one flavour for another', async () => {
		// Give some SNX to account1
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('300000'), {
			from: owner,
		});
		// Issue
		const amountIssued = toUnit('2000');
		await synthetix.issueSynths(sUSD, amountIssued, { from: account1 });

		// Get the exchange fee in USD
		const exchangeFeeUSD = await feePool.exchangeFeeIncurred(amountIssued);
		const exchangeFeeXDR = await synthetix.effectiveValue(sUSD, exchangeFeeUSD, XDR);

		// Exchange sUSD to sAUD
		await synthetix.exchange(sUSD, amountIssued, sAUD, { from: account1 });

		// how much sAUD the user is supposed to get
		const effectiveValue = await synthetix.effectiveValue(sUSD, amountIssued, sAUD);

		// chargeFee = true so we need to minus the fees for this exchange
		const effectiveValueMinusFees = await feePool.amountReceivedFromExchange(effectiveValue);

		// Assert we have the correct AUD value - exchange fee
		const sAUDBalance = await sAUDContract.balanceOf(account1);
		assert.bnEqual(effectiveValueMinusFees, sAUDBalance);

		// Assert we have the exchange fee to distribute
		const feePeriodZero = await feePool.recentFeePeriods(0);
		assert.bnEqual(exchangeFeeXDR, feePeriodZero.feesToDistribute);
	});

	it('should emit a SynthExchange event', async () => {
		// Give some SNX to account1
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('300000'), {
			from: owner,
		});
		// Issue
		const amountIssued = toUnit('2000');
		await synthetix.issueSynths(sUSD, amountIssued, { from: account1 });

		// Exchange sUSD to sAUD
		const txn = await synthetix.exchange(sUSD, amountIssued, sAUD, {
			from: account1,
		});

		const sAUDBalance = await sAUDContract.balanceOf(account1);

		const synthExchangeEvent = txn.logs.find(log => log.event === 'SynthExchange');
		assert.bytes32EventEqual(
			synthExchangeEvent,
			'SynthExchange',
			{
				account: account1,
				fromCurrencyKey: 'sUSD',
				fromAmount: amountIssued,
				toCurrencyKey: 'sAUD',
				toAmount: sAUDBalance,
				toAddress: account1,
			},
			['fromCurrencyKey', 'toCurrencyKey']
		);
	});

	it('should disallow non owners to call exchangeEnabled', async () => {
		await assert.revert(synthetix.setExchangeEnabled(false, { from: account1 }));
		await assert.revert(synthetix.setExchangeEnabled(false, { from: account2 }));
		await assert.revert(synthetix.setExchangeEnabled(false, { from: account3 }));
		await assert.revert(synthetix.setExchangeEnabled(false, { from: account4 }));
	});

	it('should only allow Owner to call exchangeEnabled', async () => {
		// Set false
		await synthetix.setExchangeEnabled(false, { from: owner });
		const exchangeEnabled = await synthetix.exchangeEnabled();
		assert.equal(exchangeEnabled, false);

		// Set true
		await synthetix.setExchangeEnabled(true, { from: owner });
		const exchangeEnabledTrue = await synthetix.exchangeEnabled();
		assert.equal(exchangeEnabledTrue, true);
	});

	it('should not exchange when exchangeEnabled is false', async () => {
		// Give some SNX to account1
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('300000'), {
			from: owner,
		});
		// Issue
		const amountIssued = toUnit('2000');
		await synthetix.issueSynths(sUSD, amountIssued, { from: account1 });

		// Disable exchange
		await synthetix.setExchangeEnabled(false, { from: owner });

		// Exchange sUSD to sAUD
		await assert.revert(synthetix.exchange(sUSD, amountIssued, sAUD, { from: account1 }));

		// Enable exchange
		await synthetix.setExchangeEnabled(true, { from: owner });

		// Exchange sUSD to sAUD
		const txn = await synthetix.exchange(sUSD, amountIssued, sAUD, { from: account1 });

		const sAUDBalance = await sAUDContract.balanceOf(account1);

		const synthExchangeEvent = txn.logs.find(log => log.event === 'SynthExchange');
		assert.bytes32EventEqual(
			synthExchangeEvent,
			'SynthExchange',
			{
				account: account1,
				fromCurrencyKey: 'sUSD',
				fromAmount: amountIssued,
				toCurrencyKey: 'sAUD',
				toAmount: sAUDBalance,
				toAddress: account1,
			},
			['fromCurrencyKey', 'toCurrencyKey']
		);
	});

	// TODO: Changes in exchange rates tests
	// TODO: Are we testing too much Synth functionality here in Synthetix

	it('should revert if sender tries to issue synths with 0 amount', async () => {
		// Issue 0 amount of synth
		const issuedSynths1 = toUnit('0');

		await assert.revert(synthetix.issueSynths(sUSD, issuedSynths1, { from: account1 }));
	});

	describe('supply minting', async () => {
		const [secondYearSupply, thirdYearSupply] = ['75000000', '37500000'];

		const DAY = 86400;
		const WEEK = 604800;
		const YEAR = 31536000;

		const YEAR_TWO_START = 1551830400;

		it('should allow synthetix contract to mint new supply based on inflationary schedule', async () => {
			// Issue
			const weeklyIssuance = divideDecimal(secondYearSupply, 52);
			const expectedSupplyToMint = weeklyIssuance;

			// fast forward EVM to Week 2 in Year 2 schedule starting at UNIX 1553040000+
			const weekTwo = YEAR_TWO_START + 1 * WEEK + 1 * DAY;
			await fastForwardTo(new Date(weekTwo * 1000));
			updateRatesWithDefaults();

			const existingSupply = await synthetix.totalSupply();
			const currentRewardEscrowBalance = await synthetix.balanceOf(RewardEscrow.address);

			// Call mint on Synthetix
			await synthetix.mint();

			const newTotalSupply = await synthetix.totalSupply();
			const minterReward = await supplySchedule.minterReward();
			const expectedEscrowBalance = currentRewardEscrowBalance
				.add(expectedSupplyToMint)
				.sub(minterReward);

			// Expect supply schedule is updated with new values
			const currentSchedule = await supplySchedule.schedules(1);

			assert.bnEqual(currentSchedule.totalSupplyMinted, expectedSupplyToMint);
			assert.bnEqual(newTotalSupply, existingSupply.add(expectedSupplyToMint));
			assert.bnEqual(await synthetix.balanceOf(RewardEscrow.address), expectedEscrowBalance);
		});

		it('should allow synthetix contract to mint 2 weeks of supply and minus minterReward', async () => {
			// Issue
			const expectedSupplyToMint = divideDecimal(secondYearSupply, 52 / 2);

			// fast forward EVM to Week 3 in Year 2 schedule starting at UNIX 1553040000+
			const weekThree = YEAR_TWO_START + 2 * WEEK + 1 * DAY;
			await fastForwardTo(new Date(weekThree * 1000));
			updateRatesWithDefaults();

			const existingSupply = await synthetix.totalSupply();
			const currentRewardEscrowBalance = await synthetix.balanceOf(RewardEscrow.address);

			// call mint on Synthetix
			await synthetix.mint();

			const newTotalSupply = await synthetix.totalSupply();
			const minterReward = await supplySchedule.minterReward();
			const expectedEscrowBalance = currentRewardEscrowBalance
				.add(expectedSupplyToMint)
				.sub(minterReward);

			// Expect supply schedule is updated with new values
			const currentSchedule = await supplySchedule.schedules(1);

			assert.bnEqual(currentSchedule.totalSupplyMinted, expectedSupplyToMint);
			assert.bnEqual(newTotalSupply, existingSupply.add(expectedSupplyToMint));
			assert.bnEqual(await synthetix.balanceOf(RewardEscrow.address), expectedEscrowBalance);
		});

		it('should allow synthetix contract to mint year 2 supply and 1 week in Year 3, minus minterReward', async () => {
			// Issue
			const supplyFromYear2 = toUnit(secondYearSupply);
			const supplyFromYear3 = divideDecimal(thirdYearSupply, 52);
			const expectedSupplyToMint = supplyFromYear2.add(supplyFromYear3);

			// fast forward EVM to Week 2 in Year 3 schedule starting at UNIX 1583971200+
			const weekTwoYearThree = YEAR_TWO_START + YEAR + WEEK + DAY;
			await fastForwardTo(new Date(weekTwoYearThree * 1000));
			updateRatesWithDefaults();

			const existingSupply = await synthetix.totalSupply();
			const currentRewardEscrowBalance = await synthetix.balanceOf(RewardEscrow.address);

			// call mint on Synthetix
			await synthetix.mint();

			const newTotalSupply = await synthetix.totalSupply();
			const minterReward = await supplySchedule.minterReward();
			const expectedEscrowBalance = currentRewardEscrowBalance
				.add(expectedSupplyToMint)
				.sub(minterReward);

			// Expect supply schedule is updated with new values
			const yearTwoSchedule = await supplySchedule.schedules(1);
			const yearThreeSchedule = await supplySchedule.schedules(2);

			assert.bnEqual(yearTwoSchedule.totalSupplyMinted, supplyFromYear2);
			assert.bnEqual(yearThreeSchedule.totalSupplyMinted, supplyFromYear3);
			assert.bnEqual(newTotalSupply, existingSupply.add(expectedSupplyToMint));
			assert.bnEqual(await synthetix.balanceOf(RewardEscrow.address), expectedEscrowBalance);
		});

		it('should be able to mint again after another 7 days period', async () => {
			// Issue
			const expectedSupplyToMint = divideDecimal(secondYearSupply, 52 / 2);

			// fast forward EVM to Week 3 in Year 2 schedule starting at UNIX 1553040000+
			const weekThree = YEAR_TWO_START + 2 * WEEK + 1 * DAY;
			await fastForwardTo(new Date(weekThree * 1000));
			updateRatesWithDefaults();

			let existingSupply, currentRewardEscrowBalance;
			existingSupply = await synthetix.totalSupply();
			currentRewardEscrowBalance = await synthetix.balanceOf(RewardEscrow.address);

			// call mint on Synthetix
			await synthetix.mint();

			let newTotalSupply, expectedEscrowBalance;
			const minterReward = await supplySchedule.minterReward();
			newTotalSupply = await synthetix.totalSupply();
			expectedEscrowBalance = currentRewardEscrowBalance
				.add(expectedSupplyToMint)
				.sub(minterReward);

			// Expect supply schedule is updated with new values
			const scheduleInWeekThree = await supplySchedule.schedules(1);

			assert.bnEqual(scheduleInWeekThree.totalSupplyMinted, expectedSupplyToMint);
			assert.bnEqual(newTotalSupply, existingSupply.add(expectedSupplyToMint));
			assert.bnEqual(await synthetix.balanceOf(RewardEscrow.address), expectedEscrowBalance);

			const supplyWeekFour = divideDecimal(secondYearSupply, 52);
			// fast forward EVM to Week 4 in Year 2 schedule starting at UNIX 1553644800+
			const weekFour = weekThree + 1 * WEEK + 1 * DAY;
			await fastForwardTo(new Date(weekFour * 1000));
			updateRatesWithDefaults();

			existingSupply = await synthetix.totalSupply();
			currentRewardEscrowBalance = await synthetix.balanceOf(RewardEscrow.address);

			// call mint on Synthetix
			await synthetix.mint();

			newTotalSupply = await synthetix.totalSupply();
			expectedEscrowBalance = currentRewardEscrowBalance.add(supplyWeekFour).sub(minterReward);

			// Expect supply schedule is updated with new values
			const scheduleInWeekFour = await supplySchedule.schedules(1);

			assert.bnEqual(
				scheduleInWeekFour.totalSupplyMinted,
				scheduleInWeekThree.totalSupplyMinted.add(supplyWeekFour)
			);
			assert.bnEqual(newTotalSupply, existingSupply.add(supplyWeekFour));
			assert.bnEqual(await synthetix.balanceOf(RewardEscrow.address), expectedEscrowBalance);
		});

		it('should revert when trying to mint again within the 7 days period', async () => {
			// Issue
			const weeklyIssuance = divideDecimal(secondYearSupply, 52 / 2);
			const expectedSupplyToMint = weeklyIssuance;

			// fast forward EVM to Week 3 in Year 2 schedule starting at UNIX 1553040000+
			const weekThree = YEAR_TWO_START + 2 * WEEK + 1 * DAY;
			await fastForwardTo(new Date(weekThree * 1000));
			updateRatesWithDefaults();

			const existingSupply = await synthetix.totalSupply();
			const currentRewardEscrowBalance = await synthetix.balanceOf(RewardEscrow.address);

			// call mint on Synthetix
			await synthetix.mint();

			const newTotalSupply = await synthetix.totalSupply();
			const minterReward = await supplySchedule.minterReward();
			const expectedEscrowBalance = currentRewardEscrowBalance
				.add(expectedSupplyToMint)
				.sub(minterReward);

			// Expect supply schedule is updated with new values
			const currentSchedule = await supplySchedule.schedules(1);

			assert.bnEqual(currentSchedule.totalSupplyMinted, expectedSupplyToMint);
			assert.bnEqual(newTotalSupply, existingSupply.add(expectedSupplyToMint));
			assert.bnEqual(await synthetix.balanceOf(RewardEscrow.address), expectedEscrowBalance);

			// should revert if try to mint again within 7 day period / mintable supply is 0
			await assert.revert(synthetix.mint());
		});

		it('should revert when time is after Year 7 endPeriod', async () => {
			// FastForward to after Year 7
			const YEAR_EIGHT_START = 1741046400;

			await fastForwardTo(new Date(YEAR_EIGHT_START * 1000));

			// should revert as the mintable amount is 0
			await assert.revert(synthetix.mint());
		});
	});

	describe('exchange gas price limit', () => {
		const amountIssued = toUnit('2000');
		const gasPriceLimit = toUnit('2');

		beforeEach(async () => {
			// Give some SNX to account1
			await synthetix.methods['transfer(address,uint256)'](account1, toUnit('300000'), {
				from: owner,
			});
			// Issue
			await synthetix.issueSynths(sUSD, amountIssued, { from: account1 });

			// set gas limit on synthetix
			await synthetix.setGasPriceLimit(gasPriceLimit, { from: gasLimitOracle });
		});

		it('should revert a user if they try to send more gwei than gasLimit', async () => {
			// Exchange sUSD to sAUD should revert if gasPrice is above limit
			await assert.revert(
				synthetix.exchange(sUSD, amountIssued, sAUD, {
					from: account1,
					gasPrice: gasPriceLimit.add(web3.utils.toBN(100)),
				})
			);
		});
		it('should revert if oracle tries to set gasLimit to 0', async () => {
			await assert.revert(
				synthetix.setGasPriceLimit(0, {
					from: gasLimitOracle,
				})
			);
		});
		it('should allow a user to exchange if they set the gasPrice to match limit', async () => {
			// Get the exchange fee in USD
			const exchangeFeeUSD = await feePool.exchangeFeeIncurred(amountIssued);
			const exchangeFeeXDR = await synthetix.effectiveValue(sUSD, exchangeFeeUSD, XDR);

			// Exchange sUSD to sAUD
			await synthetix.exchange(sUSD, amountIssued, sAUD, {
				from: account1,
				gasPrice: gasPriceLimit,
			});

			// how much sAUD the user is supposed to get
			const effectiveValue = await synthetix.effectiveValue(sUSD, amountIssued, sAUD);

			// chargeFee = true so we need to minus the fees for this exchange
			const effectiveValueMinusFees = await feePool.amountReceivedFromExchange(effectiveValue);

			// Assert we have the correct AUD value - exchange fee
			const sAUDBalance = await sAUDContract.balanceOf(account1);
			assert.bnEqual(effectiveValueMinusFees, sAUDBalance);

			// Assert we have the exchange fee to distribute
			const feePeriodZero = await feePool.recentFeePeriods(0);
			assert.bnEqual(exchangeFeeXDR, feePeriodZero.feesToDistribute);
		});
	});

	describe('when dealing with inverted synths', () => {
		let iBTCContract;
		beforeEach(async () => {
			iBTCContract = await Synth.at(await synthetix.synths(iBTC));
		});
		describe('when the iBTC synth is set with inverse pricing', () => {
			const iBTCEntryPoint = toUnit(4000);
			beforeEach(async () => {
				exchangeRates.setInversePricing(iBTC, iBTCEntryPoint, toUnit(6500), toUnit(1000), {
					from: owner,
				});
			});
			describe('when a user holds holds 100,000 SNX', () => {
				beforeEach(async () => {
					await synthetix.methods['transfer(address,uint256)'](account1, toUnit(1e5), {
						from: owner,
					});
				});

				describe('when a price within bounds for iBTC is received', () => {
					const iBTCPrice = toUnit(6000);
					beforeEach(async () => {
						await exchangeRates.updateRates([iBTC], [iBTCPrice], timestamp, {
							from: oracle,
						});
					});
					describe('when the user tries to mint 1% of their SNX value', () => {
						const amountIssued = toUnit(1e3);
						beforeEach(async () => {
							// Issue
							await synthetix.issueSynths(sUSD, amountIssued, { from: account1 });
						});
						describe('when the user tries to exchange some sUSD into iBTC', () => {
							const assertExchangeSucceeded = async ({
								amountExchanged,
								txn,
								exchangeFeeRateMultiplier = 1,
								from = sUSD,
								to = iBTC,
								toContract = iBTCContract,
								prevBalance,
							}) => {
								// Note: this presumes balance was empty before the exchange - won't work when
								// exchanging into sUSD as there is an existing sUSD balance from minting
								const exchangeFeeRate = await feePool.exchangeFeeRate();
								const actualExchangeFee = multiplyDecimal(
									exchangeFeeRate,
									toUnit(exchangeFeeRateMultiplier)
								);
								const balance = await toContract.balanceOf(account1);
								const effectiveValue = await synthetix.effectiveValue(from, amountExchanged, to);
								const effectiveValueMinusFees = effectiveValue.sub(
									multiplyDecimal(effectiveValue, actualExchangeFee)
								);

								const balanceFromExchange = prevBalance ? balance.sub(prevBalance) : balance;

								assert.bnEqual(balanceFromExchange, effectiveValueMinusFees);

								// check logs
								const synthExchangeEvent = txn.logs.find(log => log.event === 'SynthExchange');

								assert.bytes32EventEqual(
									synthExchangeEvent,
									'SynthExchange',
									{
										fromCurrencyKey: bytesToString(from),
										fromAmount: amountExchanged,
										toCurrencyKey: bytesToString(to),
										toAmount: effectiveValueMinusFees,
										toAddress: account1,
									},
									['toCurrencyKey', 'fromCurrencyKey']
								);
							};
							let exchangeTxns;
							const amountExchanged = toUnit(1e2);
							beforeEach(async () => {
								exchangeTxns = [];
								exchangeTxns.push(
									await synthetix.exchange(sUSD, amountExchanged, iBTC, {
										from: account1,
									})
								);
							});
							it('then it exchanges correctly into iBTC', async () => {
								await assertExchangeSucceeded({
									amountExchanged,
									txn: exchangeTxns[0],
									from: sUSD,
									to: iBTC,
									toContract: iBTCContract,
								});
							});
							describe('when the user tries to exchange some iBTC into another synth', () => {
								const newAmountExchanged = toUnit(0.003); // current iBTC balance is a bit under 0.05

								beforeEach(async () => {
									exchangeTxns.push(
										await synthetix.exchange(iBTC, newAmountExchanged, sAUD, {
											from: account1,
										})
									);
								});
								it('then it exchanges correctly out of iBTC', async () => {
									await assertExchangeSucceeded({
										amountExchanged: newAmountExchanged,
										txn: exchangeTxns[1],
										from: iBTC,
										to: sAUD,
										toContract: sAUDContract,
										exchangeFeeRateMultiplier: 2,
									});
								});

								describe('when a price outside of bounds for iBTC is received', () => {
									const newiBTCPrice = toUnit(7500);
									beforeEach(async () => {
										const newTimestamp = await currentTime();
										await exchangeRates.updateRates([iBTC], [newiBTCPrice], newTimestamp, {
											from: oracle,
										});
									});
									describe('when the user tries to exchange some iBTC again', () => {
										beforeEach(async () => {
											exchangeTxns.push(
												await synthetix.exchange(iBTC, toUnit(0.001), sEUR, {
													from: account1,
												})
											);
										});
										it('then it still exchanges correctly into iBTC even when frozen', async () => {
											await assertExchangeSucceeded({
												amountExchanged: toUnit(0.001),
												txn: exchangeTxns[2],
												from: iBTC,
												to: sEUR,
												toContract: sEURContract,
												exchangeFeeRateMultiplier: 2,
											});
										});
									});
									describe('when the user tries to exchange iBTC into another synth', () => {
										beforeEach(async () => {
											exchangeTxns.push(
												await synthetix.exchange(iBTC, newAmountExchanged, sEUR, {
													from: account1,
												})
											);
										});
										it('then it exchanges correctly out of iBTC, even while frozen', async () => {
											await assertExchangeSucceeded({
												amountExchanged: newAmountExchanged,
												txn: exchangeTxns[2],
												from: iBTC,
												to: sEUR,
												toContract: sEURContract,
												exchangeFeeRateMultiplier: 2,
											});
										});
									});
								});
							});
							describe('doubling of fees for swing trades', () => {
								const iBTCexchangeAmount = toUnit(0.002); // current iBTC balance is a bit under 0.05
								let txn;
								describe('when the user tries to exchange some short iBTC into long sBTC', () => {
									beforeEach(async () => {
										txn = await synthetix.exchange(iBTC, iBTCexchangeAmount, sBTC, {
											from: account1,
										});
									});
									it('then it exchanges correctly from iBTC to sBTC, doubling the fee', async () => {
										await assertExchangeSucceeded({
											amountExchanged: iBTCexchangeAmount,
											txn,
											exchangeFeeRateMultiplier: 2,
											from: iBTC,
											to: sBTC,
											toContract: sBTCContract,
										});
									});
									describe('when the user tries to exchange some short iBTC into sEUR', () => {
										beforeEach(async () => {
											txn = await synthetix.exchange(iBTC, iBTCexchangeAmount, sEUR, {
												from: account1,
											});
										});
										it('then it exchanges correctly from iBTC to sEUR, doubling the fee', async () => {
											await assertExchangeSucceeded({
												amountExchanged: iBTCexchangeAmount,
												txn,
												exchangeFeeRateMultiplier: 2,
												from: iBTC,
												to: sEUR,
												toContract: sEURContract,
											});
										});
										describe('when the user tries to exchange some sEUR for iBTC', () => {
											const sEURExchangeAmount = toUnit(0.001);
											let prevBalance;
											beforeEach(async () => {
												prevBalance = await iBTCContract.balanceOf(account1);
												txn = await synthetix.exchange(sEUR, sEURExchangeAmount, iBTC, {
													from: account1,
												});
											});
											it('then it exchanges correctly from sEUR to iBTC, doubling the fee', async () => {
												await assertExchangeSucceeded({
													amountExchanged: sEURExchangeAmount,
													txn,
													exchangeFeeRateMultiplier: 2,
													from: sEUR,
													to: iBTC,
													toContract: iBTCContract,
													prevBalance,
												});
											});
										});
									});
								});
								describe('when the user tries to exchange some short iBTC for sUSD', () => {
									let prevBalance;

									beforeEach(async () => {
										prevBalance = await sUSDContract.balanceOf(account1);
										txn = await synthetix.exchange(iBTC, iBTCexchangeAmount, sUSD, {
											from: account1,
										});
									});
									it('then it exchanges correctly out of iBTC, with the regular fee', async () => {
										await assertExchangeSucceeded({
											amountExchanged: iBTCexchangeAmount,
											txn,
											from: iBTC,
											to: sUSD,
											toContract: sUSDContract,
											prevBalance,
										});
									});
								});
							});
						});
					});
				});
			});
		});
	});

	describe('Using the protection circuit', async () => {
		const amount = toUnit('1000');
		it('should burn the source amount during an exchange', async () => {
			await synthetix.methods['transfer(address,uint256)'](account1, toUnit('1000000'), {
				from: owner,
			});
			await synthetix.issueSynths(sUSD, toUnit('10000'), { from: account1 });

			// Enable the protection circuit
			await synthetix.setProtectionCircuit(true, { from: oracle });

			const initialSUSDBalance = await sUSDContract.balanceOf(account1);

			// Exchange sUSD to sAUD
			await synthetix.exchange(sUSD, amount, sAUD, { from: account1 });

			// Assert the USD sent is gone
			const sUSDBalance = await sUSDContract.balanceOf(account1);
			assert.bnEqual(initialSUSDBalance.sub(amount), sUSDBalance);

			// Assert we don't have AUD
			const sAUDBalance = await sAUDContract.balanceOf(account1);
			assert.bnEqual(0, sAUDBalance);
		});

		it('should do the exchange if protection circuit is disabled', async () => {
			await synthetix.methods['transfer(address,uint256)'](account1, toUnit('1000000'), {
				from: owner,
			});
			await synthetix.issueSynths(sUSD, toUnit('10000'), { from: account1 });

			// Enable the protection circuit then disable it
			await synthetix.setProtectionCircuit(true, { from: oracle });
			await synthetix.setProtectionCircuit(false, { from: oracle });

			// Exchange sUSD to sAUD
			await synthetix.exchange(sUSD, amount, sAUD, { from: account1 });

			// how much sAUD the user is supposed to get
			const effectiveValue = await synthetix.effectiveValue(sUSD, amount, sAUD);

			// chargeFee = true so we need to minus the fees for this exchange
			const effectiveValueMinusFees = await feePool.amountReceivedFromExchange(effectiveValue);

			// Assert we have the correct AUD value - exchange fee
			const sAUDBalance = await sAUDContract.balanceOf(account1);
			assert.bnEqual(effectiveValueMinusFees, sAUDBalance);
		});

		it('should revert if account different than oracle tries to enable protection circuit', async () => {
			await assert.revert(synthetix.setProtectionCircuit(true, { from: owner }));
		});
	});
});
