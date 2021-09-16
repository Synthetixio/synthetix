'use strict';

const w3utils = require('web3-utils');
const abiDecoder = require('abi-decoder');

// load the data in explicitly (not programmatically) so webpack knows what to bundle
const data = {
	kovan: require('./publish/deployed/kovan'),
	mainnet: require('./publish/deployed/mainnet'),
	goerli: require('./publish/deployed/goerli'),
	'goerli-ovm': require('./publish/deployed/goerli-ovm'),
	'kovan-ovm': require('./publish/deployed/kovan-ovm'),
	'mainnet-ovm': require('./publish/deployed/mainnet-ovm'),
};

const assets = require('./publish/assets.json');
const ovmIgnored = require('./publish/ovm-ignore.json');
const nonUpgradeable = require('./publish/non-upgradeable.json');
const releases = require('./publish/releases.json');

const networks = ['local', 'kovan', 'mainnet', 'goerli'];

const chainIdMapping = Object.entries({
	1: {
		network: 'mainnet',
	},
	5: {
		network: 'goerli',
	},
	42: {
		network: 'kovan',
	},
	// Hardhat fork of mainnet: https://hardhat.org/config/#hardhat-network
	31337: {
		network: 'mainnet',
		fork: true,
	},

	// OVM networks: see https://github.com/ethereum-optimism/regenesis/
	10: {
		network: 'mainnet',
		useOvm: true,
	},
	69: {
		network: 'kovan',
		useOvm: true,
	},
	'-1': {
		// no chain ID for this currently
		network: 'goerli',
		useOvm: true,
	},
	// now append any defaults
}).reduce((memo, [id, body]) => {
	memo[id] = Object.assign({ useOvm: false, fork: false }, body);
	return memo;
}, {});

const getNetworkFromId = ({ id }) => chainIdMapping[id];

const networkToChainId = Object.entries(chainIdMapping).reduce(
	(memo, [id, { network, useOvm, fork }]) => {
		memo[network + (useOvm ? '-ovm' : '') + (fork ? '-fork' : '')] = id;
		return memo;
	},
	{}
);

const constants = {
	BUILD_FOLDER: 'build',
	CONTRACTS_FOLDER: 'contracts',
	MIGRATIONS_FOLDER: 'migrations',
	COMPILED_FOLDER: 'compiled',
	FLATTENED_FOLDER: 'flattened',
	AST_FOLDER: 'ast',

	CONFIG_FILENAME: 'config.json',
	RELEASES_FILENAME: 'releases.json',
	PARAMS_FILENAME: 'params.json',
	SYNTHS_FILENAME: 'synths.json',
	STAKING_REWARDS_FILENAME: 'rewards.json',
	SHORTING_REWARDS_FILENAME: 'shorting-rewards.json',
	OWNER_ACTIONS_FILENAME: 'owner-actions.json',
	DEPLOYMENT_FILENAME: 'deployment.json',
	VERSIONS_FILENAME: 'versions.json',
	FEEDS_FILENAME: 'feeds.json',

	AST_FILENAME: 'asts.json',

	ZERO_ADDRESS: '0x' + '0'.repeat(40),
	ZERO_BYTES32: '0x' + '0'.repeat(64),

	OVM_GAS_PRICE_GWEI: '0.015',

	inflationStartTimestampInSecs: 1551830400, // 2019-03-06T00:00:00Z
};

const knownAccounts = {
	mainnet: [
		{
			name: 'binance', // Binance 8 Wallet
			address: '0xF977814e90dA44bFA03b6295A0616a897441aceC',
		},
		{
			name: 'renBTCWallet', // KeeperDAO wallet (has renBTC and ETH)
			address: '0x35ffd6e268610e764ff6944d07760d0efe5e40e5',
		},
		{
			name: 'loansAccount',
			address: '0x62f7A1F94aba23eD2dD108F8D23Aa3e7d452565B',
		},
	],
};

