require('dotenv').config();

if (!process.env.PRIVATE_KEY || !process.env.INFURA_KEY || !process.env.ETHERSCAN_KEY) {
	console.log(
		'You must pass a configuration using a .env file. Copy .env.example to .env and add appropriate variables.'
	);
	process.exit(1);
}

// --------------------------------------------------------------
// Deployment script
// --------------------------------------------------------------
//
// These settings can be used to configure the behaviour of the script.
//
// You can specify for each contract whether it should be deployed:
//
// Example:
//		ExchangeRates: { action: 'deploy' }
//
// or if there's an existing instance that should be used instead of the new deployment.
//
// Example:
//		ExchangeRates: {
//			action: 'use-existing',
//			existingInstance: '0xd9c19368d3cE48dB78Ebdbea95699f3f2291E2d1',
// 		}

const settings = {
	network: 'kovan',
	contractDeploymentGasLimit: 6500000,
	methodCallGasLimit: 150000,
	gasPrice: '0.1', // In gwei
	saveFlattenedContracts: true,
	flattenedContractsFolder: './flattened-contracts',
	verifyContracts: true,
	synths: ['XDR', 'sUSD', 'sEUR', 'sJPY', 'sAUD', 'sKRW', 'sXAU', 'sGBP', 'sCHF'],
	contracts: {
		Depot: {
			action: 'use-existing',
			existingInstance: '0x1920e29ea7b83d8769be04d28481f43b6619f26d',
		},
		ExchangeRates: {
			action: 'use-existing',
			existingInstance: '0xfcd4d688fa40bd4abc2f9c8db4e1735f14094c42',
		},
		FeePool: {
			action: 'use-existing',
			existingInstance: '0xEBdBac38835A1105851e80C7Fa1f1E6e25A86e32',
		},
		Synthetix: {
			action: 'use-existing',
			existingInstance: '0x457cD14f384E7D103B17feEb01d2a42Ad2ecA529',
		},
		SynthetixEscrow: {
			action: 'use-existing',
			existingInstance: '0xC557379F98d45f22853C5cF3fD1A830e11F083D6',
		},
		SynthetixState: {
			action: 'use-existing',
			existingInstance: '0x9dE2f60d70e1F6A044f4e07C8CD0C2B42D947bbE',
		},
		Synth: {
			XDR: {
				action: 'use-existing',
				existingInstance: '0x6568D9e750fC44AF00f857885Dfb8281c00529c4',
			},
			sUSD: {
				action: 'use-existing',
				existingInstance: '0xD9E5A009Ec07dE76616d7361Ed713eF434d71325',
			},
			sEUR: {
				action: 'use-existing',
				existingInstance: '0x249A10c68AfA9827571cb73f29ab5Af57Ee5A596',
			},
			sJPY: {
				action: 'use-existing',
				existingInstance: '0x1b619A6fB6b5D0c9F1067f8F3E24B0308907D8bB',
			},
			sAUD: {
				action: 'use-existing',
				existingInstance: '0x09Fabbf00CeDd6E8E715738a854461D56938c3BE',
			},
			sKRW: {
				action: 'use-existing',
				existingInstance: '0x4A17840Db4757d239FeB3e7398f918337508286e',
			},
			sXAU: {
				action: 'use-existing',
				existingInstance: '0x1D79Dc0a657550d3831dC134b2651C38F0612854',
			},
			sGBP: {
				action: 'deploy',
			},
			sCHF: {
				action: 'deploy',
			},
		},
		Proxy: {
			FeePool: {
				action: 'use-existing',
				existingInstance: '0xb440DD674e1243644791a4AdfE3A2AbB0A92d309',
			},
			Synthetix: {
				action: 'use-existing',
				existingInstance: '0x44D0bbe7E344D0dA45D3b60d5038607b2c596365',
			},
			XDR: {
				action: 'use-existing',
				existingInstance: '0x48414e5b7ed589956070DFfEBe6e4877DAE35EA6',
			},
			sUSD: {
				action: 'use-existing',
				existingInstance: '0x559E848A1b6a7AfC69Ee27F8d20280A42628b2cf',
			},
			sEUR: {
				action: 'use-existing',
				existingInstance: '0xB03dFc4b9C9756B6D4Fbc12DAde7732149Fcf00d',
			},
			sJPY: {
				action: 'use-existing',
				existingInstance: '0x112D5fA64e4902B6ff1a35495a0f878c210A5601',
			},
			sAUD: {
				action: 'use-existing',
				existingInstance: '0xf02a45263BB74685D72668568a200C843Aee69a2',
			},
			sKRW: {
				action: 'use-existing',
				existingInstance: '0x051158081c0Cfa293e38Eaf5df245785dAC7fd29',
			},
			sXAU: {
				action: 'use-existing',
				existingInstance: '0x7097e9E1e75194A29434128d4BdAFb49d4a87153',
			},
			sGBP: {
				action: 'deploy',
			},
			sCHF: {
				action: 'deploy',
			},
		},
		SafeDecimalMath: {
			action: 'use-existing',
			existingInstance: '0x84D626B2BB4D0F064067e4BF80FCe7055d8F3E7B',
		},
		TokenState: {
			Synthetix: {
				action: 'use-existing',
				existingInstance: '0x7E295884F3f5e2ea462620018E9193a1C305C185',
			},
			XDR: {
				action: 'use-existing',
				existingInstance: '0xc25dD122c6dcbE5390bd23b90e5605fC34Ad0D14',
			},
			sUSD: {
				action: 'use-existing',
				existingInstance: '0x4dFACfB15514C21c991ff75Bc7Bf6Fb1F98361ed',
			},
			sEUR: {
				action: 'use-existing',
				existingInstance: '0xED4699f180a14B5974c26f494483F9c327Fd381a',
			},
			sJPY: {
				action: 'use-existing',
				existingInstance: '0xe05D803fa0c5832Fa2262465290abB25d6C2bFA3',
			},
			sAUD: {
				action: 'use-existing',
				existingInstance: '0x2F8aa243760edC8fFC56C064EeAf4B11938BA8B7',
			},
			sKRW: {
				action: 'use-existing',
				existingInstance: '0x39f0f8eD1DB9Ba3894cC402EC964432f30364e81',
			},
			sXAU: {
				action: 'use-existing',
				existingInstance: '0x468833D3eeAF9Cf905521a34A66Dff704fDe9dcA',
			},
			sGBP: {
				action: 'deploy',
			},
			sCHF: {
				action: 'deploy',
			},
		},
	},
};

