'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const { confirmAction, ensureNetwork, loadConnections } = require('../util');
const { gray, yellow, red } = require('chalk');
const axios = require('axios');
const { schema } = require('@uniswap/token-lists');

const Ajv = require('ajv');
const ajv = new Ajv({ allErrors: true });

const pinataSDK = require('@pinata/sdk');

const { getTokens, networkToChainId } = require('../../..');

const DEFAULTS = {
	gasLimit: 2e5, // 200,000
	network: 'mainnet',
};

const uploadFileToIPFS = async ({ body }) => {
	const pinata = pinataSDK(process.env.PINATA_KEY, process.env.PINATA_SECRET);
	const result = await pinata.pinJSONToIPFS(body);
	return result.IpfsHash;
};

const persistTokens = async ({ network, yes, privateKey, assetsVersion }) => {
	ensureNetwork(network);

	const { privateKey: envPrivateKey } = loadConnections({
		network,
	});

	// allow local deployments to use the private key passed as a CLI option
	if (network !== 'local' || !privateKey) {
		privateKey = envPrivateKey;
	}

	const chainId = Number(networkToChainId[network]);

	const tokens = getTokens({ network, path, fs });

	// Note: this takes the version from package.json - it should be run postPublish
	const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../package.json')));

	const [major, minor, patch] = version.split(/\.|-/);

	const baseURI = `https://raw.githubusercontent.com/Synthetixio/synthetix-assets/v${assetsVersion}`;

	const output = {
		name: 'Synthetix',
		logoURI: `${baseURI}/snx/SNX.svg`,
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
				description: 'Tokens that track inverted price movement of an underlying asset.',
			},
			index: {
				name: 'Index Synth',
				description:
					'Tokens that are compromised of a basket of underlying assets ' +
					'determined by a set number of units of each. These units are ' +
					'are based on a marketcap weighting of each asset.',
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
			logoURI: baseURI + (symbol === 'SNX' ? '/snx/SNX.svg' : `/synths/${symbol}.svg`),
			tags: []
				.concat(index ? 'index' : [])
				.concat(inverted ? 'inverse' : [])
				.concat(symbol !== 'SNX' ? 'synth' : []),
		})),
	};

	// check version exists
	try {
		await axios.get(output.logoURI);
	} catch (err) {
		console.log(red('Cannot find uri:', output.logoURI));
		process.exit(1);
	}

	console.log(JSON.stringify(output, null, 2));

	// Validate JSON against schema https://uniswap.org/tokenlist.schema.json
	const valid = ajv.validate(schema, output);

	if (!valid) {
		console.log(
			red('Failed validation against schema'),
			util.inspect(ajv.errors, false, null, true)
		);
		process.exit(1);
	}

	if (!yes) {
		try {
			await confirmAction(yellow(`Do you want to continue uploading Synths JSON to IPFS (y/n) ?`));
		} catch (err) {
			console.log(gray('Operation cancelled'));
			process.exit();
		}
	}

	let hash;
	try {
		hash = await uploadFileToIPFS({ body: output });

		console.log(
			gray('Uploaded Synths JSON to IPFS:'),
			yellow(`https://gateway.ipfs.io/ipfs/${hash}`)
		);
	} catch (err) {
		console.log(red(err));
		process.exit(1);
	}

	const ensName = 'synths.snx.eth';
	const content = `ipfs://${hash}`;

	console.log(red('setContent not emitted. Not supported at the moment.'));
	console.log(yellow(`Next step is to manually set content on ${ensName} to ${content} `));

	/* Web3 fails to set the content via code ens.setContenthash(). 
	setContent can be done using ethers.js CLI or we can interact with ENS contract to set the content.
	TODO: implement ens.setContenthash() replacement using ethers and use it here
	*/
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
			.option('-l, --gas-limit <value>', 'Gas limit', parseInt, DEFAULTS.gasLimit)
			.option(
				'-p, --private-key [value]',
				'The private key to deploy with (only works in local mode, otherwise set in .env).'
			)
			.option('-v, --assets-version <value>', 'Version of the synthetix-assets to use')
			.option('-y, --yes', 'Dont prompt, just reply yes.')
			.action(persistTokens),
};