// The solidity defaults are managed here in the same format they will be stored, hence all
// numbers are converted to strings and those with 18 decimals are also converted to wei amounts
const defaults = {
	WAITING_PERIOD_SECS: (60 * 5).toString(), // 5 mins
	PRICE_DEVIATION_THRESHOLD_FACTOR: w3utils.toWei('3'),
	TRADING_REWARDS_ENABLED: false,
	ISSUANCE_RATIO: w3utils
		.toBN(1)
		.mul(w3utils.toBN(1e18))
		.div(w3utils.toBN(6))
		.toString(), // 1/6 = 0.16666666667
	FEE_PERIOD_DURATION: (3600 * 24 * 7).toString(), // 1 week
	TARGET_THRESHOLD: '1', // 1% target threshold (it will be converted to a decimal when set)
	LIQUIDATION_DELAY: (3600 * 24 * 3).toString(), // 3 days
	LIQUIDATION_RATIO: w3utils.toWei('0.5'), // 200% cratio
	LIQUIDATION_PENALTY: w3utils.toWei('0.1'), // 10% penalty
	RATE_STALE_PERIOD: (3600 * 25).toString(), // 25 hours
	EXCHANGE_FEE_RATES: {
		forex: w3utils.toWei('0.003'),
		commodity: w3utils.toWei('0.003'),
		equities: w3utils.toWei('0.003'),
		crypto: w3utils.toWei('0.01'),
		index: w3utils.toWei('0.01'),
	},
	MINIMUM_STAKE_TIME: (3600 * 24).toString(), // 1 days
	DEBT_SNAPSHOT_STALE_TIME: (43800).toString(), // 12 hour heartbeat + 10 minutes mining time
	AGGREGATOR_WARNING_FLAGS: {
		mainnet: '0x4A5b9B4aD08616D11F3A402FF7cBEAcB732a76C6',
		kovan: '0x6292aa9a6650ae14fbf974e5029f36f95a1848fd',
	},
	RENBTC_ERC20_ADDRESSES: {
		mainnet: '0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D',
		kovan: '0x9B2fE385cEDea62D839E4dE89B0A23EF4eacC717',
	},
	WETH_ERC20_ADDRESSES: {
		mainnet: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
		kovan: '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
		goerli: '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6',
		'mainnet-ovm': '0x4200000000000000000000000000000000000006',
		'kovan-ovm': '0x4200000000000000000000000000000000000006',
	},
	INITIAL_ISSUANCE: w3utils.toWei(`${100e6}`),
	CROSS_DOMAIN_DEPOSIT_GAS_LIMIT: `${3e6}`,
	CROSS_DOMAIN_ESCROW_GAS_LIMIT: `${8e6}`,
	CROSS_DOMAIN_REWARD_GAS_LIMIT: `${8e6}`,
	CROSS_DOMAIN_WITHDRAWAL_GAS_LIMIT: `${3e6}`,

	COLLATERAL_MANAGER: {
		SYNTHS: ['sUSD', 'sBTC', 'sETH'],
		SHORTS: ['sBTC', 'sETH'],
		MAX_DEBT: w3utils.toWei('75000000'), // 75 million sUSD
		BASE_BORROW_RATE: Math.round((0.005 * 1e18) / 31556926).toString(), // 31556926 is CollateralManager seconds per year
		BASE_SHORT_RATE: Math.round((0.005 * 1e18) / 31556926).toString(),
	},
	COLLATERAL_ETH: {
		SYNTHS: ['sUSD', 'sETH'],
		MIN_CRATIO: w3utils.toWei('1.3'),
		MIN_COLLATERAL: w3utils.toWei('2'),
		ISSUE_FEE_RATE: w3utils.toWei('0.001'),
	},
	COLLATERAL_RENBTC: {
		SYNTHS: ['sUSD', 'sBTC'],
		MIN_CRATIO: w3utils.toWei('1.3'),
		MIN_COLLATERAL: w3utils.toWei('0.05'),
		ISSUE_FEE_RATE: w3utils.toWei('0.001'),
	},
	COLLATERAL_SHORT: {
		SYNTHS: ['sBTC', 'sETH'],
		MIN_CRATIO: w3utils.toWei('1.2'),
		MIN_COLLATERAL: w3utils.toWei('1000'),
		ISSUE_FEE_RATE: w3utils.toWei('0.005'),
		INTERACTION_DELAY: '3600', // 1 hour in secs
		COLLAPSE_FEE_RATE: '0',
	},

	ETHER_WRAPPER_MAX_ETH: w3utils.toWei('5000'),
	ETHER_WRAPPER_MINT_FEE_RATE: w3utils.toWei('0.02'), // 200 bps
	ETHER_WRAPPER_BURN_FEE_RATE: w3utils.toWei('0.0005'), // 5 bps
};

