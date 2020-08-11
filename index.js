/* eslint-disable node/no-unpublished-require */
'use strict';

const w3utils = require('web3-utils');

// load the data in explicitly (not programmatically) so webpack knows what to bundle
const data = {
	// TODO The below must be moved out from the build folder
	// ast: require('./build/ast/asts.json'),
	kovan: {
		deployment: require('./publish/deployed/kovan/deployment.json'),
		versions: require('./publish/deployed/kovan/versions.json'),
		synths: require('./publish/deployed/kovan/synths.json'),
		rewards: require('./publish/deployed/kovan/rewards.json'),
	},
	rinkeby: {
		deployment: require('./publish/deployed/rinkeby/deployment.json'),
		versions: require('./publish/deployed/rinkeby/versions.json'),
		synths: require('./publish/deployed/rinkeby/synths.json'),
		rewards: require('./publish/deployed/rinkeby/rewards.json'),
	},
	ropsten: {
		deployment: require('./publish/deployed/ropsten/deployment.json'),
		versions: require('./publish/deployed/ropsten/versions.json'),
		synths: require('./publish/deployed/ropsten/synths.json'),
		rewards: require('./publish/deployed/ropsten/rewards.json'),
	},
	mainnet: {
		deployment: require('./publish/deployed/mainnet/deployment.json'),
		versions: require('./publish/deployed/mainnet/versions.json'),
		synths: require('./publish/deployed/mainnet/synths.json'),
		rewards: require('./publish/deployed/mainnet/rewards.json'),
	},
};

const networks = ['local', 'kovan', 'rinkeby', 'ropsten', 'mainnet'];

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

	AST_FILENAME: 'asts.json',

	ZERO_ADDRESS: '0x' + '0'.repeat(40),

	inflationStartTimestampInSecs: 1551830400, // 2019-03-06T00:00:00Z
};

// The solidity defaults are managed here in the same format they will be stored, hence all
// numbers are converted to strings and those with 18 decimals are also converted to wei amounts
const defaults = {
	WAITING_PERIOD_SECS: '180',
	PRICE_DEVIATION_THRESHOLD_FACTOR: w3utils.toWei('3'),
	ISSUANCE_RATIO: w3utils
		.toBN(2)
		.mul(w3utils.toBN(1e18))
		.div(w3utils.toBN(15))
		.toString(), // 2e18/15 = 0.133333333e18
	FEE_PERIOD_DURATION: (3600 * 24 * 7).toString(), // 1 week
	TARGET_THRESHOLD: '1', // 1% target threshold (it will be converted to a decimal when set)
	LIQUIDATION_DELAY: (3600 * 24 * 14).toString(), // 2 weeks
	LIQUIDATION_RATIO: w3utils.toWei('0.5'), // 200% cratio
	LIQUIDATION_PENALTY: w3utils.toWei('0.1'), // 10% penalty
	RATE_STALE_PERIOD: (3600 * 3).toString(), // 3 hours
	EXCHANGE_FEE_RATES: {
		forex: w3utils.toWei('0.003'),
		commodity: w3utils.toWei('0.01'),
		equities: w3utils.toWei('0.005'),
		crypto: w3utils.toWei('0.003'),
		index: w3utils.toWei('0.003'),
	},
	MINIMUM_STAKE_TIME: (3600 * 24 * 7).toString(), // 1 week
};

/**
 * Converts a string into a hex representation of bytes32, with right padding
 */
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);

const loadDeploymentFile = ({ network }) => data[network].deployment;

/**
 * Retrieve the list of targets for the network - returning the name, address, source file and link to etherscan
 */
const getTarget = ({ network = 'mainnet', contract } = {}) => {
	const deployment = loadDeploymentFile({ network });
	if (contract) return deployment.targets[contract];
	else return deployment.targets;
};

/**
 * Retrieve the list of solidity sources for the network - returning the abi and bytecode
 */
const getSource = ({ network = 'mainnet', contract } = {}) => {
	const deployment = loadDeploymentFile({ network });
	if (contract) return deployment.sources[contract];
	else return deployment.sources;
};

/**
 * Retrieve the ASTs for the source contracts
 */
const getAST = ({ source, match = /^contracts\// } = {}) => {
	const fullAST = data.ast;

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

/**
 * Retrieve ths list of synths for the network - returning their names, assets underlying, category, sign, description, and
 * optional index and inverse properties
 */
const getSynths = ({ network = 'mainnet' } = {}) => {
	const synths = data[network].synths;

	// copy all necessary index parameters from the longs to the corresponding shorts
	return synths.map(synth => {
		if (typeof synth.index === 'string') {
			const { index } = synths.find(({ name }) => name === synth.index) || {};
			if (!index) {
				throw Error(
					`While processing ${synth.name}, it's index mapping "${synth.index}" cannot be found - this is an error in the deployment config and should be fixed`
				);
			}
			return Object.assign({}, synth, { index });
		} else {
			return synth;
		}
	});
};

/**
 * Retrieve the list of staking rewards for the network - returning this names, stakingToken, and rewardToken
 */
const getStakingRewards = ({ network = 'mainnet ' } = {}) => data[network].rewards;

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

const getVersions = ({ network = 'mainnet', byContract = false } = {}) => {
	const versions = data[network].versions;

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

module.exports = {
	getAST,
	getSource,
	getSuspensionReasons,
	getSynths,
	getTarget,
	getUsers,
	getVersions,
	getStakingRewards,
	networks,
	toBytes32,
	constants,
	defaults,
};
