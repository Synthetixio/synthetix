'use strict';

const commander = require('commander');
const program = new commander.Command();

const { gray, yellow, cyan } = require('chalk');

const Web3 = require('web3');

const { toBytes32, getSource, getTarget } = require('..');

program
	.description('Inspect historical state of Synthetix at some given block')
	.arguments('[args...]')
	.option('-b, --block-number <value>', 'Block')
	.option('-c, --contract <value>', 'The contract label', 'ProxyERC20')
	.option('-s, --source <value>', 'The label of the source contract', 'Synthetix')
	.option('-m, --method <value>', 'The method name', 'totalIssuedSynths')
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'mainnet')
	.option('-i, --infura-project-id <value>', 'An infura project ID with access to archive state')
	.action(async (_, { network, contract, source, blockNumber, method, infuraProjectId, args }) => {
		args = args.length ? args : [toBytes32('sUSD')];

		if (!infuraProjectId) {
			require('dotenv').config();
			infuraProjectId = process.env.INFURA_PROJECT_ID;
			if (!infuraProjectId) {
				throw Error('Missing infura project ID');
			}
		}

		const providerUrl = `https://${network}.infura.io/v3/${infuraProjectId}`;
		const web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));

		const getContract = ({ contract }) =>
			new web3.eth.Contract(
				getSource({ network, contract: source || getTarget({ network, contract }).source }).abi,
				getTarget({ network, contract }).address
			);

		const Contract = getContract({ contract });

		const response = await Contract.methods[method](...args).call(blockNumber);

		console.log(
			gray('Block'),
			blockNumber ? cyan(blockNumber) : gray('(latest)'),
			gray(`${contract}.${method}(${args}):`),
			yellow(response)
		);
	});

// perform as CLI tool if args given
if (require.main === module) {
	require('pretty-error').start();

	program.parse(process.argv);
}