// --------------------------------------------------------------

const axios = require('axios');
const fs = require('fs');
const linker = require('solc/linker');
const mkdirp = require('mkdirp');
const path = require('path');
const qs = require('querystring');
const rimraf = require('rimraf');
const solc = require('solc');
const solidifier = require('solidifier');
const { table } = require('table');
const Web3 = require('web3');

// Configure Web3 so we can sign transactions and connect to the network.
const web3 = new Web3(
	new Web3.providers.HttpProvider(`https://${settings.network}.infura.io/${process.env.INFURA_KEY}`)
);
web3.eth.accounts.wallet.add(process.env.PRIVATE_KEY);
web3.eth.defaultAccount = web3.eth.accounts.wallet[0].address;

const account = web3.eth.defaultAccount;
const sendParameters = (type = 'method-call') => ({
	from: web3.eth.defaultAccount, // Ugh, what's the point of a defaultAccount if we have to set it anyway?
	gas: type === 'method-call' ? settings.methodCallGasLimit : settings.contractDeploymentGasLimit,
	gasPrice: web3.utils.toWei(settings.gasPrice, 'gwei'),
});

const etherscanUrl =
	!settings.network || settings.network === 'mainnet'
		? 'https://api.etherscan.io/api'
		: `https://api-${settings.network}.etherscan.io/api`;

// Globals that help us pass state easily
const flattenedContracts = {};
const artifacts = {};
const deployedContracts = {};
const ZERO_ADDRESS = '0x' + '0'.repeat(40);

// List all files in a directory in Node.js recursively in a synchronous fashion
const findSolFiles = (dir, relativePath = '', fileList = {}) => {
	const files = fs.readdirSync(dir);

	files.forEach(file => {
		const fullPath = path.join(dir, file);
		if (fs.statSync(fullPath).isDirectory()) {
			findSolFiles(fullPath, path.join(relativePath, file), fileList);
		} else if (path.extname(file) === '.sol') {
			fileList[path.join(relativePath, file)] = {
				textContents: fs.readFileSync(fullPath, 'utf8'),
			};
		}
	});

	return fileList;
};

