'use strict';

const { gray, yellow, red, cyan, green } = require('chalk');
const fs = require('fs');
const path = require('path');
const Web3 = require('web3');

const {
	getTarget,
	getSource,
	toBytes32,
	constants: { CONFIG_FILENAME, DEPLOYMENT_FILENAME },
} = require('../../..');

const { ensureNetwork, loadConnections, stringify } = require('../util');

// The block where Synthetix first had SIP-37 added (when ExchangeState was added)
const fromBlockMap = {
	kovan: 16814289,
	mainnet: 9518299,
};

const pathToLocal = name => path.join(__dirname, `${name}.json`);

const saveExchangesToFile = ({ network, label = '', exchanges, fromBlock }) => {
	fs.writeFileSync(
		pathToLocal(`exchanges-${label ? label + '-' : ''}${network}-${fromBlock}`),
		stringify(exchanges)
	);
};

const loadExchangesFromFile = ({ network, fromBlock, label = '' }) => {
	return JSON.parse(
		fs
			.readFileSync(pathToLocal(`exchanges-${label ? label + '-' : ''}${network}-${fromBlock}`))
			.toString()
	);
};

const settle = async ({
	network,
	fromBlock = fromBlockMap[network],
	dryRun,
	deploymentPath,
	gasPrice,
	gasLimit,
}) => {
	ensureNetwork(network);

	console.log(gray('Using network:', yellow(network)));

	const { providerUrl, privateKey: envPrivateKey } = loadConnections({
		network,
	});

	const privateKey = envPrivateKey;

	const web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));

	const user = web3.eth.accounts.wallet.add(privateKey);

	console.log(gray('Using wallet', cyan(user.address)));

	const getContract = ({ label, source }) =>
		new web3.eth.Contract(
			getSource({ network, contract: source }).abi,
			getTarget({ network, contract: label }).address
		);

	const SynthetixOld = getContract({ label: 'ProxySynthetix', source: 'Synthetix' });
	// const Synthetix = getContract({ label: 'ProxyERC20', source: 'Synthetix'})

	const Exchanger = getContract({ label: 'Exchanger', source: 'Exchanger' });
	const ExchangeRates = getContract({ label: 'ExchangeRates', source: 'ExchangeRates' });

	const fetchAllEvents = ({ pageSize = 10e3, startingBlock = fromBlock, target }) => {
		const innerFnc = async () => {
			console.log(gray('-> Fetching page of results'));
			const pageOfResults = await target.getPastEvents('SynthExchange', {
				fromBlock: startingBlock,
				toBlock: startingBlock + pageSize - 1,
			});
			if (pageOfResults.length < 1) {
				return [];
			}
			startingBlock += pageSize;
			return [].concat(pageOfResults).concat(await innerFnc());
		};
		return innerFnc();
	};

	const label = 'oldproxy';
	let methodology = gray('Loaded');
	let oldProxyExchanges;
	try {
		oldProxyExchanges = loadExchangesFromFile({ network, fromBlock, label });
	} catch (err) {
		oldProxyExchanges = await fetchAllEvents({ target: SynthetixOld });
		saveExchangesToFile({ network, fromBlock, label, exchanges: oldProxyExchanges });
		methodology = yellow('Fetched');
	}

	console.log(
		gray(methodology, yellow(oldProxyExchanges.length), 'old proxy exchanges since SIP-37 deployed')
	);

	// this would be faster in parallel, but let's do it in serial so we know where we got up to
	// if we have to restart
	const cache = {};
	let debtTally = 0;

	for (const {
		blockNumber,
		returnValues: { account, toCurrencyKey },
	} of oldProxyExchanges) {
		if (cache[account + toCurrencyKey]) continue;
		cache[account + toCurrencyKey] = true;
		process.stdout.write(
			gray(
				'Block',
				cyan(blockNumber),
				'processing',
				yellow(account),
				'into',
				yellow(web3.utils.hexToAscii(toCurrencyKey))
			)
		);
		const { reclaimAmount, rebateAmount, numEntries } = await Exchanger.methods
			.settlementOwing(account, toCurrencyKey)
			.call();

		if (+numEntries > 0) {
			const wasReclaimOrRebate = reclaimAmount > 0 || rebateAmount > 0;

			const valueInUSD = wasReclaimOrRebate
				? web3.utils.fromWei(
						await ExchangeRates.methods
							.effectiveValue(
								toCurrencyKey,
								reclaimAmount > rebateAmount ? reclaimAmount.toString() : rebateAmount.toString(),
								toBytes32('sUSD')
							)
							.call(blockNumber)
				  )
				: 0;

			debtTally += Math.round(reclaimAmount > rebateAmount ? -valueInUSD : +valueInUSD);

			console.log(
				gray(
					' > Found',
					yellow(numEntries),
					'entries.',
					wasReclaimOrRebate
						? (reclaimAmount > rebateAmount ? green : red)('USD $' + Math.round(valueInUSD))
						: '($0)',
					wasReclaimOrRebate ? 'Tally: ' + debtTally : '',
					'Settling...'
				)
			);
			// await snxjs.Exchanger.settle(addy, currencyKey, { nonce: nonce++ });
		} else {
			console.log(gray(' > No entries found. Moving on.'));
		}
	}
};

module.exports = {
	settle,
	cmd: program =>
		program
			.command('settle')
			.description('Settle all exchanges')
			.option('-f, --from-block <value>', `Starting block number to listen to events from`)
			.option(
				'-d, --deployment-path <value>',
				`Path to a folder that has your input configuration file ${CONFIG_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
			)
			.option('-g, --gas-price <value>', 'Gas price in GWEI', '1')
			.option('-l, --gas-limit <value>', 'Gas limit', parseInt, 15e4)
			.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
			.option(
				'-r, --dry-run',
				'If enabled, will not run any transactions but merely report on them.'
			)
			.action(settle),
};
