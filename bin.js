#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');

const { getSuspensionReasons, networks, toBytes32, wrap, releases } = require('./index');

const {
	decode,
	getAST,
	getSource,
	getSynths,
	getFeeds,
	getTarget,
	getTokens,
	getUsers,
	getVersions,
	getStakingRewards,
} = wrap({
	fs,
	path,
});

const commander = require('commander');
const program = new commander.Command();

program
	.command('ast <source>')
	.description('Get the AST for some source file')
	.action(async source => {
		console.log(JSON.stringify(getAST({ source, match: /./ }), null, 2));
	});

program
	.command('bytes32 <key>')
	.description('Bytes32 representation of a currency key')
	.option('-c, --skip-check', 'Skip the check')

	.action(async (key, { skipCheck }) => {
		if (
			!skipCheck &&
			getSynths({ network: 'mainnet' }).filter(({ name }) => name === key).length < 1
		) {
			throw Error(
				`Given key of "${key}" does not exist as a synth in mainnet (case-sensitive). Use --skip-check to skip this check.`
			);
		}
		console.log(toBytes32(key));
	});

program
	.command('decode <data> [target]')
	.description('Decode a data payload from a Synthetix contract')
	.option('-n, --network <value>', 'The network to use', x => x.toLowerCase(), 'mainnet')
	.option('-z, --use-ovm', 'Target deployment for the OVM (Optimism).')
	.option('-m, --decode-migration', 'Decodes a migration contract execution call')
	.option('-e, --enhance-decode', 'Enhance decoded data', false)
	.action(async (data, target, { network, useOvm, decodeMigration, enhanceDecode }) => {
		console.log(
			util.inspect(
				decode({ network, data, target, useOvm, decodeMigration, enhanceDecode }),
				false,
				null,
				true
			)
		);
	});

program
	.command('decode-multi-send <txsdata> [target]')
	.description('Decode a data payload from a gnosis multi-send staged to Synthetix contracts')
	.option('-n, --network <value>', 'The network to use', x => x.toLowerCase(), 'mainnet')
	.option('-z, --use-ovm', 'Target deployment for the OVM (Optimism).')
	.option('-m, --decode-migration', 'Decodes a migration contract execution call')
	.option('-e, --enhance-decode', 'Enhance decoded data', false)
	.action(async (txsdata, target, { network, useOvm, decodeMigration, enhanceDecode }) => {
		if (txsdata.length <= 2) {
			console.log('data too short');
		}

		const splitByLen = (s, len) => [s.slice(0, len), s.slice(len)];

		const cleanMultiSendRawData = raw => {
			let parts = splitByLen(raw, 8);
			if (parts[0] === '8d80ff0a') {
				// is multisend raw data
				// value
				parts = splitByLen(parts[1], 64);
				// length
				parts = splitByLen(parts[1], 64);
				const dataLen = parts[0];
				const dataLenDecimal = parseInt(dataLen, 16);
				parts = splitByLen(parts[1], dataLenDecimal * 2);
				return parts[0];
			} else {
				return raw;
			}
		};

		const cleanData = txsdata.toLowerCase().startsWith('0x')
			? txsdata.slice(2).toLowerCase()
			: txsdata.toLowerCase();

		let parts = splitByLen(cleanMultiSendRawData(cleanData), 0);
		let index = 1;
		const decodedTransactions = [];
		while (parts[1].length > 20) {
			// operation type
			parts = splitByLen(parts[1], 2);
			const operationType = parts[0] === '00' ? 'Call' : 'DelegateCall';

			// destination
			parts = splitByLen(parts[1], 40);
			const destAddress = '0x' + parts[0];

			// value
			parts = splitByLen(parts[1], 64);
			const txValue = parts[0];
			const valueDecimal = parseInt(txValue, 16);

			// data Len
			parts = splitByLen(parts[1], 64);
			const dataLen = parts[0];
			const dataLenDecimal = parseInt(dataLen, 16);

			// data
			parts = splitByLen(parts[1], dataLenDecimal * 2);
			const data = ('00' + dataLenDecimal.toString(16)).slice(0, 2) + parts[0];

			decodedTransactions.push({
				index,
				destAddress,
				operationType,
				value: valueDecimal,
				decoded: decode({ network, data, target, useOvm, decodeMigration, enhanceDecode }),
			});

			index++;
		}

		console.log(util.inspect(decodedTransactions, false, null, true));
	});

