'use strict';

const fs = require('fs');
const path = require('path');
const { confirmAction, ensureNetwork } = require('../util');
const { gray, yellow } = require('chalk');

const pinataSDK = require('@pinata/sdk');
const pinata = pinataSDK(
	'f2239d6e0ac0e5d3dc74',
	'a9597796e21dd77fd7b40678043d85ec71300ebbcf30ae1503ca21357eae43e5'
);

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
				description:
					'Tokens that track inverted price movement of some underlying asset. ' +
					'These synths have their price determined by a calculation based on the ' +
					'entryPoint, the current price of the underlying asset and the upper and ' +
					'lower limits. The calculation is 2 x entryPoint - current price of underlying asset. ' +
					'The result of this calculation is clamped, so that the price is always between the upper ' +
					'and lower limits.',
			},
			index: {
				name: 'Index Synth',
				description:
					'Tokens that are compromised of a basket of underlying assets, as ' +
					'determined by summing a set number of units of each. These units are ' +
					'configured during a rebalancing and are based on a market-cap ' +
					'weighting of each asset',
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
			name: symbol === 'SNX' ? 'Synthetix Network Token' : `Synthetic ${name}`,
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

	// create and generate Synth JSON file based on tokenlist.json template
	// testing pinning tokenlist example

	const hash = await uploadFileToIPFS({ body: JSON.stringify(output) });

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
