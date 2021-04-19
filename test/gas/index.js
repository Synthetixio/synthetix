const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const ethers = require('ethers');

let provider;
let signer;
let data;

const DATA_FILE = 'test/gas/measurements.json';
const MAX_SYNTHS = 10;
const NUM_MEASUREMENTS = 3;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

describe('Gas measurements', () => {
	let Synthetix, Issuer, ExchangeRates, DebtCache, AddressResolver;

	before('prepare data file', () => {
		if (fs.existsSync(DATA_FILE)) {
			fs.unlinkSync(DATA_FILE);
		}

		data = {
			minting: [],
		};
	});

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
		AddressResolver = _getContract({ name: 'AddressResolver' });
	});

	before('remove all synths', async () => {
		const currencyKeys = await Issuer.availableCurrencyKeys();
		const synthsToRemove = currencyKeys.filter(
			currencyKey => ethers.utils.parseBytes32String(currencyKey) !== 'sUSD'
		);

		if (synthsToRemove.length > 0) {
			console.log(
				chalk.red(
					`Removing synths: ${synthsToRemove.map(currencyKey =>
						ethers.utils.parseBytes32String(currencyKey)
					)}`
				)
			);
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

	after('print data', () => {
		console.log(JSON.stringify(data, null, 2));
	});

	for (let numSynths = 1; numSynths <= MAX_SYNTHS; numSynths++) {
		describe(`When the system has ${numSynths} synths`, () => {
			before('add synths', async () => {
				const activeSynths = await Issuer.availableSynthCount();
				console.log(chalk.blue(`Taking measurements with ${numSynths} synths...`));
				console.log(chalk.gray(`System synths: ${activeSynths}`));

				if (activeSynths < numSynths) {
					console.log(chalk.magenta('Adding a synth...'));

					const currency = `s${numSynths - 1}`;
					const currencyKey = ethers.utils.formatBytes32String(`s${numSynths}`);

					const TokenState = _getContractFactory({ name: 'TokenStatesUSD' });
					const tokenState = await TokenState.deploy(signer.address, ZERO_ADDRESS);

					const Proxy = _getContractFactory({ name: 'ProxysUSD' });
					const proxy = await Proxy.deploy(signer.address);

					const Synth = _getContractFactory({ name: 'SynthsUSD' });
					const synth = await Synth.deploy(
						proxy.address,
						tokenState.address,
						`Mock Synth`,
						currency,
						signer.address,
						currencyKey,
						0,
						AddressResolver.address
					);

					let tx = await Issuer.addSynth(synth.address);
					await tx.wait();

					const { timestamp } = await provider.getBlock();
					tx = await ExchangeRates.updateRates(
						[currencyKey],
						[ethers.utils.parseEther('1')],
						timestamp
					);
					await tx.wait();

					tx = await DebtCache.takeDebtSnapshot();
					await tx.wait();

					console.log(chalk.gray(`Updated system synths: ${await Issuer.availableSynthCount()}`));
				}
			});

			it('minting', async () => {
				const target = `minting.${numSynths}`;
				if (!data[target]) {
					data[target] = {
						measurements: [],
						avg: 0,
					};
				}

				let totalGas = 0;

				for (let i = 0; i < NUM_MEASUREMENTS; i++) {
					const tx = await Synthetix.issueSynths(ethers.utils.parseEther('100'));
					const receipt = await tx.wait();

					const gas = receipt.cumulativeGasUsed.toNumber();
					totalGas += gas;

					data[target].measurements.push(gas);
				}

				data[target].avg = totalGas / NUM_MEASUREMENTS;
			});
		});
	}
});

function _getContractFactory({ name }) {
	const deployment = _getDeploymentFile({ filename: 'deployment.json' });

	const target = deployment.targets[name];
	const source = target.source;

	const bytecode = deployment.sources[source].bytecode;
	const abi = deployment.sources[source].abi;

	return new ethers.ContractFactory(abi, bytecode, signer);
}

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