program
	.command('decode-relay-batch <rawtxsdata> [target]')
	.description('Decode data payload from a initiate relay batch staged to Synthetix contracts')
	.option('-n, --network <value>', 'The network to use', x => x.toLowerCase(), 'mainnet')
	.option('-e, --enhance-decode', 'Enhance decoded data', false)
	.action(async (rawtxsdata, target, { network, enhanceDecode }) => {
		if (rawtxsdata.length <= 2) {
			console.log('data too short');
		}

		const decoded = decode({
			network,
			data: rawtxsdata,
			target,
			useOvm: false,
			decodeMigration: false,
			enhanceDecode: false,
		});

		if (decoded.method.name !== 'initiateRelayBatch') {
			console.log('=============================================');
			console.log('Warning: Not a relay batch staged transaction');
			console.log('=============================================');
			console.log(util.inspect(decoded, false, null, true));
			return;
		}
		const targets = decoded.method.params[0].value;
		const payloads = decoded.method.params[1].value;

		const decodedRelayed = [];
		for (let i = 0; i < targets.length; i++) {
			const target = targets[i];
			try {
				const payload = decode({
					network,
					data: payloads[i],
					target,
					useOvm: true,
					decodeMigration: false,
					enhanceDecode,
				});
				decodedRelayed.push({ index: i, target, payload });
			} catch (e) {
				// unable to decode.
				decodedRelayed.push({ index: i, target, rawPayload: payloads[i] });
			}
		}

		console.log(util.inspect(decodedRelayed, false, null, true));
	});

program
	.command('networks')
	.description('Get networks')
	.action(async () => {
		console.log(networks);
	});

program
	.command('rewards')
	.description('Get staking rewards for an environment')
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'mainnet')
	.option('-z, --use-ovm', 'Target deployment for the OVM (Optimism).')
	.action(async ({ network, useOvm }) => {
		console.log(JSON.stringify(getStakingRewards({ network, useOvm }), null, 2));
	});

program
	.command('source')
	.description('Get source files for an environment')
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'mainnet')
	.option('-c, --contract [value]', 'The name of the contract')
	.option('-k, --key [value]', 'A specific key wanted')
	.option('-z, --use-ovm', 'Target deployment for the OVM (Optimism).')
	.action(async ({ network, useOvm, contract, key }) => {
		const source = getSource({ network, useOvm, contract });
		console.log(JSON.stringify(key in source ? source[key] : source, null, 2));
	});

program
	.command('feeds')
	.description('Get the price feeds')
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'mainnet')
	.option('-z, --use-ovm', 'Target deployment for the OVM (Optimism).')
	.action(async ({ network, useOvm }) => {
		const feeds = getFeeds({ network, useOvm });
		console.log(util.inspect(feeds, false, null, true));
	});

program
	.command('suspension-reasons')
	.description('Get the suspension reason')
	.option('-c, --code [value]', 'A specific suspension code')
	.action(async ({ code }) => {
		const reason = getSuspensionReasons({ code });
		console.log(reason);
	});

program
	.command('synths')
	.description('Get the list of synths')
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'mainnet')
	.option('-k, --key [value]', 'A specific key wanted')
	.option('-z, --use-ovm', 'Target deployment for the OVM (Optimism).')
	.action(async ({ network, useOvm, key }) => {
		const synthList = getSynths({ network, useOvm });
		console.log(
			JSON.stringify(
				synthList.map(entry => {
					return key in entry ? entry[key] : entry;
				}),
				null,
				2
			)
		);
	});

