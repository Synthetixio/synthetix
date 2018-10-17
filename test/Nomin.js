const ExchangeRates = artifacts.require('ExchangeRates');
const FeePool = artifacts.require('FeePool');
const Havven = artifacts.require('Havven');
const Nomin = artifacts.require('Nomin');

const { currentTime, fastForward, fromUnit, toUnit, ZERO_ADDRESS } = require('../utils/testUtils');

contract('Nomin', async function(accounts) {
	const [nUSD, nAUD, nEUR, HAV, HDR] = ['nUSD', 'nAUD', 'nEUR', 'HAV', 'HDR'].map(
		web3.utils.asciiToHex
	);

	const [
		deployerAccount,
		owner, // Oracle next, is not needed
		,
		feeAuthority,
		account1,
		account2,
		account3,
		account4,
	] = accounts;

	let feePool,
		FEE_ADDRESS,
		havven,
		exchangeRates,
		nUSDContract,
		nAUDContract,
		nEURContract,
		HDRContract;

	beforeEach(async function() {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		exchangeRates = await ExchangeRates.deployed();
		feePool = await FeePool.deployed();
		FEE_ADDRESS = await feePool.FEE_ADDRESS();

		havven = await Havven.deployed();
		nUSDContract = await Nomin.at(await havven.nomins(nUSD));
		nAUDContract = await Nomin.at(await havven.nomins(nAUD));
		nEURContract = await Nomin.at(await havven.nomins(nEUR));
		HDRContract = await Nomin.at(await havven.nomins(HDR));

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

	it('should transfer without error', async function() {
		// Issue 10,000 nUSD.
		const amount = toUnit('10000');
		await havven.issueNomins(nUSD, amount, { from: owner });

		const received = await feePool.amountReceivedFromTransfer(amount);
		const fee = amount.sub(received);
		const hdrFee = await havven.effectiveValue(nUSD, fee, HDR);

		// Do a single transfer of all our nUSD.
		const transaction = await nUSDContract.transfer(account1, amount, { from: owner });

		// Events should be a fee exchange and a transfer to account1
		assert.eventsEqual(
			transaction,

			// Fees get burned and exchanged to HDRs
			'Transfer',
			{ from: owner, to: ZERO_ADDRESS, value: fee },
			'Burned',
			{ account: owner, amount: fee },
			'Transfer',
			{
				from: ZERO_ADDRESS,
				to: FEE_ADDRESS,
				value: hdrFee,
			},
			'Issued',
			{ account: FEE_ADDRESS, amount: hdrFee },

			// And finally the original nomin transfer
			'Transfer',
			{ from: owner, to: account1, value: received }
		);

		// Sender should have nothing
		assert.bnEqual(await nUSDContract.balanceOf(owner), 0);

		// The recipient should have the correct amount
		assert.bnEqual(await nUSDContract.balanceOf(account1), received);

		// The fee pool should also have the correct amount
		assert.bnEqual(await HDRContract.balanceOf(FEE_ADDRESS), hdrFee);
	});
});