/**
 * Converts a string into a hex representation of bytes32, with right padding
 */
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);
const fromBytes32 = key => w3utils.hexToAscii(key);

const getFolderNameForNetwork = ({ network, useOvm = false }) => {
	if (network.includes('ovm')) {
		return network;
	}

	return useOvm ? `${network}-ovm` : network;
};

const getPathToNetwork = ({ network = 'mainnet', file = '', useOvm = false, path } = {}) =>
	path.join(__dirname, 'publish', 'deployed', getFolderNameForNetwork({ network, useOvm }), file);

// Pass in fs and path to avoid webpack wrapping those
const loadDeploymentFile = ({ network, path, fs, deploymentPath, useOvm = false }) => {
	if (!deploymentPath && network !== 'local' && (!path || !fs)) {
		return data[getFolderNameForNetwork({ network, useOvm })].deployment;
	}
	const pathToDeployment = deploymentPath
		? path.join(deploymentPath, constants.DEPLOYMENT_FILENAME)
		: getPathToNetwork({ network, useOvm, path, file: constants.DEPLOYMENT_FILENAME });

	if (!fs.existsSync(pathToDeployment)) {
		throw Error(`Cannot find deployment for network: ${network}.`);
	}
	return JSON.parse(fs.readFileSync(pathToDeployment));
};

/**
 * Retrieve the list of targets for the network - returning the name, address, source file and link to etherscan
 */
const getTarget = ({
	network = 'mainnet',
	useOvm = false,
	contract,
	path,
	fs,
	deploymentPath,
} = {}) => {
	const deployment = loadDeploymentFile({ network, useOvm, path, fs, deploymentPath });
	if (contract) return deployment.targets[contract];
	else return deployment.targets;
};

/**
 * Retrieve the list of solidity sources for the network - returning the abi and bytecode
 */
const getSource = ({
	network = 'mainnet',
	useOvm = false,
	contract,
	path,
	fs,
	deploymentPath,
} = {}) => {
	const deployment = loadDeploymentFile({ network, useOvm, path, fs, deploymentPath });
	if (contract) return deployment.sources[contract];
	else return deployment.sources;
};

/**
 * Retrieve the ASTs for the source contracts
 */
