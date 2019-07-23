const IntegrationProxy = artifacts.require('IntegrationProxy');
const Synthetix = artifacts.require('Synthetix');
const TokenExchanger = artifacts.require('TokenExchanger');

const { toUnit } = require('../utils/testUtils');

contract.only('IntegrationProxy', async accounts => {
	const [deployerAccount, owner, account1, account2] = accounts;

	let synthetix, integrationProxy, tokenExchanger;

	const [sUSD, sAUD] = ['sUSD', 'sAUD'].map(web3.utils.asciiToHex);

	beforeEach(async () => {
		// Save ourselves from having to await deployed() in every single test.
		// We do this in a beforeEach instead of before to ensure we isolate
		// contract interfaces to prevent test bleed.
		integrationProxy = await IntegrationProxy.deployed();
		synthetix = await Synthetix.deployed();
		await integrationProxy.setTarget(synthetix.address, { from: owner });
		await synthetix.setIntegrationProxy(synthetix.address, { from: owner });

		// Deploy an on chain exchanger
		tokenExchanger = await TokenExchanger.new(owner, integrationProxy.address, {
			from: deployerAccount,
		});

		// Give some SNX to account1 and account2
		await synthetix.methods['transfer(address,uint256)'](account1, toUnit('1000'), { from: owner });
		await synthetix.methods['transfer(address,uint256)'](account2, toUnit('1000'), { from: owner });

		// Issue 10 sUSD each
		await synthetix.issueSynths(sUSD, toUnit('10'), { from: account1 });
		await synthetix.issueSynths(sUSD, toUnit('10'), { from: account2 });
	});

	it.only('should setintegrationProxy on synthetix on deployment', async () => {
		const _integrationProxyAddress = await synthetix.integrationProxy();
		assert.equal(integrationProxy.address, _integrationProxyAddress);
	});

	it.only('should setTarget on setintegrationProxy to synthetix on deployment', async () => {
		const _synthetixAddress = await integrationProxy.target();
		assert.equal(synthetix.address, _synthetixAddress);
	});

	describe('third party contracts', async () => {
		it('should be able to query ERC20 balanceOf', async () => {
			const mybalance = await tokenExchanger.checkBalance(account1);
			const alsoMyBalance = await synthetix.balanceOf(account1);
			assert.equal(mybalance, alsoMyBalance);
		});

		it('should be able to exchange', async () => {
			const exchangedAmount = await tokenExchanger.amountReceivedFromExchange(toUnit('10'));
			await tokenExchanger.exchange(sUSD, toUnit('10'), sAUD);
			const sAUDBalance = await sAUD.balanceOf(account1);
			assert.bnEqual(exchangedAmount, sAUDBalance);
		});
	});
});
