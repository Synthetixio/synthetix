'use strict';

const commander = require('commander');
const program = new commander.Command();

const axios = require('axios');

const { gray, yellow, cyan } = require('chalk');

const Web3 = require('web3');

const fs = require('fs');
const path = require('path');
const { wrap } = require('..');

program
	.description('Inspect historical state of Synthetix at some given block')
	.arguments('[args...]')
	.option('-b, --block-number <value>', 'Block')
	.option('-c, --contract <value>', 'The contract label or address', 'ProxyERC20')
	.option('-s, --source <value>', 'The label of the source contract', 'Synthetix')
	.option('-m, --method <value>', 'The method name', 'name')
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'mainnet')
	.option('-i, --infura-project-id <value>', 'An infura project ID with access to archive state')
	.option('-e, --etherscan-key <value>', 'Etherscan api key')
	.action(
		async (
			_,
			{ network, contract, source, blockNumber, method, infuraProjectId, etherscanKey, args }
		) => {
			if (!infuraProjectId || !etherscanKey) {
				require('dotenv').config();
				infuraProjectId = infuraProjectId || process.env.INFURA_PROJECT_ID;
				etherscanKey = etherscanKey || process.env.ETHERSCAN_KEY;
				if (!infuraProjectId) {
					throw Error('Missing infura project ID');
				}
			}

			const { getSource, getTarget } = wrap({ network, fs, path });

			const providerUrl = `https://${network}.infura.io/v3/${infuraProjectId}`;
			const web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));

			const contractAddress = /^0x/.test(contract) ? contract : getTarget({ contract }).address;

			const etherscanUrl =
				network === 'mainnet'
					? 'https://api.etherscan.io/api'
					: `https://api-${network}.etherscan.io/api`;

			let abi;
			if (blockNumber) {
				// try fetch ABI from etherscan (as our version might be to new)
				const result = await axios.get(etherscanUrl, {
					params: {
						module: 'contract',
						action: 'getabi',
						address: contractAddress,
						apikey: process.env.ETHERSCAN_KEY || 'demo',
					},
				});
				try {
					abi = JSON.parse(result.data.result);
				} catch (err) {
					console.log(gray('Error: could not fetch ABI from Etherscan', err));
				}
			}

			abi = abi || getSource({ contract: source || getTarget({ contract }).source }).abi;

			const Contract = new web3.eth.Contract(abi, contractAddress);

			const response = await Contract.methods[method](...args).call(blockNumber);

			console.log(
				gray('Block'),
				blockNumber ? cyan(blockNumber) : gray('(latest)'),
				gray(`${contract}.${method}(${args}):`)
			);
			console.log(
				yellow(typeof response === 'object' ? JSON.stringify(response, null, '\t') : response)
			);
		}
	);

// perform as CLI tool if args given
if (require.main === module) {
	require('pretty-error').start();

	program.parse(process.argv);
}