const getAST = ({ source, path, fs, match = /^contracts\// } = {}) => {
	let fullAST;
	if (path && fs) {
		const pathToAST = path.resolve(
			__dirname,
			constants.BUILD_FOLDER,
			constants.AST_FOLDER,
			constants.AST_FILENAME
		);
		if (!fs.existsSync(pathToAST)) {
			throw Error('Cannot find AST');
		}
		fullAST = JSON.parse(fs.readFileSync(pathToAST));
	} else {
		// Note: The below cannot be required as the build folder is not stored
		// in code (only in the published module).
		// The solution involves tracking these after each commit in another file
		// somewhere persisted in the codebase - JJM
		// 		data.ast = require('./build/ast/asts.json'),
		if (!data.ast) {
			throw Error('AST currently not supported in browser mode');
		}
		fullAST = data.ast;
	}

	// remove anything not matching the pattern
	const ast = Object.entries(fullAST)
		.filter(([astEntryKey]) => match.test(astEntryKey))
		.reduce((memo, [key, val]) => {
			memo[key] = val;
			return memo;
		}, {});

	if (source && source in ast) {
		return ast[source];
	} else if (source) {
		// try to find the source without a path
		const [key, entry] =
			Object.entries(ast).find(([astEntryKey]) => astEntryKey.includes('/' + source)) || [];
		if (!key || !entry) {
			throw Error(`Cannot find AST entry for source: ${source}`);
		}
		return { [key]: entry };
	} else {
		return ast;
	}
};

const getFeeds = ({ network, path, fs, deploymentPath, useOvm = false } = {}) => {
	let feeds;

	if (!deploymentPath && network !== 'local' && (!path || !fs)) {
		feeds = data[getFolderNameForNetwork({ network, useOvm })].feeds;
	} else {
		const pathToFeeds = deploymentPath
			? path.join(deploymentPath, constants.FEEDS_FILENAME)
			: getPathToNetwork({
					network,
					path,
					useOvm,
					file: constants.FEEDS_FILENAME,
			  });
		if (!fs.existsSync(pathToFeeds)) {
			throw Error(`Cannot find feeds file.`);
		}
		feeds = JSON.parse(fs.readFileSync(pathToFeeds));
	}

	const synths = getSynths({ network, useOvm, path, fs, deploymentPath, skipPopulate: true });

	// now mix in the asset data
	return Object.entries(feeds).reduce((memo, [asset, entry]) => {
		memo[asset] = Object.assign(
			// standalone feeds are those without a synth using them
			// Note: ETH still used as a rate for Depot, can remove the below once the Depot uses sETH rate or is
			// removed from the system
			{ standalone: !synths.find(synth => synth.asset === asset) || asset === 'ETH' },
			assets[asset],
			entry
		);
		return memo;
	}, {});
};

/**
 * Retrieve ths list of synths for the network - returning their names, assets underlying, category, sign, description, and
 * optional index and inverse properties
 */
const getSynths = ({
	network = 'mainnet',
	path,
	fs,
	deploymentPath,
	useOvm = false,
	skipPopulate = false,
} = {}) => {
	let synths;

	if (!deploymentPath && network !== 'local' && (!path || !fs)) {
		synths = data[getFolderNameForNetwork({ network, useOvm })].synths;
	} else {
		const pathToSynthList = deploymentPath
			? path.join(deploymentPath, constants.SYNTHS_FILENAME)
			: getPathToNetwork({ network, useOvm, path, file: constants.SYNTHS_FILENAME });
		if (!fs.existsSync(pathToSynthList)) {
			throw Error(`Cannot find synth list.`);
		}
		synths = JSON.parse(fs.readFileSync(pathToSynthList));
	}

	if (skipPopulate) {
		return synths;
	}

	const feeds = getFeeds({ network, useOvm, path, fs, deploymentPath });

	// copy all necessary index parameters from the longs to the corresponding shorts
	return synths.map(synth => {
		// mixin the asset details
		synth = Object.assign({}, assets[synth.asset], synth);

		if (feeds[synth.asset]) {
			const { feed } = feeds[synth.asset];

			synth = Object.assign({ feed }, synth);
		}

		if (synth.inverted) {
			synth.description = `Inverse ${synth.description}`;
		}
		// replace an index placeholder with the index details
		if (typeof synth.index === 'string') {
			const { index } = synths.find(({ name }) => name === synth.index) || {};
			if (!index) {
				throw Error(
					`While processing ${synth.name}, it's index mapping "${synth.index}" cannot be found - this is an error in the deployment config and should be fixed`
				);
			}
			synth = Object.assign({}, synth, { index });
		}

		if (synth.index) {
			synth.index = synth.index.map(indexEntry => {
				return Object.assign({}, assets[indexEntry.asset], indexEntry);
			});
		}

		return synth;
	});
};

/**
 * Retrieve the list of staking rewards for the network - returning this names, stakingToken, and rewardToken
 */
const getStakingRewards = ({
	network = 'mainnet',
	useOvm = false,
	path,
	fs,
	deploymentPath,
} = {}) => {
	if (!deploymentPath && network !== 'local' && (!path || !fs)) {
		return data[getFolderNameForNetwork({ network, useOvm })].rewards;
	}

	const pathToStakingRewardsList = deploymentPath
		? path.join(deploymentPath, constants.STAKING_REWARDS_FILENAME)
		: getPathToNetwork({
				network,
				path,
				useOvm,
				file: constants.STAKING_REWARDS_FILENAME,
		  });
	if (!fs.existsSync(pathToStakingRewardsList)) {
		return [];
	}
	return JSON.parse(fs.readFileSync(pathToStakingRewardsList));
};

/**
 * Retrieve the list of shorting rewards for the network - returning the names and rewardTokens
 */
const getShortingRewards = ({
	network = 'mainnet',
	useOvm = false,
	path,
	fs,
	deploymentPath,
} = {}) => {
	if (!deploymentPath && network !== 'local' && (!path || !fs)) {
		return data[getFolderNameForNetwork({ network, useOvm })]['shorting-rewards'];
	}

	const pathToShortingRewardsList = deploymentPath
		? path.join(deploymentPath, constants.SHORTING_REWARDS_FILENAME)
		: getPathToNetwork({
				network,
				path,
				useOvm,
				file: constants.SHORTING_REWARDS_FILENAME,
		  });
	if (!fs.existsSync(pathToShortingRewardsList)) {
		return [];
	}
	return JSON.parse(fs.readFileSync(pathToShortingRewardsList));
};

/**
 * Retrieve the list of system user addresses
 */
const getUsers = ({ network = 'mainnet', user, useOvm = false } = {}) => {
	const testnetOwner = '0x73570075092502472E4b61A7058Df1A4a1DB12f2';
	const base = {
		owner: testnetOwner,
		deployer: testnetOwner,
		marketClosure: testnetOwner,
		oracle: '0xac1e8B385230970319906C03A1d8567e3996d1d5',
		fee: '0xfeEFEEfeefEeFeefEEFEEfEeFeefEEFeeFEEFEeF',
		zero: '0x' + '0'.repeat(40),
	};

	const map = {
		mainnet: Object.assign({}, base, {
			owner: '0xEb3107117FEAd7de89Cd14D463D340A2E6917769',
			deployer: '0xDe910777C787903F78C89e7a0bf7F4C435cBB1Fe',
			marketClosure: '0xC105Ea57Eb434Fbe44690d7Dec2702e4a2FBFCf7',
			oracle: '0xaC1ED4Fabbd5204E02950D68b6FC8c446AC95362',
		}),
		kovan: Object.assign({}, base),
		'kovan-ovm': Object.assign({}, base),
		'mainnet-ovm': Object.assign({}, base, {
			owner: '0xDe910777C787903F78C89e7a0bf7F4C435cBB1Fe',
		}),
		rinkeby: Object.assign({}, base),
		ropsten: Object.assign({}, base),
		goerli: Object.assign({}, base),
		'goerli-ovm': Object.assign({}, base),
		local: Object.assign({}, base, {
			// Deterministic account #0 when using `npx hardhat node`
			owner: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
		}),
	};

	const users = Object.entries(
		map[getFolderNameForNetwork({ network, useOvm })]
	).map(([key, value]) => ({ name: key, address: value }));

	return user ? users.find(({ name }) => name === user) : users;
};

const getVersions = ({
	network = 'mainnet',
	path,
	fs,
	deploymentPath,
	useOvm,
	byContract = false,
} = {}) => {
	let versions;

	if (!deploymentPath && network !== 'local' && (!path || !fs)) {
		versions = data[getFolderNameForNetwork({ network, useOvm })].versions;
	} else {
		const pathToVersions = deploymentPath
			? path.join(deploymentPath, constants.VERSIONS_FILENAME)
			: getPathToNetwork({ network, useOvm, path, file: constants.VERSIONS_FILENAME });
		if (!fs.existsSync(pathToVersions)) {
			throw Error(`Cannot find versions for network.`);
		}
		versions = JSON.parse(fs.readFileSync(pathToVersions));
	}

	if (byContract) {
		// compile from the contract perspective
		return Object.values(versions).reduce(
			(memo, { tag, release, date, commit, block, contracts }) => {
				for (const [contract, contractEntry] of Object.entries(contracts)) {
					memo[contract] = memo[contract] || [];
					memo[contract].push(Object.assign({ tag, release, date, commit, block }, contractEntry));
				}
				return memo;
			},
			{}
		);
	}
	return versions;
};

const getSuspensionReasons = ({ code = undefined } = {}) => {
	const suspensionReasonMap = {
		1: 'System Upgrade',
		2: 'Market Closure',
		4: 'iSynth Reprice',
		6: 'Index Rebalance',
		55: 'Circuit Breaker (Phase one)', // https://sips.synthetix.io/SIPS/sip-55
		65: 'Decentralized Circuit Breaker (Phase two)', // https://sips.synthetix.io/SIPS/sip-65
		99999: 'Emergency',
	};

	return code ? suspensionReasonMap[code] : suspensionReasonMap;
};

/**
 * Retrieve the list of tokens used in the Synthetix protocol
 */
const getTokens = ({ network = 'mainnet', path, fs, useOvm = false } = {}) => {
	const synths = getSynths({ network, useOvm, path, fs });
	const targets = getTarget({ network, useOvm, path, fs });
	const feeds = getFeeds({ network, useOvm, path, fs });

	return [
		Object.assign(
			{
				symbol: 'SNX',
				asset: 'SNX',
				name: 'Synthetix',
				address: targets.ProxyERC20.address,
				decimals: 18,
			},
			feeds['SNX'].feed ? { feed: feeds['SNX'].feed } : {}
		),
	].concat(
		synths
			.filter(({ category }) => category !== 'internal')
			.map(synth => ({
				symbol: synth.name,
				asset: synth.asset,
				name: synth.description,
				address: (targets[`Proxy${synth.name === 'sUSD' ? 'ERC20sUSD' : synth.name}`] || {})
					.address,
				index: synth.index,
				inverted: synth.inverted,
				decimals: 18,
				feed: synth.feed,
			}))
			.sort((a, b) => (a.symbol > b.symbol ? 1 : -1))
	);
};

const decode = ({ network = 'mainnet', fs, path, data, target, useOvm = false } = {}) => {
	const sources = getSource({ network, path, fs, useOvm });
	for (const { abi } of Object.values(sources)) {
		abiDecoder.addABI(abi);
	}
	const targets = getTarget({ network, path, fs, useOvm });
	let contract;
	if (target) {
		contract = Object.values(targets).filter(
			({ address }) => address.toLowerCase() === target.toLowerCase()
		)[0].name;
	}
	return { method: abiDecoder.decodeMethod(data), contract };
};

const wrap = ({ network, deploymentPath, fs, path, useOvm = false }) =>
	[
		'decode',
		'getAST',
		'getPathToNetwork',
		'getSource',
		'getStakingRewards',
		'getShortingRewards',
		'getFeeds',
		'getSynths',
		'getTarget',
		'getTokens',
		'getUsers',
		'getVersions',
	].reduce((memo, fnc) => {
		memo[fnc] = (prop = {}) =>
			module.exports[fnc](Object.assign({ network, deploymentPath, fs, path, useOvm }, prop));
		return memo;
	}, {});

module.exports = {
	chainIdMapping,
	constants,
	decode,
	defaults,
	getAST,
	getNetworkFromId,
	getPathToNetwork,
	getSource,
	getStakingRewards,
	getShortingRewards,
	getSuspensionReasons,
	getFeeds,
	getSynths,
	getTarget,
	getTokens,
	getUsers,
	getVersions,
	networks,
	networkToChainId,
	toBytes32,
	fromBytes32,
	wrap,
	ovmIgnored,
	nonUpgradeable,
	releases,
	knownAccounts,
};
