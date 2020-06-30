'use strict';

const { gray, yellow, red, cyan, green } = require('chalk');
const fs = require('fs');
const path = require('path');
const Web3 = require('web3');

const { getTarget, getSource, toBytes32 } = require('../../..');

const { ensureNetwork, loadConnections, stringify } = require('../util');

// The block where Synthetix first had SIP-37 added (when ExchangeState was added)
const fromBlockMap = {
	// these were from when ExchangeState was first deployed (SIP-37)
	// kovan: 16814289,
	// rinkeby: 6001476,
	// ropsten: 7363114,
	// mainnet: 9518299,

	// blocks from the Acrux deploy (everything prior to this has been settled)
	kovan: 19220640,
	rinkeby: 6750628,
	ropsten: 8195362,
	mainnet: 10364175,
};

const pathToLocal = name => path.join(__dirname, `${name}.json`);

const saveExchangesToFile = ({ network, exchanges, fromBlock }) => {
	fs.writeFileSync(pathToLocal(`exchanges-${network}-${fromBlock}`), stringify(exchanges));
};

const loadExchangesFromFile = ({ network, fromBlock }) => {
	return JSON.parse(fs.readFileSync(pathToLocal(`exchanges-${network}-${fromBlock}`)).toString());
};

const settle = async ({
	network,
	fromBlock = fromBlockMap[network],
	dryRun,
	latest,
	gasPrice,
	gasLimit,
	privateKey,
	ethToSeed,
	showDebt,
}) => {
	ensureNetwork(network);

	console.log(gray('Using network:', yellow(network)));

	const { providerUrl, privateKey: envPrivateKey, etherscanLinkPrefix } = loadConnections({
		network,
	});

	privateKey = privateKey || envPrivateKey;

	const web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));

	console.log(gray('gasPrice'), yellow(gasPrice));
	const gas = gasLimit;
	gasPrice = web3.utils.toWei(gasPrice, 'gwei');
	const user = web3.eth.accounts.wallet.add(privateKey);
	const deployer = web3.eth.accounts.wallet.add(envPrivateKey);

	console.log(gray('Using wallet', cyan(user.address)));
	const balance = web3.utils.fromWei(await web3.eth.getBalance(user.address));
	console.log(gray('ETH balance'), yellow(balance));
	let nonce = await web3.eth.getTransactionCount(user.address);
	console.log(gray('Starting at nonce'), yellow(nonce));

	if (balance < '0.1') {
		if (dryRun) {
			console.log(green('[DRY RUN] Sending'), yellow(ethToSeed), green('ETH to address'));
		} else {
			console.log(
				green(`Sending ${yellow(ethToSeed)} ETH to address from`),
				yellow(deployer.address)
			);
			const { transactionHash } = await web3.eth.sendTransaction({
				from: deployer.address,
				to: user.address,
				value: web3.utils.toWei(ethToSeed),
				gas,
				gasPrice,
			});
			console.log(gray(`${etherscanLinkPrefix}/tx/${transactionHash}`));
		}
	}

	const { number: currentBlock } = await web3.eth.getBlock('latest');

	const getContract = ({ label, source }) =>
		new web3.eth.Contract(
			getSource({ network, contract: source }).abi,
			getTarget({ network, contract: label }).address
		);

	const Synthetix = getContract({
		label: 'ProxyERC20',
		source: 'Synthetix',
	});

	const Exchanger = getContract({ label: 'Exchanger', source: 'Exchanger' });
	const ExchangeRates = getContract({ label: 'ExchangeRates', source: 'ExchangeRates' });

	const fetchAllEvents = ({ pageSize = 10e3, startingBlock = fromBlock, target }) => {
		const innerFnc = async () => {
			if (startingBlock > currentBlock) {
				return [];
			}
			console.log(gray('-> Fetching page of results from target', yellow(target.options.address)));
			const pageOfResults = await target.getPastEvents('SynthExchange', {
				fromBlock: startingBlock,
				toBlock: startingBlock + pageSize - 1,
			});
			startingBlock += pageSize;
			return [].concat(pageOfResults).concat(await innerFnc());
		};
		return innerFnc();
	};

	let methodology = gray('Loaded');
	let exchanges;
	try {
		if (latest) {
			throw Error('Must fetch latest');
		}
		exchanges = loadExchangesFromFile({ network, fromBlock });
	} catch (err) {
		exchanges = await fetchAllEvents({ target: Synthetix });
		saveExchangesToFile({
			network,
			fromBlock,
			exchanges,
		});
		methodology = yellow('Fetched');
	}

	console.log(gray(methodology, yellow(exchanges.length), 'exchanges since block', currentBlock));

	// this would be faster in parallel, but let's do it in serial so we know where we got up to
	// if we have to restart
	const cache = {};
	let debtTally = 0;

	for (const {
		blockNumber,
		returnValues: { account, toCurrencyKey },
	} of exchanges) {
		if (cache[account + toCurrencyKey]) continue;
		cache[account + toCurrencyKey] = true;

		const { reclaimAmount, rebateAmount, numEntries } = await Exchanger.methods
			.settlementOwing(account, toCurrencyKey)
			.call();

		if (+numEntries > 0) {
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

			const wasReclaimOrRebate = reclaimAmount > 0 || rebateAmount > 0;
			if (showDebt) {
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
			} else {
				console.log(
					gray(
						' > Found',
						yellow(numEntries),
						'entries.',
						wasReclaimOrRebate
							? (reclaimAmount > rebateAmount ? green : red)(
									web3.utils.fromWei(Math.max(reclaimAmount, rebateAmount).toString())
							  )
							: '($0)',
						'Settling...'
					)
				);
			}

			if (dryRun) {
				console.log(green(`[DRY RUN] > Invoke settle()`));
			} else {
				console.log(green(`Invoking settle()`));

				// do not await, just emit using the nonce
				Exchanger.methods
					.settle(account, toCurrencyKey)
					.send({
						from: user.address,
						gas: Math.max(gas * numEntries, 500e3),
						gasPrice,
						nonce: nonce++,
					})
					.then(({ transactionHash }) =>
						console.log(gray(`${etherscanLinkPrefix}/tx/${transactionHash}`))
					)
					.catch(err => {
						console.error(
							red('Error settling'),
							yellow(account),
							yellow(web3.utils.hexToAscii(toCurrencyKey)),
							gray(`${etherscanLinkPrefix}/tx/${err.receipt.transactionHash}`)
						);
					});
			}
		} else if (process.env.DEBUG) {
			console.log(
				gray(
					'Block',
					cyan(blockNumber),
					'processing',
					yellow(account),
					'into',
					yellow(web3.utils.hexToAscii(toCurrencyKey)),
					'> Nothing to settle.'
				)
			);
		}
	}
};

module.exports = {
	settle,
	cmd: program =>
		program
			.command('settle')
			.description('Settle all exchanges')
			.option('-d, --show-debt', 'Whether or not to show debt pool impact (requires archive node)')
			.option('-e, --eth-to-seed <value>', 'Amount of ETH to seed', '1')
			.option('-f, --from-block <value>', 'Starting block number to listen to events from')
			.option('-g, --gas-price <value>', 'Gas price in GWEI', '1')
			.option('-l, --gas-limit <value>', 'Gas limit', parseInt, 150e3)
			.option('-v, --private-key <value>', 'Provide private key to settle from given account')
			.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
			.option('-a, --latest', 'Always fetch the latest list of transactions')
			.option(
				'-r, --dry-run',
				'If enabled, will not run any transactions but merely report on them.'
			)
			.action(settle),
};
