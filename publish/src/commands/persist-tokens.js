'use strict';

const fs = require('fs');
const path = require('path');
const { confirmAction, ensureNetwork } = require('../util');
const { gray, yellow } = require('chalk');

const { schema } = require('@uniswap/token-lists');

const Ajv = require('ajv');
const ajv = new Ajv({ allErrors: true });

const pinataSDK = require('@pinata/sdk');
const pinata = pinataSDK(process.env.PINATA_KEY, process.env.PINATA_SECRET);

const { getTokens } = require('../../..');

const DEFAULTS = {
	network: 'mainnet',
};

const uploadFileToIPFS = async ({ body }) => {
	const result = await pinata.pinJSONToIPFS(body);
	return result.IpfsHash;
};

const persistTokens = async ({ network }) => {
	ensureNetwork(network);

	const networkToChainMap = {
		mainnet: 1,
		ropsten: 3,
		rinkeby: 4,
		kovan: 42,
	};

	const chainId = networkToChainMap[network];

	const tokens = getTokens({ network, path, fs });

	// conform to this JSON schema: https://uniswap.org/tokenlist.schema.json

	// Note: this takes the version from package.json - it should be run postPublish
	const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../package.json')));

	const [major, minor, patch] = version.split(/\.|-/);

	const output = {
		name: 'Synthetix',
		logoURI:
			'https://raw.githubusercontent.com/Synthetixio/synthetix-assets/master/synthetix/SYNTHETIX_blue.svg',
		keywords: ['synthetix', 'defi', 'derivatives', 'synths', 'isynths', 'synthetics'],
		timestamp: new Date().toISOString(),
		tags: {
			synth: {
				name: 'Synth',
				description:
					'A synthetic asset within the Synthetix protocol which can at any time ' +
					'be exchanged in its entirity into any other synth within Synthetix.',
			},
			inverse: {
				name: 'Inverse Synth',
				description: 'Tokens that track inverted price movement of an underlying asset. ',
			},
			index: {
				name: 'Index Synth',
				description:
					'Tokens that are compromised of a basket of underlying assets ' +
					'determined by a set number of units of each. These units are ' +
					'are based on a marketcap weighting of each asset',
			},
		},
		version: {
			major: Number(major),
			minor: Number(minor),
			patch: Number(patch),
		},
		tokens: tokens.map(({ address, symbol, name, decimals, index, inverted }) => ({
			chainId,
			address,
			symbol,
			name: symbol === 'SNX' ? 'Synthetix Network Token' : `${name}`,
			decimals,
			logoURI:
				'https://raw.githubusercontent.com/Synthetixio/synthetix-assets/master/' +
				(symbol === 'SNX' ? 'snx/SNX_blue.svg' : `synths/${symbol}.svg`),
			tags: []
				.concat(symbol !== 'SNX' ? 'synth' : [])
				.concat(index ? 'index' : [])
				.concat(inverted ? 'inverse' : []),
		})),
	};

	// console.log(JSON.stringify(output, null, 2));

	// Validate JSON against schema
	const valid = ajv.validate(schema, output);

	if (!valid) {
		console.log('Failed validation against schema', ajv.errors);
		process.exit();
	}

	try {
		await confirmAction(yellow(`Do you want to continue uploading Synths JSON to IPFS (y/n) ?`));
	} catch (err) {
		console.log(gray('Operation cancelled'));
		process.exit();
	}

	const hash = await uploadFileToIPFS({ body: output });

	console.log(`Uploaded Synths JSON to IPFS: https://gateway.ipfs.io/ipfs/${hash}`);
};

module.exports = {
	persistTokens,
	cmd: program =>
		program
			.command('persist-tokens')
			.description(
				'Generate a JSON representation of all ERC20 tokens within Synthetix and upload to IPFS'
			)
			.option(
				'-n, --network <value>',
				'The network to run off.',
				x => x.toLowerCase(),
				DEFAULTS.network
			)
			.action(persistTokens),
};
