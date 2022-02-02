'use strict';

const fs = require('fs');
const qs = require('querystring');
const solc = require('solc');
const axios = require('axios');
const path = require('path');
const ethers = require('ethers');
const { gray, green, yellow } = require('chalk');
const {
	getUsers,
	constants: { FLATTENED_FOLDER },
} = require('../../..');
const { loadCompiledFiles, getLatestSolTimestamp } = require('../solidity');

const { optimizerRuns } = require('./build').DEFAULTS;

const {
	ensureNetwork,
	loadConnections,
	confirmAction,
	parameterNotice,
	loadAndCheckRequiredSources,
	appendOwnerActionGenerator,
} = require('../util');
const { performTransactionalStep } = require('../command-utils/transact');

const {
	wrap,
	constants: { BUILD_FOLDER, CONTRACTS_FOLDER },
} = require('../../..');

const DEFAULTS = {
	priorityGasPrice: '1',
	network: 'kovan',
	buildPath: path.join(__dirname, '..', '..', '..', BUILD_FOLDER),
	rewardsToDeploy: [],
};

const deployMigration = async ({
	releaseName,
	maxFeePerGas,
	maxPriorityFeePerGas = DEFAULTS.priorityGasPrice,
	network = DEFAULTS.network,
	useOvm,
	buildPath = DEFAULTS.buildPath,
	privateKey,
	yes,
	dryRun = false,
} = {}) => {
	ensureNetwork(network);

	console.log(
		gray('Checking all contracts not flagged for deployment have addresses in this network...')
	);

	console.log(gray('Loading the compiled contracts locally...'));
	const { earliestCompiledTimestamp, compiled } = loadCompiledFiles({ buildPath });

	// now get the latest time a Solidity file was edited
	const latestSolTimestamp = getLatestSolTimestamp(CONTRACTS_FOLDER);

	const {
		providerUrl,
		privateKey: envPrivateKey,
		etherscanUrl,
		explorerLinkPrefix,
	} = loadConnections({
		network,
		useOvm,
	});

	// allow local deployments to use the private key passed as a CLI option
	if (network !== 'local' || !privateKey) {
		privateKey = envPrivateKey;
	}

	const provider = new ethers.providers.JsonRpcProvider(providerUrl);

	const ownerAddress = getUsers({ network, useOvm, user: 'owner' }).address;

	let signer = null;
	if (network === 'local' && !privateKey) {
		signer = provider.getSigner(ownerAddress);
		signer.address = ownerAddress;
	} else {
		signer = new ethers.Wallet(privateKey, provider);
	}

	parameterNotice({
		'Dry Run': dryRun ? green('true') : yellow('⚠ NO'),
		Network: network,
		'Use OVM': useOvm,
		Gas: `Base fee ${maxFeePerGas} GWEI, miner tip ${maxPriorityFeePerGas} GWEI`,
		'Local build last modified': `${new Date(earliestCompiledTimestamp)} ${yellow(
			((new Date().getTime() - earliestCompiledTimestamp) / 60000).toFixed(2) + ' mins ago'
		)}`,
		'Last Solidity update':
			new Date(latestSolTimestamp) +
			(latestSolTimestamp > earliestCompiledTimestamp
				? yellow(' ⚠⚠⚠ this is later than the last build! Is this intentional?')
				: green(' ✅')),
		'Release Name': releaseName,
		'Deployer account:': signer.address,
	});

	if (!yes) {
		try {
			await confirmAction(
				yellow(
					`⚠⚠⚠ WARNING: This action will deploy the following contracts to ${network}:\nMigration_${releaseName}\n`
				) +
					gray('-'.repeat(50)) +
					'\nDo you want to continue? (y/n) '
			);
		} catch (err) {
			console.log(gray('Operation cancelled'));
			return;
		}
	}

	console.log(gray(`Starting deployment to ${network.toUpperCase()}...`));

	const migrationContract = new ethers.ContractFactory(
		compiled['Migration_' + releaseName].abi,
		compiled['Migration_' + releaseName].evm.bytecode.object,
		signer
	);

	const deployedContract = await migrationContract.deploy();

	console.log(green(`\nSuccessfully deployed: ${deployedContract.address}\n`));

	const { getPathToNetwork } = wrap({
		network,
		useOvm,
		fs,
		path,
	});

	// always appending to mainnet owner actions now
	const { ownerActions, ownerActionsFile } = loadAndCheckRequiredSources({
		deploymentPath: getPathToNetwork({ network, useOvm }),
		network,
	});

	// append to owner actions if supplied
	const appendOwnerAction = appendOwnerActionGenerator({
		ownerActions,
		ownerActionsFile,
		// 'https://',
	});

	// run nominations
	const requiringOwnership = await deployedContract.contractsRequiringOwnership();

	for (const addr of requiringOwnership) {
		console.log('Nominating ownership: ', addr);

		const contract = new ethers.Contract(addr, compiled['Owned'].abi, signer);
		await performTransactionalStep({
			account: signer.address,
			contract: contract.address,
			target: contract,
			write: 'nominateNewOwner',
			writeArg: [deployedContract.address],

			signer,
			explorerLinkPrefix,
			ownerActions,
			ownerActionsFile,
		});
	}

	const actionName = `Migration_${releaseName}.migrate(${ownerAddress})`;
	const txn = await deployedContract.populateTransaction.migrate(ownerAddress);

	const ownerAction = {
		key: actionName,
		target: txn.to,
		action: actionName,
		data: txn.data,
	};

	appendOwnerAction(ownerAction);

	await verifyMigrationContract({ deployedContract, releaseName, buildPath, etherscanUrl });

	console.log(gray(`Done.`));
};

