'use strict';

const { gray, yellow, red, cyan, green } = require('chalk');
const fs = require('fs');
const path = require('path');
const Web3 = require('web3');

const { wrap, toBytes32 } = require('../../..');

const { ensureNetwork, loadConnections, stringify } = require('../util');

// The block where Synthetix first had SIP-37 added (when ExchangeState was added)
const fromBlockMap = {
	// these were from when ExchangeState was first deployed (SIP-37)
	// kovan: 16814289,
	// rinkeby: 6001476,
	// ropsten: 7363114,
	// mainnet: 9518299,

	// blocks from the Acrux deploy (everything prior to this has been settled)
	// kovan: 19220640,
	// rinkeby: 6750628,
	ropsten: 8195362,
	// mainnet: 10364175,

	// blocks from the Pollux deploy
	kovan: 20528323,
	rinkeby: 7100439,
	// Note: ropsten was not settled. Needs to be done after https://github.com/Synthetixio/synthetix/pull/699
	mainnet: 11590207, // system exchanged after SCCP-68 implemented
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
	useFork,
	synth,
}) => {
	ensureNetwork(network);

	const { getTarget, getSource, getVersions } = wrap({ network, fs, path });

	console.log(gray('Using network:', yellow(network)));

	const { providerUrl, privateKey: envPrivateKey, etherscanLinkPrefix } = loadConnections({
		network,
		useFork,
	});

	privateKey = privateKey || envPrivateKey;

	const web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));

	console.log(gray('gasPrice'), yellow(gasPrice));
	const gas = gasLimit;
	gasPrice = web3.utils.toWei(gasPrice, 'gwei');
	const user = web3.eth.accounts.wallet.add(privateKey);
	const deployer = web3.eth.accounts.wallet.add(envPrivateKey);

	if (synth) {
		console.log(gray('Filtered to synth:'), yellow(synth));
	}
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

	const versions = getVersions({ byContract: true });

	const getContract = ({ label, source = label, blockNumber }) => {
		let { address } = getTarget({ contract: label });

		if (blockNumber) {
			// look for the right contract based off the block
			for (const entry of versions[source].sort((a, b) => (a.block > b.block ? 1 : -1))) {
				if (entry.block < blockNumber) {
					address = entry.address;
				}
			}
		}
		// console.log(`For ${label} using ${address}`);
		return new web3.eth.Contract(getSource({ contract: source }).abi, address);
	};

	const Synthetix = getContract({
		label: 'ProxyERC20',
		source: 'Synthetix',
	});

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

	console.log(gray(methodology, yellow(exchanges.length), 'exchanges since block', fromBlock));

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

		if (synth && !new RegExp(synth).test(web3.utils.hexToUtf8(toCurrencyKey))) continue;

		// get the current exchanger and state
		const Exchanger = getContract({ label: 'Exchanger' });
		const ExchangeState = getContract({ label: 'ExchangeState' });

		// but get the historical exchange rates (for showing historical debt)
		const ExchangeRates = getContract({ label: 'ExchangeRates', blockNumber });

		// check for current settlement owing
		const { reclaimAmount, rebateAmount, numEntries } = await Exchanger.methods
			.settlementOwing(account, toCurrencyKey)
			.call();

		if (+numEntries > 0) {
			// Fetch all entries within the settlement
			const results = [];
			let earliestTimestamp = Infinity;
			for (let i = 0; i < numEntries; i++) {
				const { src, amount, timestamp } = await ExchangeState.methods
					.getEntryAt(account, toCurrencyKey, i)
					.call();

				results.push(
					`${web3.utils.hexToUtf8(src)} - ${web3.utils.fromWei(amount)} at ${new Date(
						timestamp * 1000
					).toString()}`
				);

				earliestTimestamp = Math.min(timestamp, earliestTimestamp);
			}

			process.stdout.write(
				gray(
					'Block',
					cyan(blockNumber),
					'processing',
					yellow(account),
					'into',
					yellow(web3.utils.hexToAscii(toCurrencyKey)),
					'with',
					yellow(numEntries),
					'entries'
				)
			);

			const wasReclaimOrRebate = reclaimAmount > 0 || rebateAmount > 0;
			let skipIfWillFail = false;

			const secsLeft = await Exchanger.methods
				.maxSecsLeftInWaitingPeriod(account, toCurrencyKey)
				.call();

			skipIfWillFail = +secsLeft > 0;

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
				// see if user has enough funds to settle
				if (reclaimAmount > 0) {
					const synth = await Synthetix.methods.synths(toCurrencyKey).call();

					const Synth = new web3.eth.Contract(getSource({ contract: 'Synth' }).abi, synth);

					const balance = await Synth.methods.balanceOf(account).call();

					console.log(
						gray('Warning: user does not have enough balance to be reclaimed'),
						gray('User has'),
						yellow(web3.utils.fromWei(balance.toString())),
						gray('needs'),
						yellow(web3.utils.fromWei(reclaimAmount.toString())),
						+reclaimAmount > +balance ? red('not enough!') : green('sufficient')
					);
					skipIfWillFail = skipIfWillFail || +reclaimAmount > +balance;
				}
			} else {
				console.log(
					gray(
						' > Found',
						yellow(numEntries),
						'entries.',
						wasReclaimOrRebate
							? (reclaimAmount > rebateAmount ? green : red)(
									web3.utils.fromWei(reclaimAmount > rebateAmount ? reclaimAmount : rebateAmount)
							  )
							: '($0)',
						'Settling...'
					)
				);
			}

			console.log(gray(`Comprised of`), yellow(results.join(',')));

			if (dryRun) {
				console.log(green(`[DRY RUN] > Invoke settle()`));
			} else if (skipIfWillFail) {
				console.log(green(`Skipping - will fail`));
				// } else if (earliestTimestamp > new Date().getTime() / 1000 - 3600 * 24 * 2) {
				// 	console.log(green(`Skipping - too recent`));
			} else {
				console.log(green(`Invoking settle()`));

				try {
					const { transactionHash } = await Exchanger.methods.settle(account, toCurrencyKey).send({
						from: user.address,
						gas: Math.max(gas * numEntries, 650e3),
						gasPrice,
						nonce: nonce++,
					});

					console.log(gray(`${etherscanLinkPrefix}/tx/${transactionHash}`));
				} catch (err) {
					console.log(red('Could not transact:', err));
				}
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
			.option('-a, --latest', 'Always fetch the latest list of transactions')
			.option('-d, --show-debt', 'Whether or not to show debt pool impact (requires archive node)')
			.option('-e, --eth-to-seed <value>', 'Amount of ETH to seed', '1')
			.option('-f, --from-block <value>', 'Starting block number to listen to events from')
			.option('-g, --gas-price <value>', 'Gas price in GWEI', '1')
			.option(
				'-k, --use-fork',
				'Perform the deployment on a forked chain running on localhost (see fork command).',
				false
			)
			.option('-l, --gas-limit <value>', 'Gas limit', parseInt, 350e3)
			.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
			.option(
				'-r, --dry-run',
				'If enabled, will not run any transactions but merely report on them.'
			)
			.option('-s, --synth <synth>', 'Filter to a specific synth or regex')
			.option('-v, --private-key <value>', 'Provide private key to settle from given account')
			.action(settle),
};
