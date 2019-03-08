const FeePool = artifacts.require('FeePool');
const SupplySchedule = artifacts.require('SupplySchedule');
const Synthetix = artifacts.require('Synthetix');

const {
	currentTime,
	fastForward,
	fastForwardTo,
	multiplyDecimal,
	divideDecimal,
	toUnit,
	ZERO_ADDRESS,
} = require('../utils/testUtils');

contract('SupplySchedule', async function(accounts) {

	const [
		deployerAccount,
		owner,
		account1,
		account2,
		synthetix
	] = accounts;

	let supplySchedule;

	beforeEach(async function() {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		supplySchedule = await SupplySchedule.deployed();
		await supplySchedule.setSynthetix(synthetix, {from: owner});
	});

	it('should set constructor params on deployment', async function() {
		// constructor(address _owner) //
		const instance = await SupplySchedule.new(
			account1,
			{
				from: deployerAccount,
			}
		);

		assert.equal(await instance.owner(), account1);
	});

	describe.only('linking synthetix', async function() {
		it('should have set synthetix', async function() {
			const synthetixAddress = await supplySchedule.synthetix();
			assert.equal(synthetixAddress, synthetix);
		});
	});
});
