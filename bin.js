#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const { getSuspensionReasons, networks, toBytes32, wrap } = require('./index');

const { getAST, getSource, getSynths, getTarget, getUsers, getVersions, getStakingRewards } = wrap({
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
	.command('networks')
	.description('Get networks')
	.action(async () => {
		console.log(networks);
	});

program
	.command('rewards')
	.description('Get staking rewards for an environment')
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'mainnet')
	.action(async ({ network }) => {
		console.log(JSON.stringify(getStakingRewards({ network }), null, 2));
	});

program
	.command('source')
	.description('Get source files for an environment')
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'mainnet')
	.option('-c, --contract [value]', 'The name of the contract')
	.option('-k, --key [value]', 'A specific key wanted')
	.action(async ({ network, contract, key }) => {
		const source = getSource({ network, contract });
		console.log(JSON.stringify(key in source ? source[key] : source, null, 2));
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
	.action(async ({ network, key }) => {
		const synthList = getSynths({ network });
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
	.option('-k, --key [value]', 'A specific key wanted')
	.action(async ({ network, contract, key }) => {
		const target = getTarget({ network, contract });
		console.log(JSON.stringify(key in target ? target[key] : target, null, 2));
	});

program
	.command('users')
	.description('Get the list of system users')
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'mainnet')
	.option('-u, --user [value]', 'A specific user wanted')
	.action(async ({ network, user }) => {
		const users = getUsers({ network, user });
		console.log(JSON.stringify(users, null, 2));
	});

program
	.command('versions')
	.description('Get the list of deployed versions')
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'mainnet')
	.option('-b, --by-contract', 'To key off the contract name')
	.action(async ({ network, byContract }) => {
		const versions = getVersions({ network, byContract });
		console.log(JSON.stringify(versions, null, 2));
	});

// perform as CLI tool if args given
if (require.main === module) {
	require('pretty-error').start();

	program.parse(process.argv);
}
