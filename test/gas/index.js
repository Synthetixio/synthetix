const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const ethers = require('ethers');

let provider;
let signer;

describe('Gas measurements', () => {
	let Synthetix, Issuer, ExchangeRates, DebtCache;

	before('set up provider & signers', async () => {
		provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');

		signer = provider.getSigner(0);
		signer.address = await signer.getAddress();
		console.log(chalk.blue(`Signer: ${signer.address}`));
	});

	before('connect to contracts', async () => {
		Synthetix = _getContract({ name: 'Synthetix' });
		Issuer = _getContract({ name: 'Issuer' });
		ExchangeRates = _getContract({ name: 'ExchangeRates' });
		DebtCache = _getContract({ name: 'DebtCache' });
	});

	before('remove all synths', async () => {
		const currencyKeys = await Issuer.availableCurrencyKeys();
		const synthsToRemove = currencyKeys.filter(
			currencyKey => ethers.utils.parseBytes32String(currencyKey) !== 'sUSD'
		);

		if (synthsToRemove.length > 0) {
			const tx = await Issuer.removeSynths(synthsToRemove);
			await tx.wait();
		}
	});

	before('set initial rates and debt cache', async () => {
		const currencyKeys = ['SNX', 'ETH'].map(currency => ethers.utils.formatBytes32String(currency));
		const rates = currencyKeys.map(() => ethers.utils.parseEther('1'));
		const { timestamp } = await provider.getBlock();

		let tx = await ExchangeRates.updateRates(currencyKeys, rates, timestamp);
		await tx.wait();

		tx = await DebtCache.takeDebtSnapshot();
		await tx.wait();
	});

	it('test', async () => {
		const numSynths = await Issuer.availableSynthCount();
		const currencyKeys = await Issuer.availableCurrencyKeys();
		const currencies = currencyKeys.map(currencyKey =>
			ethers.utils.parseBytes32String(currencyKey)
		);
		console.log(`Available synths (${numSynths}): ${currencies}`);

		const balance = await Synthetix.balanceOf(signer.address);
		console.log(balance.toString());

		const tx = await Synthetix.issueSynths(ethers.utils.parseEther('100'));
		console.log(tx);

		const receipt = await tx.wait();
		console.log(receipt);
	});
});

function _getContract({ name }) {
	const deployment = _getDeploymentFile({ filename: 'deployment.json' });

	const target = deployment.targets[name];
	const address = target.address;

	const source = target.source;
	const abi = deployment.sources[source].abi;

	return new ethers.Contract(address, abi, signer);
}

function _getDeploymentFile({ filename }) {
	return JSON.parse(fs.readFileSync(path.join(_getDeploymentFolder(), filename), 'utf8'));
}

function _getDeploymentFolder() {
	return `./publish/deployed/local`;
}