const deployContract = async (contractIdentifier, constructorArguments) => {
	console.log(` - Deploying ${contractIdentifier}`);

	const [contractName, contractNamespace] = contractIdentifier.split('.');

	if (!artifacts[contractName]) throw new Error(`Unknown contract: ${contractName}`);
	if (!settings.contracts[contractName]) {
		throw new Error(`No settings for contract: ${contractName}`);
	}

	let contractSettings = settings.contracts[contractName];

	if (contractNamespace) {
		if (!contractSettings[contractNamespace]) {
			throw new Error(`No settings for contract: ${contractIdentifier}`);
		}

		contractSettings = contractSettings[contractNamespace];
	}

	const { action, existingInstance } = contractSettings;

	// Any contract after SafeDecimalMath can automatically get linked.
	// Doing this with bytecode that doesn't require the library is a no-op.
	let bytecode = artifacts[contractName].evm.bytecode.object;

	if (deployedContracts.SafeDecimalMath) {
		bytecode = linker.linkBytecode(bytecode, {
			[contractName + '.sol']: {
				SafeDecimalMath: deployedContracts.SafeDecimalMath.options.address,
			},
		});
	}

	artifacts[contractName].evm.bytecode.linkedObject = bytecode;

	if (action === 'use-existing') {
		console.log('   - Using existing instance');

		if (!existingInstance) {
			throw new Error(
				`Settings for contract: ${contractIdentifier} specify an existing contract, but do not give an address.`
			);
		}

		deployedContracts[contractIdentifier] = new web3.eth.Contract(
			artifacts[contractName].abi,
			existingInstance
		);
	} else if (action === 'deploy') {
		console.log('   - Deploying new instance...');

		const newContract = new web3.eth.Contract(artifacts[contractName].abi);
		deployedContracts[contractIdentifier] = await newContract
			.deploy({
				data: '0x' + bytecode,
				arguments: constructorArguments,
			})
			.send(sendParameters('contract-deployment'));
	} else {
		throw new Error(`Unknown action for contract ${contractIdentifier}: ${action}`);
	}

	console.log(`   - ${deployedContracts[contractIdentifier].options.address}`);

	return deployedContracts[contractIdentifier];
};

const verifyContracts = async () => {
	if (!settings.verifyContracts) {
		console.log('Verification disabled in settings.');
		return;
	}

	const tableData = [];

	for (const contract of Object.keys(deployedContracts)) {
		// Check if this contract already has been verified.

		// ExchangeRates is unable to verify via API
		if (contract === 'ExchangeRates') {
			tableData.push([deployedContracts[contract].options.address, 'Skipped Verification']);
			continue;
		}

		let result = await axios.get(etherscanUrl, {
			params: {
				module: 'contract',
				action: 'getabi',
				address: deployedContracts[contract].options.address,
				apikey: process.env.ETHERSCAN_KEY,
			},
		});

		if (result.data.result === 'Contract source code not verified') {
			const [contractName] = contract.split('.');

			console.log(`Contract ${contract} not yet verified. Verifying...`);

			// Get the transaction that created the contract with its resulting bytecode.
			result = await axios.get(etherscanUrl, {
				params: {
					module: 'account',
					action: 'txlist',
					address: deployedContracts[contract].options.address,
					sort: 'asc',
					apikey: process.env.ETHERSCAN_KEY,
				},
			});

			// Get the bytecode that was in that transaction.
			const deployedBytecode = result.data.result[0].input;

			// Grab the last 50 characters of the compiled bytecode
			const compiledBytecode = artifacts[contractName].evm.bytecode.linkedObject.slice(-50);
			const pattern = new RegExp(`${compiledBytecode}(.+)$`);

			const constructorArguments = pattern.exec(deployedBytecode)[1];

			console.log('Constructor arguments', constructorArguments);

			result = await axios.post(
				etherscanUrl,
				qs.stringify({
					module: 'contract',
					action: 'verifysourcecode',
					contractaddress: deployedContracts[contract].options.address,
					sourceCode: flattenedContracts[`${contractName}.sol`].content,
					contractname: contractName,
					constructorArguements: constructorArguments,
					compilerversion: 'v' + solc.version().replace('.Emscripten.clang', ''), // The version reported by solc-js is too verbose and needs a v at the front
					optimizationUsed: 1,
					runs: 200,
					libraryname1: 'SafeDecimalMath',
					libraryaddress1: deployedContracts.SafeDecimalMath.options.address,
					apikey: process.env.ETHERSCAN_KEY,
				}),
				{
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
					},
				}
			);

			console.log('Got result:', result.data.result);

			if (result.data.result === 'Contract source code already verified') {
				// Ugh, ok, you lie, but fine, skip and continue.
				tableData.push([deployedContracts[contract].options.address, 'Successfully verified']);
				continue;
			}

			const guid = result.data.result;

			let status = '';
			while (status !== 'Pass - Verified') {
				console.log('Checking verification status...');

				result = await axios.get(etherscanUrl, {
					params: {
						module: 'contract',
						action: 'checkverifystatus',
						guid,
					},
				});
				status = result.data.result;

				console.log(`Got ${status}`);

				if (status === 'Fail - Unable to verify') {
					tableData.push([deployedContracts[contract].options.address, 'Unable to verify']);

					console.log('Unable to verify');
					console.log('Moving to next contract');
					break;
				}

				if (status !== 'Pass - Verified') {
					console.log('Sleeping for 5 seconds and re-checking.');
					await new Promise(resolve => setTimeout(resolve, 5000));
				} else {
					tableData.push([deployedContracts[contract].options.address, 'Successfully verified']);
				}
			}
		} else {
			tableData.push([deployedContracts[contract].options.address, 'Already verified']);
		}
	}

	console.log('Verification state');
	console.log(table(tableData));
};