program
	.command('target')
	.description('Get deployed target files for an environment')
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'mainnet')
	.option('-c, --contract [value]', 'The name of the contract')
	.option('-k, --key [value]', 'A specific key wanted (ignored when using csv)')
	.option('-v, --csv', 'Whether or not to CSV output the results')
	.option('-z, --use-ovm', 'Target deployment for the OVM (Optimism).')
	.action(async ({ network, useOvm, contract, key, csv }) => {
		const target = getTarget({ network, useOvm, contract });
		if (csv) {
			let headerComplete;
			for (const entry of Object.values(target)) {
				if (!headerComplete) {
					console.log(Object.keys(entry).join(','));
					headerComplete = true;
				}
				console.log(Object.values(entry).join(','));
			}
		} else {
			console.log(JSON.stringify(key in target ? target[key] : target, null, 2));
		}
	});

program
	.command('tokens')
	.description('Get the list of ERC20 tokens in Synthetix')
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'mainnet')
	.option('-z, --use-ovm', 'Target deployment for the OVM (Optimism).')
	.action(async ({ network, useOvm }) => {
		const tokens = getTokens({ network, useOvm });
		console.log(JSON.stringify(tokens, null, 2));
	});

program
	.command('users')
	.description('Get the list of system users')
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'mainnet')
	.option('-u, --user [value]', 'A specific user wanted')
	.option('-z, --use-ovm', 'Target deployment for the OVM (Optimism).')
	.action(async ({ network, useOvm, user }) => {
		const users = getUsers({ network, useOvm, user });
		console.log(JSON.stringify(users, null, 2));
	});

program
	.command('versions')
	.description('Get the list of deployed versions')
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'mainnet')
	.option('-b, --by-contract', 'To key off the contract name')
	.option('-z, --use-ovm', 'Target deployment for the OVM (Optimism).')
	.action(async ({ network, useOvm, byContract }) => {
		const versions = getVersions({ network, useOvm, byContract });
		console.log(JSON.stringify(versions, null, 2));
	});

program
	.command('releases')
	.description('Get the list of releases')
	.option('--unreleased', 'Only retrieve the unreleased ones.')
	.option('--with-sources', 'Only retrieve ones with files.')
	.option('--name-only', 'Whether or not to only return the name of the next release')
	.addOption(
		new commander.Option('-l, --layer <value>', `The layer(s) corresponding to the release`)
			.choices(['base', 'ovm', 'both'])
			.default('both')
	)
	.action(async ({ unreleased, withSources, nameOnly, layer }) => {
		const getSip = sipNumber => releases.sips.find(({ sip }) => sip === sipNumber);

		const results = releases.releases
			.filter(({ ovm }) =>
				layer === 'both' ? true : (ovm && layer === 'ovm') || (!ovm && layer === 'base')
			)
			.filter(release => release.released === !unreleased)
			.filter(release => {
				if (!withSources) return true;
				return release.sips.some(s => !!getSip(s).sources);
			});

		if (results.length > 0) {
			if (nameOnly) {
				console.log(results[0].name);
			} else {
				console.log(JSON.stringify(results, null, 2));
			}
		}
	});

program
	.command('sips')
	.description('Get the list of released or unreleased SIPs.')
	.option('--unreleased', 'Only retrieve the SIPs that are not released on the given layer.')
	.option('--with-sources', 'Only retrieve ones with source files.')
	.addOption(
		new commander.Option('-l, --layer <value>', `The layer(s) corresponding to the SIPs`)
			.choices(['base', 'ovm', 'both'])
			.default('both')
	)
	.action(async ({ unreleased, withSources, layer }) => {
		const layers = ['both', ...(layer === 'both' ? ['base', 'ovm'] : [layer])];

		const result = releases.sips
			.filter(({ layer }) => layers.includes(layer))
			.filter(({ released }) => layers.includes(released) === !unreleased)
			.filter(({ sources }) => {
				if (!withSources) return true;
				if (!sources) return false;
				if (Array.isArray(sources)) return sources.length > 0;
				return layers.flatMap(layer => sources[layer]).length > 0;
			});

		if (result.length > 0) {
			console.log(JSON.stringify(result, null, 2));
		}
	});

// perform as CLI tool if args given
if (require.main === module) {
	require('pretty-error').start();

	program.parse(process.argv);
}
