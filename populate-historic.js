'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const execFile = util.promisify(require('child_process').execFile);

const commander = require('commander');
const program = new commander.Command();

const snx = require('.');

// via https://gist.github.com/justinjmoses/5e202554688dbf504c8ca2e5340ba4df
const PATH = '/tmp/all_versions_exported';

const files = fs.readdirSync(PATH);

program
	.option('-j, --json', 'JSON output to file')
	.option('-c, --csv', 'CSV output to file')
	.option('-n, --network <value>', 'Network name')
	.action(async ({ json, csv, network }) => {
		const targets = snx.getTarget({ network });

		// const byContract = {};

		const versionMapping = {
			'v2.10': 'Sirius',
			'v2.11': 'Canopus',
			'v2.12': 'Rigil',
			'v2.13': 'Arcturus',
			'v2.14': 'Vega',
			'v2.16': 'Capella',
			'v2.17': 'Procyon',
			'v2.19': 'Achernar',
			'v2.20': 'Betelgeuse',
			'v2.21': 'Hadar',
		};

		const byVersion = {};

		const visited = {};
		for (const file of files.sort()) {
			const [date, commit] = file.split('.');

			const { stdout } = await execFile('git', ['describe', commit]);

			const tag = stdout.match(/^v[\d]+(\.|-)[\d]+(\.|-)[\d]+/)[0];

			// console.log(date, commit, tag);

			const contents = JSON.parse(fs.readFileSync(path.join(PATH, file)));
			const targetsInVersion = contents.targets || contents;

			byVersion[tag] = byVersion[tag] || {
				tag,
				fulltag: stdout.replace(/-g[\w]{8}\n/, ''),
				release: versionMapping[(tag.match(/^v2\.\d\d/) || [])[0]] || '',
				network,
				date,
				commit,
				contracts: {},
			};

			for (const [contract, { address }] of Object.entries(targetsInVersion)) {
				// keep "byContract" here for posterity
				// byContract[contract] = byContract[contract] || {};
				// byContract[contract][address] = byContract[contract][address] || tag;

				if (!(address in visited)) {
					byVersion[tag].contracts[contract] = {
						address,
						status: 'current',
					};

					if (!['Unipool', 'ArbRewarder'].includes(contract)) {
						if (!(contract in targets)) {
							byVersion[tag].contracts[contract].status = 'deleted';
						} else if (contract in visited) {
							byVersion[visited[contract]].contracts[contract].status = 'replaced';
							byVersion[visited[contract]].contracts[contract].replaced_in = tag;
							delete visited[contract];
						}
					}

					visited[contract] = visited[contract] || tag;
				}

				visited[address] = true;
			}
			if (JSON.stringify(byVersion[tag].contracts) === '{}') delete byVersion[tag];
		}

		if (csv) {
			const entries = [];
			for (const { tag, date, commit, contracts } of Object.values(byVersion)) {
				const base = { tag, date, commit };
				for (const [contract, { address, status, replaced_in }] of Object.entries(contracts)) {
					entries.push(
						Object.assign(
							{
								contract,
								address,
								status,
								replaced_in,
							},
							base
						)
					);
				}
			}
			const fields = ['tag', 'date', 'commit', 'contract', 'address', 'status', 'replaced_in'];

			let content = fields.join(','); // headers
			content +=
				'\n' + entries.map(entry => fields.map(field => entry[field]).join(',')).join('\n');
			fs.writeFileSync(path.join(__dirname, `snx-versions-${network}.csv`), content + '\n');
		} else if (json) {
			// console.log(JSON.stringify(byContract, null, '\t'));

			fs.writeFileSync(
				path.join(__dirname, `snx-versions-${network}.json`),
				JSON.stringify(byVersion, null, '\t') + '\n'
			);
		} else {
			console.log(JSON.stringify(byVersion, null, '\t'));
		}
	});

require('pretty-error').start();

program.parse(process.argv);