async function verifyMigrationContract({ deployedContract, releaseName, buildPath, etherscanUrl }) {
	const readFlattened = () => {
		const flattenedFilename = path.join(
			buildPath,
			FLATTENED_FOLDER,
			`migrations/Migration_${releaseName}.sol`
		);
		try {
			return fs.readFileSync(flattenedFilename).toString();
		} catch (err) {
			throw Error(`Cannot read file ${flattenedFilename}`);
		}
	};

	const runs = optimizerRuns;

	// The version reported by solc-js is too verbose and needs a v at the front
	const solcVersion = 'v' + solc.version().replace('.Emscripten.clang', '');

	const payload = {
		module: 'contract',
		action: 'verifysourcecode',
		contractaddress: deployedContract.address,
		sourceCode: readFlattened(),
		contractName: 'Migration_' + releaseName,
		constructorArguements: '',
		compilerversion: solcVersion,
		optimizationUsed: 1,
		runs,
		apikey: process.env.ETHERSCAN_KEY,
	};

	console.log('verify on etherscan:', payload);

	const response = await axios.post(etherscanUrl, qs.stringify(payload), {
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
	});

	console.log(green('etherscan verify response:'), response.data.message);
}

module.exports = {
	deployMigration,
	DEFAULTS,
	cmd: program =>
		program
			.command('deploy-migration')
			.description('Deploys a migration script')
			.option('-r, --release-name <name>', `Deploys migration contract corresponding to thi name`)
			.option('-g, --max-fee-per-gas <value>', 'Maximum base gas fee price in GWEI')
			.option(
				'--max-priority-fee-per-gas <value>',
				'Priority gas fee price in GWEI',
				DEFAULTS.priorityGasPrice
			)
			.option(
				'-n, --network <value>',
				'The network to run off.',
				x => x.toLowerCase(),
				DEFAULTS.network
			)
			.option('--use-ovm', 'Use OVM')
			.option(
				'-r, --dry-run',
				'If enabled, will not run any transactions but merely report on them.'
			)
			.option(
				'-v, --private-key [value]',
				'The private key to deploy with (only works in local mode, otherwise set in .env).'
			)
			.option('-y, --yes', 'Dont prompt, just reply yes.')
			.action(deployMigration),
};
