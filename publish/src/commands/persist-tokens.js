'use strict';

const fs = require('fs');
const path = require('path');
const { confirmAction, ensureNetwork } = require('../util');
const { gray, yellow, red } = require('chalk');

const { schema } = require('@uniswap/token-lists');

const Ajv = require('ajv');
const ajv = new Ajv({ allErrors: true });

const pinataSDK = require('@pinata/sdk');

const { getTokens, networkToChainId } = require('../../..');

const DEFAULTS = {
	network: 'mainnet',
};

const uploadFileToIPFS = async ({ body }) => {
	const pinata = pinataSDK(process.env.PINATA_KEY, process.env.PINATA_SECRET);
	const result = await pinata.pinJSONToIPFS(body);
	return result.IpfsHash;
};

const persistTokens = async ({ network, yes }) => {
	ensureNetwork(network);

	const chainId = networkToChainId[network];

	const tokens = getTokens({ network, path, fs });

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
					'be exchanged in its entirety into any other synth within Synthetix.',
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
			name: symbol === 'SNX' ? 'Synthetix Network Token' : `Synth ${name}`,
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

	console.log(JSON.stringify(output, null, 2));

	// Validate JSON against schema https://uniswap.org/tokenlist.schema.json
	const valid = ajv.validate(schema, output);

	if (!valid) {
		console.log(red('Failed validation against schema'), gray(ajv.errors));
		process.exit();
	}

	if (!yes) {
		try {
			await confirmAction(yellow(`Do you want to continue uploading Synths JSON to IPFS (y/n) ?`));
		} catch (err) {
			console.log(gray('Operation cancelled'));
			process.exit();
		}
	}

	try {
		const hash = await uploadFileToIPFS({ body: output });

		console.log(
			gray('Uploaded Synths JSON to IPFS:'),
			yellow(`https://gateway.ipfs.io/ipfs/${hash}`)
		);
	} catch (err) {
		console.log(red(err));
	}
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
			.option('-y, --yes', 'Dont prompt, just reply yes.')
			.action(persistTokens),
};
