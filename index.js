'use strict';

const w3utils = require('web3-utils');
const abiDecoder = require('abi-decoder');

// load the data in explicitly (not programmatically) so webpack knows what to bundle
const data = {
	kovan: {
		deployment: require('./publish/deployed/kovan/deployment.json'),
		versions: require('./publish/deployed/kovan/versions.json'),
		synths: require('./publish/deployed/kovan/synths.json'),
		rewards: require('./publish/deployed/kovan/rewards.json'),
		feeds: require('./publish/deployed/kovan/feeds.json'),
	},
	rinkeby: {
		deployment: require('./publish/deployed/rinkeby/deployment.json'),
		versions: require('./publish/deployed/rinkeby/versions.json'),
		synths: require('./publish/deployed/rinkeby/synths.json'),
		rewards: require('./publish/deployed/rinkeby/rewards.json'),
		feeds: require('./publish/deployed/rinkeby/feeds.json'),
	},
	ropsten: {
		deployment: require('./publish/deployed/ropsten/deployment.json'),
		versions: require('./publish/deployed/ropsten/versions.json'),
		synths: require('./publish/deployed/ropsten/synths.json'),
		rewards: require('./publish/deployed/ropsten/rewards.json'),
		feeds: require('./publish/deployed/ropsten/feeds.json'),
	},
	mainnet: {
		deployment: require('./publish/deployed/mainnet/deployment.json'),
		versions: require('./publish/deployed/mainnet/versions.json'),
		synths: require('./publish/deployed/mainnet/synths.json'),
		rewards: require('./publish/deployed/mainnet/rewards.json'),
		feeds: require('./publish/deployed/mainnet/feeds.json'),
	},
};

const assets = require('./publish/assets.json');

const networks = ['local', 'kovan', 'rinkeby', 'ropsten', 'mainnet'];

const networkToChainId = {
	mainnet: 1,
	ropsten: 3,
	rinkeby: 4,
	kovan: 42,
};

const constants = {
	BUILD_FOLDER: 'build',
	CONTRACTS_FOLDER: 'contracts',
	COMPILED_FOLDER: 'compiled',
	FLATTENED_FOLDER: 'flattened',
	AST_FOLDER: 'ast',

	CONFIG_FILENAME: 'config.json',
	SYNTHS_FILENAME: 'synths.json',
	STAKING_REWARDS_FILENAME: 'rewards.json',
	OWNER_ACTIONS_FILENAME: 'owner-actions.json',
	DEPLOYMENT_FILENAME: 'deployment.json',
	VERSIONS_FILENAME: 'versions.json',
	FEEDS_FILENAME: 'feeds.json',

	AST_FILENAME: 'asts.json',

	ZERO_ADDRESS: '0x' + '0'.repeat(40),

	inflationStartTimestampInSecs: 1551830400, // 2019-03-06T00:00:00Z
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
		crypto: w3utils.toWei('0.003'),
		index: w3utils.toWei('0.003'),
	},
	MINIMUM_STAKE_TIME: (3600 * 24).toString(), // 1 days
	AGGREGATOR_WARNING_FLAGS: {
		mainnet: '0x4A5b9B4aD08616D11F3A402FF7cBEAcB732a76C6',
		kovan: '0x6292aa9a6650ae14fbf974e5029f36f95a1848fd',
	},
};

/**
 * Converts a string into a hex representation of bytes32, with right padding
 */
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);

const getPathToNetwork = ({ network = 'mainnet', file = '', path } = {}) =>
	path.join(__dirname, 'publish', 'deployed', network, file);

