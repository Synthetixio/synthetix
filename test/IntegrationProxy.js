const IntegrationProxy = artifacts.require('IntegrationProxy');
const Synthetix = artifacts.require('Synthetix');
const TokenExchanger = artifacts.require('TokenExchanger');

const { toUnit } = require('../utils/testUtils');

contract.only('IntegrationProxy', async accounts => {
	const [deployerAccount, owner, account1, account2] = accounts;

	let synthetix, integrationProxy, tokenExchanger;

	const [sUSD, sAUD] = ['sUSD', 'sAUD'].map(web3.utils.asciiToHex);

	beforeEach(async () => {
		console.log('Deploying IntegrationProxy...');
		integrationProxy = await IntegrationProxy.new(owner, { from: deployerAccount });
		console.log('IntegrationProxy Deployed:', integrationProxy.address);
		synthetix = await Synthetix.deployed();
		console.log('synthetix.setIntegrationProxy to', integrationProxy.address);
		await synthetix.setIntegrationProxy(integrationProxy.address, { from: owner });
		console.log('integrationProxy.setTarget to', synthetix.address);

		const txn = await integrationProxy.setTarget(synthetix.address, { from: owner });
		console.log(txn.receipt.status);

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

	it('should setIntegrationProxy on synthetix on deployment', async () => {
		const _integrationProxyAddress = await synthetix.integrationProxy();
		assert.equal(integrationProxy.address, _integrationProxyAddress);
	});

	it('should setTarget on IntegrationProxy to synthetix on deployment', async () => {
		const integrationProxyTarget = await integrationProxy.target();
		console.log('integrationProxy.target is ', integrationProxyTarget);
		assert.equal(synthetix.address, integrationProxyTarget);
	});

	it('should tokenExchanger has integrationProxy set on deployment', async () => {
		const _integrationProxyAddress = await tokenExchanger.integrationProxy();
		assert.equal(integrationProxy.address, _integrationProxyAddress);
	});

	describe('third party contracts', async () => {
		it.only('should be able to query ERC20 balanceOf', async () => {
			console.log('Call tokenExchanger.checkBalance()');
			const mybalance = await tokenExchanger.checkBalance(account1);
			console.log('mybalance = ', mybalance.toString());
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