const build = async () => {
	console.log('Starting build...');

	// Flatten all the contracts.
	// Start with the libraries, then copy our own contracts on top to ensure
	// if there's a naming clash our code wins.
	console.log('Finding .sol files...');
	const libraries = findSolFiles('node_modules');
	const contracts = findSolFiles('contracts');
	const merged = { ...libraries, ...contracts };

	console.log('Flattening contracts...');
	for (const contract of Object.keys(contracts)) {
		const flattened = await solidifier.flatten({
			files: merged,
			path: contract,
			stripExcessWhitespace: true,
		});

		// Save it for later.
		flattenedContracts[contract] = { content: flattened };
	}

	// Ok, now we need to compile all the files.
	console.log('Compiling contracts...');
	const output = JSON.parse(
		solc.compileStandardWrapper(
			JSON.stringify({
				language: 'Solidity',
				settings: {
					optimizer: {
						enabled: true,
					},
					outputSelection: {
						'*': {
							'*': ['abi', 'evm.bytecode'],
						},
					},
				},
				sources: flattenedContracts,
			})
		)
	);

	const warnings = output.errors.filter(e => e.severity === 'warning');
	const errors = output.errors.filter(e => e.severity === 'error');

	console.log(`Compiled with ${warnings.length} warnings and ${errors.length} errors`);
	if (errors.length > 0) {
		console.log(errors);
		console.log();
		console.log('Exiting because of compile errors.');
		process.exit(1);
	}

	// Ok, now pull the contract we care about out of each file's output.
	for (const contract of Object.keys(output.contracts)) {
		const name = path.basename(contract, '.sol');
		artifacts[name] = output.contracts[contract][name];
	}

	// We're built!
};

const saveFlattenedContracts = async () => {
	if (settings.saveFlattenedContracts) {
		rimraf.sync(settings.flattenedContractsFolder);

		for (const contract of Object.keys(flattenedContracts)) {
			const filename = path.join(settings.flattenedContractsFolder, contract);
			mkdirp.sync(path.dirname(filename));

			console.log(`Saving ${contract} to ${settings.flattenedContractsFolder}.`);
			fs.writeFileSync(filename, flattenedContracts[contract].content);
		}

		console.log('Successfully saved flattened contracts.');
		console.log();
	}
};

