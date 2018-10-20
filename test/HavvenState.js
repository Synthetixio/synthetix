const ExchangeRates = artifacts.require('ExchangeRates');
const Escrow = artifacts.require('HavvenEscrow');
const FeePool = artifacts.require('FeePool');
const Havven = artifacts.require('Havven');
const HavvenState = artifacts.require('HavvenState');
const Nomin = artifacts.require('Nomin');

const {
	currentTime,
	fastForward,
	multiplyDecimal,
	divideDecimal,
	toUnit,
	fromUnit,
	ZERO_ADDRESS,
} = require('../utils/testUtils');

contract.only('HavvenState', async function(accounts) {
	const [nUSD, nAUD, nEUR, HAV, HDR, nXYZ] = ['nUSD', 'nAUD', 'nEUR', 'HAV', 'HDR', 'nXYZ'].map(
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

	let havven, havvenState, exchangeRates, feePool, nUSDContract, nAUDContract;

	beforeEach(async function() {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		havven = await Havven.deployed();
		havvenState = await HavvenState.at(await havven.havvenState());
	});

	it('should set constructor params on deployment', async function() {
		// constructor(address _owner, address _associatedContract)
		const instance = await HavvenState.new(account1, account2, {
			from: deployerAccount,
		});

		assert.equal(await instance.owner(), account1);
		assert.equal(await instance.associatedContract(), account2);
	});

	it('should allow the owner to set the issuance ratio', async function() {
		const ratio = toUnit('0.2');

		const transaction = await havvenState.setIssuanceRatio(ratio, {
			from: owner,
		});

		assert.eventEqual(transaction, 'IssuanceRatioUpdated', { newRatio: ratio });
	});

	it('should allow the owner to set the issuance ratio to zero', async function() {
		const ratio = web3.utils.toBN('0');

		const transaction = await havvenState.setIssuanceRatio(ratio, {
			from: owner,
		});

		assert.eventEqual(transaction, 'IssuanceRatioUpdated', { newRatio: ratio });
	});

	it('should disallow a non-owner from setting the issuance ratio', async function() {
		const ratio = toUnit('0.2');

		await assert.revert(
			havvenState.setIssuanceRatio(ratio, {
				from: account1,
			})
		);
	});

	it('should disallow setting the issuance ratio above the MAX ratio', async function() {
		const max = toUnit('1');

		// It should succeed when setting it to max
		const transaction = await havvenState.setIssuanceRatio(max, {
			from: owner,
		});
		assert.eventEqual(transaction, 'IssuanceRatioUpdated', { newRatio: max });

		// But max + 1 should fail
		await assert.revert(
			havvenState.setIssuanceRatio(web3.utils.toBN(max).add(web3.utils.toBN('1')), {
				from: account1,
			})
		);
	});
});
