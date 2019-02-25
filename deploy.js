require('dotenv').config();

if (!process.env.PRIVATE_KEY || !process.env.INFURA_KEY || !process.env.ETHERSCAN_KEY) {
	console.log(
		'You must pass a configuration using a .env file. Copy .env.example to .env and add appropriate variables. Make sure the PRIVATE_KEY begins with 0x'
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
//
// If you're not seeing your account and getting insufficent funds make sure you
// add 0x to the start of the private key
//

const settings = {
	network: 'mainnet',
	contractDeploymentGasLimit: 6500000,
	methodCallGasLimit: 150000,
	gasPrice: '10.1', // In gwei
	saveFlattenedContracts: true,
	flattenedContractsFolder: './flattened-contracts',
	verifyContracts: true,
	synths: [
		'XDR',
		'sUSD',
		'sEUR',
		'sJPY',
		'sAUD',
		'sKRW',
		'sGBP',
		'sCHF',
		'sCNY',
		'sSGD',
		'sCAD',
		'sRUB',
		'sINR',
		'sBRL',
		'sNZD',
		'sPLN',
		'sXAU',
		'sXAG',
		'sBTC',
	],
	contracts: {
		Depot: {
			action: 'use-existing',
			existingInstance: '0x172E09691DfBbC035E37c73B62095caa16Ee2388',
		},
		ExchangeRates: {
			action: 'use-existing',
			existingInstance: '0x73b172756BD5DDf0110Ba8D7b88816Eb639Eb21c',
		},
		FeePool: {
			action: 'use-existing',
			existingInstance: '0xEBdBac38835A1105851e80C7Fa1f1E6e25A86e32',
		},
		Synthetix: {
			action: 'use-existing',
			existingInstance: '0x58a4cdba423a4d143426951512f066a995527bff',
		},
		SynthetixEscrow: {
			action: 'use-existing',
			existingInstance: '0x971e78e0C92392A4E39099835cF7E6aB535b2227',
		},
		SynthetixState: {
			action: 'use-existing',
			existingInstance: '0x7E295884F3f5e2ea462620018E9193a1C305C185',
		},
		Synth: {
			XDR: {
				action: 'use-existing',
				existingInstance: '0x2972705AF18c66c14CDd27AD412961E01944A9C3',
			},
			sUSD: {
				action: 'use-existing',
				existingInstance: '0x48414e5b7ed589956070DFfEBe6e4877DAE35EA6',
			},
			sEUR: {
				action: 'use-existing',
				existingInstance: '0xC2bb52457D81FBD223CC92b44cd372d36b338A10',
			},
			sJPY: {
				action: 'use-existing',
				existingInstance: '0xD9E5A009Ec07dE76616d7361Ed713eF434d71325',
			},
			sAUD: {
				action: 'use-existing',
				existingInstance: '0xB03dFc4b9C9756B6D4Fbc12DAde7732149Fcf00d',
			},
			sKRW: {
				action: 'use-existing',
				existingInstance: '0xdF846D3ded30A0590319f8A7ECD4e233B0e9188C',
			},
			sGBP: {
				action: 'use-existing',
				existingInstance: '0xdB36B8f25bB1f289d97aeE8f87BAcCaC58fA8883',
			},
			sCHF: {
				action: 'use-existing',
				existingInstance: '0x9270D9970D6ACA773e2FA01633CDc091a46714c9',
			},
			sCNY: {
				action: 'deploy',
			},
			sSGD: {
				action: 'deploy',
			},
			sCAD: {
				action: 'deploy',
			},
			sRUB: {
				action: 'deploy',
			},
			sINR: {
				action: 'deploy',
			},
			sBRL: {
				action: 'deploy',
			},
			sNZD: {
				action: 'deploy',
			},
			sPLN: {
				action: 'deploy',
			},
			sXAU: {
				action: 'use-existing',
				existingInstance: '0x112D5fA64e4902B6ff1a35495a0f878c210A5601',
			},
			sAUG: {
				action: 'deploy',
			},
			sBTC: {
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
				existingInstance: '0xC011A72400E58ecD99Ee497CF89E3775d4bd732F',
			},
			XDR: {
				action: 'use-existing',
				existingInstance: '0x62492F15cF60c5847d3053e482cAde8C5c29af88',
			},
			sUSD: {
				action: 'use-existing',
				existingInstance: '0x57Ab1E02fEE23774580C119740129eAC7081e9D3',
			},
			sEUR: {
				action: 'use-existing',
				existingInstance: '0x3EB064766109D150e4362222df80638BcE00e037',
			},
			sJPY: {
				action: 'use-existing',
				existingInstance: '0x559E848A1b6a7AfC69Ee27F8d20280A42628b2cf',
			},
			sAUD: {
				action: 'use-existing',
				existingInstance: '0xED4699f180a14B5974c26f494483F9c327Fd381a',
			},
			sKRW: {
				action: 'use-existing',
				existingInstance: '0xdCE506b196B0dF677d07e718f872CAc9Bc368A33',
			},
			sGBP: {
				action: 'use-existing',
				existingInstance: '0x0C8A7D55ef593A2cAd34894c1523162eE2ffB9aC',
			},
			sCHF: {
				action: 'use-existing',
				existingInstance: '0x28AF5a2f0cC12F2f19dd946608c945456b52b3F6',
			},
			sCNY: {
				action: 'deploy',
			},
			sSGD: {
				action: 'deploy',
			},
			sCAD: {
				action: 'deploy',
			},
			sRUB: {
				action: 'deploy',
			},
			sINR: {
				action: 'deploy',
			},
			sBRL: {
				action: 'deploy',
			},
			sNZD: {
				action: 'deploy',
			},
			sPLN: {
				action: 'deploy',
			},
			sXAU: {
				action: 'use-existing',
				existingInstance: '0xe05D803fa0c5832Fa2262465290abB25d6C2bFA3',
			},
			sAUG: {
				action: 'deploy',
			},
			sBTC: {
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
				existingInstance: '0x5b1b5fEa1b99D83aD479dF0C222F0492385381dD',
			},
			XDR: {
				action: 'use-existing',
				existingInstance: '0xBF093390d8046ae2d0f5465DEC7001d65DC159d5',
			},
			sUSD: {
				action: 'use-existing',
				existingInstance: '0x05a9CBe762B36632b3594DA4F082340E0e5343e8',
			},
			sEUR: {
				action: 'use-existing',
				existingInstance: '0x6568D9e750fC44AF00f857885Dfb8281c00529c4',
			},
			sJPY: {
				action: 'use-existing',
				existingInstance: '0x4dFACfB15514C21c991ff75Bc7Bf6Fb1F98361ed',
			},
			sAUD: {
				action: 'use-existing',
				existingInstance: '0xCb29D2cf2C65d3Be1d00F07f3441390432D55203',
			},
			sKRW: {
				action: 'use-existing',
				existingInstance: '0x249A10c68AfA9827571cb73f29ab5Af57Ee5A596',
			},
			sGBP: {
				action: 'use-existing',
				existingInstance: '0x7e88D19A79b291cfE5696d496055f7e57F537A75',
			},
			sCHF: {
				action: 'use-existing',
				existingInstance: '0x52496fE8a4feaEFe14d9433E00D48E6929c13deC',
			},
			sCNY: {
				action: 'deploy',
			},
			sSGD: {
				action: 'deploy',
			},
			sCAD: {
				action: 'deploy',
			},
			sRUB: {
				action: 'deploy',
			},
			sINR: {
				action: 'deploy',
			},
			sBRL: {
				action: 'deploy',
			},
			sNZD: {
				action: 'deploy',
			},
			sPLN: {
				action: 'deploy',
			},
			sXAU: {
				action: 'use-existing',
				existingInstance: '0x20569B49d74c1EDE765382574F7F3fdC2a078A4f',
			},
			sXAG: {
				action: 'deploy',
			},
			sBTC: {
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
console.log('defaultAccount', web3.eth.defaultAccount);

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