const deploy = async () => {
	await deployContract('SafeDecimalMath');

	const exchangeRates = await deployContract('ExchangeRates', [
		account,
		account,
		[web3.utils.asciiToHex('SNX')],
		[web3.utils.toWei('0.2', 'ether')],
	]);

	const feePoolProxy = await deployContract('Proxy.FeePool', [account]);

	const feePool = await deployContract('FeePool', [
		feePoolProxy.options.address,
		account,
		account,
		account,
		web3.utils.toWei('0.0015', 'ether'),
		web3.utils.toWei('0.0015', 'ether'),
	]);

	if (
		settings.contracts.Proxy.FeePool.action === 'deploy' ||
		settings.contracts.FeePool.action === 'deploy'
	) {
		await feePoolProxy.methods.setTarget(feePool.options.address).send(sendParameters());
	}

	const synthetixState = await deployContract('SynthetixState', [account, account]);
	const synthetixProxy = await deployContract('Proxy.Synthetix', [account]);
	const synthetixTokenState = await deployContract('TokenState.Synthetix', [account, account]);
	const synthetix = await deployContract('Synthetix', [
		synthetixProxy.options.address,
		synthetixTokenState.options.address,
		synthetixState.options.address,
		account,
		exchangeRates.options.address,
		feePool.options.address,
	]);

	if (
		settings.contracts.Proxy.Synthetix.action === 'deploy' ||
		settings.contracts.Synthetix.action === 'deploy'
	) {
		console.log('Setting target on Synthetix Proxy...');
		await synthetixProxy.methods.setTarget(synthetix.options.address).send(sendParameters());
	}

	if (settings.contracts.TokenState.Synthetix.action === 'deploy') {
		console.log('Setting balance on Synthetix Token State...');
		await synthetixTokenState.methods
			.setBalanceOf(account, web3.utils.toWei('100000000'))
			.send(sendParameters());
	}

	if (
		settings.contracts.TokenState.Synthetix.action === 'deploy' ||
		settings.contracts.Synthetix.action === 'deploy'
	) {
		console.log('Setting associated contract on Synthetix Token State...');
		await synthetixTokenState.methods
			.setAssociatedContract(synthetix.options.address)
			.send(sendParameters());
		console.log('Setting associated contract on Synthetix State...');
		await synthetixState.methods
			.setAssociatedContract(synthetix.options.address)
			.send(sendParameters());
	}

	const synthetixEscrow = await deployContract('SynthetixEscrow', [
		account,
		synthetix.options.address,
	]);

	if (
		settings.contracts.Synthetix.action === 'deploy' ||
		settings.contracts.SynthetixEscrow.action === 'deploy'
	) {
		console.log('Setting escrow on Synthetix...');
		await synthetix.methods.setEscrow(synthetixEscrow.options.address).send(sendParameters());
	}

	if (
		settings.contracts.FeePool.action === 'deploy' ||
		settings.contracts.Synthetix.action === 'deploy'
	) {
		console.log('Setting Synthetix on Fee Pool...');
		await feePool.methods.setSynthetix(synthetix.options.address).send(sendParameters());
	}

	// ----------------
	// Synths
	// ----------------
	for (const currencyKey of settings.synths) {
		const tokenState = await deployContract(`TokenState.${currencyKey}`, [account, ZERO_ADDRESS]);
		const tokenProxy = await deployContract(`Proxy.${currencyKey}`, [account]);
		const synth = await deployContract(`Synth.${currencyKey}`, [
			tokenProxy.options.address,
			tokenState.options.address,
			synthetix.options.address,
			feePool.options.address,
			`Synth ${currencyKey}`,
			currencyKey,
			account,
			web3.utils.asciiToHex(currencyKey),
		]);

		if (
			settings.contracts.Synth[currencyKey].action === 'deploy' ||
			settings.contracts.TokenState[currencyKey].action === 'deploy'
		) {
			console.log(`Setting associated contract for ${currencyKey} TokenState...`);

			await tokenState.methods.setAssociatedContract(synth.options.address).send(sendParameters());
		}
		if (
			settings.contracts.Proxy[currencyKey].action === 'deploy' ||
			settings.contracts.Synth[currencyKey].action === 'deploy'
		) {
			console.log(`Setting proxy target for ${currencyKey} Proxy...`);

			await tokenProxy.methods.setTarget(synth.options.address).send(sendParameters());
		}

		// Comment out if deploying on mainnet - Needs to be owner of Synthetix contract
		if (
			settings.contracts.Synth[currencyKey].action === 'deploy' ||
			settings.contracts.Synthetix.action === 'deploy'
		) {
			console.log(`Adding ${currencyKey} to Synthetix contract...`);

			await synthetix.methods.addSynth(synth.options.address).send(sendParameters());
		}
	}

	await deployContract('Depot', [
		account,
		account,
		synthetix.options.address,
		deployedContracts['Synth.sUSD'].options.address,
		feePool.options.address,
		account,
		web3.utils.toWei('500'),
		web3.utils.toWei('.10'),
	]);

	console.log();
	console.log();
	console.log(' Successfully deployed all contracts:');
	console.log();

	const tableData = Object.keys(deployedContracts).map(key => [
		key,
		deployedContracts[key].options.address,
	]);

	console.log(table(tableData));
};

// Build and deploy and clean that build directory again.
build()
	.then(() => deploy())
	.then(() => saveFlattenedContracts())
	.then(() => verifyContracts());
