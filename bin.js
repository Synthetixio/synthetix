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
	.action(async (data, target, { network, useOvm }) => {
		console.log(util.inspect(decode({ network, data, target, useOvm }), false, null, true));
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
	.action(async ({ unreleased, withSources }) => {
		const getSip = sipNumber => releases.sips.find(({ sip }) => sip === sipNumber);

		const result = releases.releases
			.filter(release => release.released === !unreleased)
			.filter(release => {
				if (!withSources) return true;
				return release.sips.some(s => !!getSip(s).sources);
			});

		if (result.length > 0) {
			console.log(JSON.stringify(result, null, 2));
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
				return Array.isArray(sources) && sources.length > 0;
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