// Pass in fs and path to avoid webpack wrapping those
const loadDeploymentFile = ({ network, path, fs, deploymentPath }) => {
	if (!deploymentPath && network !== 'local' && (!path || !fs)) {
		return data[network].deployment;
	}
	const pathToDeployment = deploymentPath
		? path.join(deploymentPath, constants.DEPLOYMENT_FILENAME)
		: getPathToNetwork({ network, path, file: constants.DEPLOYMENT_FILENAME });
	if (!fs.existsSync(pathToDeployment)) {
		throw Error(`Cannot find deployment for network: ${network}.`);
	}
	return JSON.parse(fs.readFileSync(pathToDeployment));
};

/**
 * Retrieve the list of targets for the network - returning the name, address, source file and link to etherscan
 */
const getTarget = ({ network = 'mainnet', contract, path, fs, deploymentPath } = {}) => {
	const deployment = loadDeploymentFile({ network, path, fs, deploymentPath });
	if (contract) return deployment.targets[contract];
	else return deployment.targets;
};

/**
 * Retrieve the list of solidity sources for the network - returning the abi and bytecode
 */
const getSource = ({ network = 'mainnet', contract, path, fs, deploymentPath } = {}) => {
	const deployment = loadDeploymentFile({ network, path, fs, deploymentPath });
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

const getFeeds = ({ network, path, fs, deploymentPath } = {}) => {
	let feeds;

	if (!deploymentPath && network !== 'local' && (!path || !fs)) {
		feeds = data[network].feeds;
	} else {
		const pathToFeeds = deploymentPath
			? path.join(deploymentPath, constants.FEEDS_FILENAME)
			: getPathToNetwork({
					network,
					path,
					file: constants.FEEDS_FILENAME,
			  });
		if (!fs.existsSync(pathToFeeds)) {
			throw Error(`Cannot find feeds file.`);
		}
		feeds = JSON.parse(fs.readFileSync(pathToFeeds));
	}

	// now mix in the asset data
	return Object.entries(feeds).reduce((memo, [asset, entry]) => {
		memo[asset] = Object.assign({}, assets[asset], entry);
		return memo;
	}, {});
};
/**
 * Retrieve ths list of synths for the network - returning their names, assets underlying, category, sign, description, and
 * optional index and inverse properties
 */
const getSynths = ({ network = 'mainnet', path, fs, deploymentPath } = {}) => {
	let synths;

	if (!deploymentPath && network !== 'local' && (!path || !fs)) {
		synths = data[network].synths;
	} else {
		const pathToSynthList = deploymentPath
			? path.join(deploymentPath, constants.SYNTHS_FILENAME)
			: getPathToNetwork({ network, path, file: constants.SYNTHS_FILENAME });
		if (!fs.existsSync(pathToSynthList)) {
			throw Error(`Cannot find synth list.`);
		}
		synths = JSON.parse(fs.readFileSync(pathToSynthList));
	}

	const feeds = getFeeds({ network, path, fs, deploymentPath });

	// copy all necessary index parameters from the longs to the corresponding shorts
	return synths.map(synth => {
		// mixin the asset details
		synth = Object.assign({}, assets[synth.asset], synth);

		if (feeds[synth.asset]) {
			// mixing the feed
			synth = Object.assign({}, feeds[synth.asset], synth);
		}

		if (synth.inverted) {
			synth.desc = `Inverse ${synth.desc}`;
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
const getStakingRewards = ({ network = 'mainnet', path, fs, deploymentPath } = {}) => {
	if (!deploymentPath && network !== 'local' && (!path || !fs)) {
		return data[network].rewards;
	}

	const pathToStakingRewardsList = deploymentPath
		? path.join(deploymentPath, constants.STAKING_REWARDS_FILENAME)
		: getPathToNetwork({
				network,
				path,
				file: constants.STAKING_REWARDS_FILENAME,
		  });
	if (!fs.existsSync(pathToStakingRewardsList)) {
		return [];
	}
	return JSON.parse(fs.readFileSync(pathToStakingRewardsList));
};

/**
 * Retrieve the list of system user addresses
 */
const getUsers = ({ network = 'mainnet', user } = {}) => {
	const testnetOwner = '0xB64fF7a4a33Acdf48d97dab0D764afD0F6176882';
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
		rinkeby: Object.assign({}, base),
		ropsten: Object.assign({}, base),
	};

	const users = Object.entries(map[network]).map(([key, value]) => ({ name: key, address: value }));

	return user ? users.find(({ name }) => name === user) : users;
};

const getVersions = ({
	network = 'mainnet',
	path,
	fs,
	deploymentPath,
	byContract = false,
} = {}) => {
	let versions;

	if (!deploymentPath && network !== 'local' && (!path || !fs)) {
		versions = data[network].versions;
	} else {
		const pathToVersions = deploymentPath
			? path.join(deploymentPath, constants.VERSIONS_FILENAME)
			: getPathToNetwork({ network, path, file: constants.VERSIONS_FILENAME });
		if (!fs.existsSync(pathToVersions)) {
			throw Error(`Cannot find versions for network.`);
		}
		versions = JSON.parse(fs.readFileSync(pathToVersions));
	}

	if (byContract) {
		// compile from the contract perspective
		return Object.values(versions).reduce((memo, entry) => {
			for (const [contract, contractEntry] of Object.entries(entry.contracts)) {
				memo[contract] = memo[contract] || [];
				memo[contract].push(contractEntry);
			}
			return memo;
		}, {});
	}
	return versions;
};

const getSuspensionReasons = ({ code = undefined } = {}) => {
	const suspensionReasonMap = {
		1: 'System Upgrade',
		2: 'Market Closure',
		55: 'Circuit Breaker (Phase one)', // https://sips.synthetix.io/SIPS/sip-55
		65: 'Decentralized Circuit Breaker (Phase two)', // https://sips.synthetix.io/SIPS/sip-65
		99999: 'Emergency',
	};

	return code ? suspensionReasonMap[code] : suspensionReasonMap;
};

/**
 * Retrieve the list of tokens used in the Synthetix protocol
 */
const getTokens = ({ network = 'mainnet', path, fs } = {}) => {
	const synths = getSynths({ network, path, fs });
	const targets = getTarget({ network, path, fs });

	return [
		{
			symbol: 'SNX',
			name: 'Synthetix',
			address: targets.ProxyERC20.address,
			decimals: 18,
		},
	].concat(
		synths
			.filter(({ category }) => category !== 'internal')
			.map(synth => ({
				symbol: synth.name,
				asset: synth.asset,
				name: synth.desc,
				address: targets[`Proxy${synth.name === 'sUSD' ? 'ERC20sUSD' : synth.name}`].address,
				index: synth.index,
				inverted: synth.inverted,
				decimals: 18,
				feed: synth.feed,
			}))
			.sort((a, b) => (a.symbol > b.symbol ? 1 : -1))
	);
};

const decode = ({ network = 'mainnet', fs, path, data, target } = {}) => {
	const sources = getSource({ network, path, fs });
	for (const { abi } of Object.values(sources)) {
		abiDecoder.addABI(abi);
	}
	const targets = getTarget({ network, path, fs });
	let contract;
	if (target) {
		contract = Object.values(targets).filter(
			({ address }) => address.toLowerCase() === target.toLowerCase()
		)[0].name;
	}
	return { method: abiDecoder.decodeMethod(data), contract };
};

const wrap = ({ network, fs, path }) =>
	[
		'decode',
		'getAST',
		'getPathToNetwork',
		'getSource',
		'getStakingRewards',
		'getFeeds',
		'getSynths',
		'getTarget',
		'getTokens',
		'getUsers',
		'getVersions',
	].reduce((memo, fnc) => {
		memo[fnc] = (prop = {}) => module.exports[fnc](Object.assign({ network, fs, path }, prop));
		return memo;
	}, {});

module.exports = {
	constants,
	decode,
	defaults,
	getAST,
	getPathToNetwork,
	getSource,
	getStakingRewards,
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
	wrap,
};
