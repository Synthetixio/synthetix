'use strict';

const { gray, yellow, red, cyan, green } = require('chalk');
const fs = require('fs');
const path = require('path');
const ethers = require('ethers');

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
	maxFeePerGas,
	maxPriorityFeePerGas = '1',
	gasLimit,
	privateKey,
	ethToSeed,
	showDebt,
	useFork,
	synth,
}) => {
	ensureNetwork(network);

	const { getTarget, getSource, getVersions, getUsers } = wrap({ network, fs, path });

	console.log(gray('Using network:', yellow(network)));

	const { providerUrl, privateKey: envPrivateKey, explorerLinkPrefix } = loadConnections({
		network,
		useFork,
	});

	privateKey = privateKey || envPrivateKey;

	const provider = new ethers.providers.JsonRpcProvider(providerUrl);

	console.log(gray('maxFeePerGas'), yellow(maxFeePerGas));
	console.log(gray('maxPriorityFeePerGas'), yellow(maxPriorityFeePerGas));

	let wallet;
	if (!privateKey) {
		const account = getUsers({ network, user: 'owner' }).address; // protocolDAO
		wallet = provider.getSigner(account);
		wallet.address = await wallet.getAddress();
	} else {
		wallet = new ethers.Wallet(privateKey, provider);
	}

	const user = new ethers.Wallet(privateKey, provider);

	if (synth) {
		console.log(gray('Filtered to synth:'), yellow(synth));
	}
	console.log(gray('Using wallet', cyan(user.address)));
	const balance = ethers.utils.formatEther(await provider.getBalance(user.address));
	console.log(gray('ETH balance'), yellow(balance));
	let nonce = await provider.getTransactionCount(user.address);
	console.log(gray('Starting at nonce'), yellow(nonce));

	if (balance < '0.1') {
		if (dryRun) {
			console.log(green('[DRY RUN] Sending'), yellow(ethToSeed), green('ETH to address'));
		} else {
			console.log(
				green(`Sending ${yellow(ethToSeed)} ETH to address from`),
				yellow(wallet.address)
			);

			const params = {
				to: user.address,
				value: ethers.utils.parseUnits(ethToSeed),
				gasLimit,
			};

			const feeData = await provider.getFeeData();
			if (feeData.maxFeePerGas) {
				params.maxFeePerGas = ethers.utils.parseUnits(maxFeePerGas, 'gwei');
				params.maxPriorityFeePerGas = ethers.utils.parseUnits(maxPriorityFeePerGas, 'gwei');
			}

			const { transactionHash } = await wallet.sendTransaction(params);
			console.log(gray(`${explorerLinkPrefix}/tx/${transactionHash}`));
		}
	}

	const { number: currentBlock } = await provider.getBlock(await provider.getBlockNumber());

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
		return new ethers.Contract(address, getSource({ contract: source }).abi, user);
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
			console.log(gray('-> Fetching page of results from target', yellow(target.address)));
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

		// get the current exchanger and state
		const Exchanger = getContract({ label: 'Exchanger' });
		const ExchangeState = getContract({ label: 'ExchangeState' });

		// but get the historical exchange rates (for showing historical debt)
		const ExchangeRates = getContract({ label: 'ExchangeRates', blockNumber });

		// check for current settlement owing
		const { reclaimAmount, rebateAmount, numEntries } = await Exchanger.settlementOwing(
			account,
			toCurrencyKey
		);

		if (+numEntries > 0) {
			// Fetch all entries within the settlement
			const results = [];
			let earliestTimestamp = Infinity;
			const fromSynths = [];
			for (let i = 0; i < numEntries; i++) {
				const { src, amount, timestamp } = await ExchangeState.getEntryAt(
					account,
					toCurrencyKey,
					i
				);

				results.push(
					`${ethers.utils.toUtf8String(src)} - ${ethers.utils.formatEther(amount)} at ${new Date(
						timestamp * 1000
					).toString()}`
				);

				fromSynths.push(src);
				earliestTimestamp = Math.min(timestamp, earliestTimestamp);
			}
			const isSynthTheDest = new RegExp(synth).test(ethers.utils.toUtf8String(toCurrencyKey));
			const isSynthOneSrcEntry = !!fromSynths.find(src => ethers.utils.toUtf8String(src) === synth);

			// skip when filtered by synth if not the destination and not any of the sources
			if (synth && !isSynthTheDest && !isSynthOneSrcEntry) {
				continue;
			}

			process.stdout.write(
				gray(
					'Block',
					cyan(blockNumber),
					'processing',
					yellow(account),
					'into',
					yellow(ethers.utils.toUtf8String(toCurrencyKey)),
					'with',
					yellow(numEntries),
					'entries'
				)
			);

			const wasReclaimOrRebate = reclaimAmount > 0 || rebateAmount > 0;
			let skipIfWillFail = false;

			const secsLeft = await Exchanger.maxSecsLeftInWaitingPeriod(account, toCurrencyKey);

			skipIfWillFail = +secsLeft > 0;

			if (showDebt) {
				const valueInUSD = wasReclaimOrRebate
					? ethers.utils.formatEther(
							await ExchangeRates.effectiveValue(
								toCurrencyKey,
								reclaimAmount > rebateAmount ? reclaimAmount.toString() : rebateAmount.toString(),
								toBytes32('sUSD'),
								{ blockTag: blockNumber }
							)
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
					const synth = await Synthetix.synths(toCurrencyKey);

					const Synth = new ethers.eth.Contract(
						synth,
						getSource({ contract: 'Synth' }).abi,
						provider
					);

					const balance = await Synth.balanceOf(account);

					console.log(
						gray('Warning: user does not have enough balance to be reclaimed'),
						gray('User has'),
						yellow(ethers.utils.formatEther(balance.toString())),
						gray('needs'),
						yellow(ethers.utils.formatEther(reclaimAmount.toString())),
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
									ethers.utils.formatEther(
										reclaimAmount > rebateAmount ? reclaimAmount : rebateAmount
									)
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
					const tx = await Exchanger.settle(account, toCurrencyKey, {
						gasLimit: Math.max(gasLimit * numEntries, 650e3),
						nonce: nonce++,
					});
					const { transactionHash } = await tx.wait();

					console.log(gray(`${explorerLinkPrefix}/tx/${transactionHash}`));
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
					yellow(ethers.utils.toUtf8String(toCurrencyKey)),
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
			.option('-g, --max-fee-per-gas <value>', 'Maximum base gas fee price in GWEI')
			.option('--max-priority-fee-per-gas <value>', 'Priority gas fee price in GWEI', '1')
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
