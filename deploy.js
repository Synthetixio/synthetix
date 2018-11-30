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
	verifyContracts: true,
	synths: ['XDR', 'sUSD', 'sEUR', 'sJPY', 'sAUD', 'sKRW', 'sXAU'],
	contracts: {
		ExchangeRates: {
			action: 'use-existing',
			existingInstance: '0xd9c19368d3cE48dB78Ebdbea95699f3f2291E2d1',
		},
		FeePool: {
			action: 'use-existing',
			existingInstance: '0x8d3B277B66F0A6baBaB566b104B52a6B0459b6b2',
		},
		Synthetix: {
			action: 'use-existing',
			existingInstance: '0x6Fb1d15aBAE4205050A74Df887C0832AE9AcB9b9',
		},
		SynthetixEscrow: {
			action: 'use-existing',
			existingInstance: '0xE6fFb8a5F954E4473276B4A50506AD76AeF906E3',
		},
		SynthetixState: {
			action: 'use-existing',
			existingInstance: '0xcB579e80cbFc7e50388Da5bc507187b1Cb620620',
		},
		Synth: {
			XDR: {
				action: 'use-existing',
				existingInstance: '0x8EfAc1173c63B4feCe34C1A6Ff9484249d7da17B',
			},
			sUSD: {
				action: 'use-existing',
				existingInstance: '0x6C127031976F3E3195D9669F37D0748554D374AB',
			},
			sEUR: {
				action: 'use-existing',
				existingInstance: '0x39B0df0b4B051DAc4c39AAaD750E7166BdDF6632',
			},
			sJPY: {
				action: 'use-existing',
				existingInstance: '0xEE06cb93F88ba08A2a608F8a9B51485906584Ee8',
			},
			sAUD: {
				action: 'use-existing',
				existingInstance: '0x4a3EcF6a282BD90d0a5d54b4621Ea17fB63D4f71',
			},
			sKRW: {
				action: 'use-existing',
				existingInstance: '0x5DF32526Ef74CfF66c3C3BF501dbfF46AAE03CbA',
			},
			sXAU: {
				action: 'use-existing',
				existingInstance: '0x45Fd6190e8059bF21ffBC1bb09a72d4aFEba99a0',
			},
		},
		Proxy: {
			FeePool: {
				action: 'use-existing',
				existingInstance: '0x46208405b17000331dA99F6BC29697d709e396d3',
			},
			Synthetix: {
				action: 'use-existing',
				existingInstance: '0xA018Afa45F97E4692b7cba2b8FF19D11dcF0337B',
			},
			XDR: {
				action: 'use-existing',
				existingInstance: '0xe239E2bdC7B4eEce218e66511E31aC857D3F568F',
			},
			sUSD: {
				action: 'use-existing',
				existingInstance: '0x8DAE1b5Db3dAC2e973375B3Cb96a9Cb55ad90a08',
			},
			sEUR: {
				action: 'use-existing',
				existingInstance: '0x37989ac036F6106dC5770CC320Ea8D85c45FCc93',
			},
			sJPY: {
				action: 'use-existing',
				existingInstance: '0x9b814d1cf94B9307026F83E797AF5bc46cB54Ee6',
			},
			sAUD: {
				action: 'use-existing',
				existingInstance: '0x6dcDE527a0A65B1517Cd510D93DD8135Ae127184',
			},
			sKRW: {
				action: 'use-existing',
				existingInstance: '0x33b14EC4Ab8dA71F00F240c91Efc72ab631b0670',
			},
			sXAU: {
				action: 'use-existing',
				existingInstance: '0xdbA75834fFaBD665e96170dB7be8e86Fc54601C3',
			},
		},
		SafeDecimalMath: {
			action: 'use-existing',
			existingInstance: '0xecDCbD4C5948FaCbD93E47792B7d2fEC3E7166f6',
		},
		TokenState: {
			Synthetix: {
				action: 'use-existing',
				existingInstance: '0xDfBA72F2cCacA496a3012A27351D610eb88677Aa',
			},
			XDR: {
				action: 'use-existing',
				existingInstance: '0x7730940cab2F63645eCd80c98b5e30448715A3B3',
			},
			sUSD: {
				action: 'use-existing',
				existingInstance: '0xD739F98B36F53D1511AB7d1e12aA11D9985D4242',
			},
			sEUR: {
				action: 'use-existing',
				existingInstance: '0x723C9C73bDA0C3d4A5487845425c2d32b8658c30',
			},
			sJPY: {
				action: 'use-existing',
				existingInstance: '0xA904c561939164a350a26a817d9e9620fE41c6DE',
			},
			sAUD: {
				action: 'use-existing',
				existingInstance: '0x33e9b09243B07369fEb107D4B56EcD85732368BF',
			},
			sKRW: {
				action: 'use-existing',
				existingInstance: '0x4dfE0232291B1bD6e010dd2e24BF743b3C66843D',
			},
			sXAU: {
				action: 'use-existing',
				existingInstance: '0x27B3173557f03ED855961eF3e916F23aAA85b0E4',
			},
		},
	},
};

// --------------------------------------------------------------

const axios = require('axios');
const fs = require('fs');
const linker = require('solc/linker');
const path = require('path');
const qs = require('querystring');
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
			// console.log(
			// 	'Sending ',
			// 	qs.stringify({
			// 		module: 'contract',
			// 		action: 'verifysourcecode',
			// 		contractaddress: deployedContracts[contract].options.address,
			// 		sourceCode: flattenedContracts[`${contractName}.sol`].content,
			// 		contractname: contractName,
			// 		compilerversion: 'v' + solc.version().replace('.Emscripten.clang', ''), // The version reported by solc-js is too verbose and needs a v at the front
			// 		optimizationUsed: 1,
			// 		runs: 200,
			// 		libraryname1: 'SafeDecimalMath',
			// 		libraryaddress1: deployedContracts.SafeDecimalMath.options.address,
			// 		apikey: process.env.ETHERSCAN_KEY,
			// 	})
			// );

			result = await axios.post(
				etherscanUrl,
				qs.stringify({
					module: 'contract',
					action: 'verifysourcecode',
					contractaddress: deployedContracts[contract].options.address,
					sourceCode: flattenedContracts[`${contractName}.sol`].content,
					contractname: contractName,
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

const deploy = async () => {
	await deployContract('SafeDecimalMath');

	const exchangeRates = await deployContract('ExchangeRates', [
		account,
		account,
		[web3.utils.asciiToHex('sUSD'), web3.utils.asciiToHex('SNX')],
		[web3.utils.toWei('1', 'ether'), web3.utils.toWei('0.2', 'ether')],
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
		await feePoolProxy.methods.setTarget(feePool.address).send(sendParameters());
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
		settings.contracts.synthetixEscrow.action === 'deploy'
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

		if (
			settings.contracts.Synth[currencyKey].action === 'deploy' ||
			settings.contracts.Synthetix.action === 'deploy'
		) {
			console.log(`Adding ${currencyKey} to Synthetix contract...`);

			await synthetix.methods.addSynth(synth.options.address).send(sendParameters());
		}
	}

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
	.then(() => verifyContracts());
