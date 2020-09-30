require('dotenv').config();

const program = require('commander');
const { red } = require('chalk');
const { getContract, setupProvider, getPastEvents } = require('./utils');

async function pastEvents({
	network,
	useOvm,
	providerUrl,
	contractName,
	abiName,
	eventName,
	fromBlock,
	toBlock,
}) {
	/* ~~~~~~~~~~~~~~~~~~~ */
	/* ~~~~~~ Input ~~~~~~ */
	/* ~~~~~~~~~~~~~~~~~~~ */

	providerUrl = providerUrl.replace('network', network);
	if (!providerUrl) throw new Error('Cannot set up a provider.');

	/* ~~~~~~~~~~~~~~~~~~~ */
	/* ~~~~~~ Setup ~~~~~~ */
	/* ~~~~~~~~~~~~~~~~~~~ */

	const { provider } = await setupProvider({ providerUrl });

	const contract = await getContract({
		contract: contractName,
		abi: abiName || contractName,
		network,
		useOvm,
		provider,
	});

	/* ~~~~~~~~~~~~~~~~~~~ */
	/* ~~~~~~~ Logs ~~~~~~ */
	/* ~~~~~~~~~~~~~~~~~~~ */

	const events = await getPastEvents({ contract, eventName, provider, fromBlock, toBlock });
	console.log('events', events);
	console.log(`Found ${events.length} "${eventName || '*'}" events.`);
}

program
	.description('Query past emitted events on a contract')
	.option('-a, --abi-name <value>', 'The abi to use (defaults to contract name if not specified)')
	.option('-c, --contract-name <value>', 'The contract to look for events in')
	.option(
		'-e, --event-name <value>',
		'The event to look for. Will look for all events if not specified'
	)
	.option('-f, --from-block <value>', 'Starting block for the query')
	.option('-n, --network <value>', 'The network to run off', x => x.toLowerCase(), 'mainnet')
	.option(
		'-p, --provider-url <value>',
		'The http provider to use for communicating with the blockchain',
		process.env.PROVIDER_URL
	)
	.option('-t, --to-block <value>', 'Ending block for the query', 'latest')
	.option('-z, --use-ovm', 'Use an Optimism chain', false)
	.action(async (...args) => {
		try {
			await pastEvents(...args);
		} catch (err) {
			console.error(red(err));
			console.log(err.stack);

			process.exitCode = 1;
		}
	});

if (require.main === module) {
	require('pretty-error').start();

	program.parse(process.argv);
}
