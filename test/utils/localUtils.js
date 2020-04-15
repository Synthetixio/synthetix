'use strict';

const {
	web3,
	network: {
		config: { accounts },
	},
} = require('@nomiclabs/buidler');

const { loadCompiledFiles, getLatestSolTimestamp } = require('../../publish/src/solidity');

const { CONTRACTS_FOLDER } = require('../../publish/src/constants');
const deployCmd = require('../../publish/src/commands/deploy');
const { buildPath } = deployCmd.DEFAULTS;

module.exports = {
	loadLocalUsers() {
		return accounts.map(({ privateKey }) => ({
			private: privateKey,
			public: web3.eth.accounts.privateKeyToAccount(privateKey).address,
		}));
	},
	isCompileRequired() {
		// get last modified sol file
		const latestSolTimestamp = getLatestSolTimestamp(CONTRACTS_FOLDER);

		// get last build
		const { earliestCompiledTimestamp } = loadCompiledFiles({ buildPath });

		return latestSolTimestamp > earliestCompiledTimestamp;
	},
};
