const ethers = require('ethers');
const { gray, blue, red, green, yellow } = require('chalk');
const FuturesMarketABI = require('synthetix/build/artifacts/contracts/FuturesMarket.sol/FuturesMarket.json')
	.abi;
const ExchangeRatesABI = require('synthetix/build/artifacts/contracts/ExchangeRates.sol/ExchangeRates.json')
	.abi;

const DEFAULT_GAS_PRICE = '0';
const SignerPool = require('./signer-pool');

class Keeper {
	// The index.
	constructor({
		proxyFuturesMarket: proxyFuturesMarketAddress,
		exchangeRates: exchangeRatesAddress,
		signer,
		signers,
		provider,
	}) {
		// The index.
		this.orders = {};
		this.positions = {};

		// A mapping of already running keeper tasks.
		this.activeKeeperTasks = {};

		// A FIFO queue of blocks to be processed.
		this.blockQueue = [];

		const futuresMarket = new ethers.Contract(proxyFuturesMarketAddress, FuturesMarketABI, signer);
		this.futuresMarket = futuresMarket;

		const exchangeRates = new ethers.Contract(exchangeRatesAddress, ExchangeRatesABI, provider);
		this.exchangeRates = exchangeRates;

		this.blockTip = null;
		this.provider = provider;
		this.signers = new SignerPool(signers);
		this.signers = {
			withSigner: cb => {
				return cb(signers[0]);
			},
		};

		this.futuresMarket = this.futuresMarket.connect(signers[0]);
	}

	async run({ fromBlock }) {
		const events = await this.futuresMarket.queryFilter('*', fromBlock, 'latest');
		console.log(gray(`Rebuilding index from `), `${fromBlock} ... latest`);
		console.log(gray`${events.length} events to process`);
		this.updateIndex(events);

		console.log(gray(`Index build complete!`));
		console.log(
			gray`${Object.keys(this.orders).length} orders to confirm, ${
				Object.keys(this.positions).length
			} positions to keep`
		);
		console.log(gray(`Starting keeper loop`));
		await this.runKeepers();

		console.log(`Listening for events on FuturesMarket [${this.futuresMarket.address}]`);
		this.provider.on('block', async blockNumber => {
			if (!this.blockTip) {
				// Don't process the first block we see.
				this.blockTip = blockNumber;
				return;
			}

			console.log(gray(`New block: ${blockNumber}`));
			this.blockQueue.push(blockNumber);
		});

		// The L2 node is constantly mining blocks, one block per transaction. When a new block is received, we queue it
		// for processing in a FIFO queue. `processNewBlock` will scan its events, rebuild the index, and then run any
		// keeper tasks that need running that aren't already active.
		while (1) {
			if (!this.blockQueue.length) {
				await new Promise((resolve, reject) => setTimeout(resolve, 30));
				continue;
			}

			const blockNumber = this.blockQueue.shift();
			await this.processNewBlock(blockNumber);
		}
	}

	async processNewBlock(blockNumber) {
		this.blockTip = blockNumber;
		const events = await this.futuresMarket.queryFilter('*', blockNumber, blockNumber);
		const exchangeRateEvents = await this.exchangeRates.queryFilter('*', blockNumber, blockNumber);
		console.log('');
		console.log(gray(`Processing block: ${blockNumber}`));
		exchangeRateEvents
			.filter(({ event, args }) => event === 'RatesUpdated' || event === 'RateDeleted')
			.forEach(({ event }) => console.log('ExchangeRates', blue(event)));
		console.log('FuturesMarket', gray`${events.length} events to process`);
		this.updateIndex(events);
		await this.runKeepers();
	}

	updateIndex(events) {
		events.forEach(({ event, args }) => {
			if (event === 'OrderSubmitted') {
				const { id: orderId, account, roundId } = args;
				console.log(
					'FuturesMarket',
					blue('OrderSubmitted'),
					`[id=${orderId} account=${account} roundId=${roundId}]`
				);

				this.orders[orderId] = {
					account,
					orderId,
					event,
				};
			} else if (event === 'OrderConfirmed') {
				const { id: orderId, account, margin } = args;
				console.log(
					'FuturesMarket',
					blue('OrderConfirmed'),
					`[id=${orderId} account=${account} margin=${margin}]`
				);

				delete this.orders[orderId];

				if (margin === 0) {
					// Position has been closed.
					delete this.positions[account];
				} else {
					this.positions[account] = {
						event,
						orderId,
						account,
					};
				}
			} else if (event === 'PositionLiquidated') {
				const { account, liquidator } = args;
				console.log(
					'FuturesMarket',
					blue('PositionLiquidated'),
					`[account=${account} liquidator=${liquidator}]`
				);

				delete this.positions[account];
			} else if (event === 'OrderCancelled') {
				const { id: orderId, account } = args;
				console.log('FuturesMarket', blue('OrderCancelled'), `[id=${orderId} account=${account}]`);

				delete this.orders[orderId];
			} else {
				console.log('FuturesMarket', blue(event), 'No handler');
			}
		});
	}

	async runKeepers() {
		// Unconfirmed orders.
		for (const { orderId, account } of Object.values(this.orders)) {
			await this.runKeeperTask(`${orderId}-confirm`, () => this.confirmOrder(orderId, account));
		}

		// Open positions.
		for (const { orderId, account } of Object.values(this.positions)) {
			this.runKeeperTask(`${orderId}-liquidation`, () => this.liquidateOrder(orderId, account));
		}
	}

	async runKeeperTask(id, cb) {
		if (this.activeKeeperTasks[id]) {
			// Skip task as its already running.
			return;
		}
		this.activeKeeperTasks[id] = true;

		console.log(gray(`KeeperTask running [id=${id}]`));
		try {
			await cb();
		} catch (err) {
			console.error(red(`KeeperTask error [id=${id}]`), '\n', red(err.toString()));
		}
		console.log(gray(`KeeperTask done [id=${id}]`));

		delete this.activeKeeperTasks[id];
	}

	async confirmOrder(id, account) {
		const canConfirmOrder = await this.futuresMarket.canConfirmOrder(account);
		if (!canConfirmOrder) {
			// console.error(
			// 	`FuturesMarket [${this.futuresMarket.address}]`,
			// 	`cannot confirm order [id=${id}]`
			// );
			return;
		}

		console.log(`FuturesMarket [${this.futuresMarket.address}]`, `begin confirmOrder [id=${id}]`);
		let tx, receipt;

		try {
			await this.signers.withSigner(async signer => {
				console.time();
				tx = await this.futuresMarket.confirmOrder(account, {
					gasPrice: DEFAULT_GAS_PRICE,
				});
				console.timeEnd();

				console.log(tx.nonce);
				receipt = await tx.wait(1);
			});
		} catch (err) {
			throw err;
		}

		console.log(
			`FuturesMarket [${this.futuresMarket.address}]`,
			green`done confirmOrder [id=${id}]`,
			`block=${receipt.blockNumber}`,
			`success=${!!receipt.status}`,
			`tx=${receipt.transactionHash}`,
			yellow(`gasUsed=${receipt.gasUsed}`)
		);
	}

	async liquidateOrder(id, account) {
		// console.log(
		// 	`FuturesMarket [${this.futuresMarket.address}]`,
		// 	`checking canLiquidate [id=${id}]`
		// );
		const canLiquidateOrder = await this.futuresMarket.canLiquidate(account);
		if (!canLiquidateOrder) {
			// console.log(
			// 	`FuturesMarket [${this.futuresMarket.address}]`,
			// 	`cannot liquidate order [id=${id}]`
			// );
			return;
		}

		console.log(
			`FuturesMarket [${this.futuresMarket.address}]`,
			`begin liquidatePosition [id=${id}]`
		);
		let tx, receipt;

		try {
			await this.signers.withSigner(async signer => {
				tx = await this.futuresMarket.connect(signer).liquidatePosition(account, {
					gasPrice: DEFAULT_GAS_PRICE,
				});
				console.log(tx.nonce);
				receipt = await tx.wait(1);
			});
		} catch (err) {
			throw err;
		}

		console.log(
			`FuturesMarket [${this.futuresMarket.address}]`,
			green(`done liquidatePosition [id=${id}]`),
			`block=${receipt.blockNumber}`,
			`success=${!!receipt.status}`,
			`tx=${receipt.transactionHash}`,
			yellow(`gasUsed=${receipt.gasUsed}`)
		);
	}
}

module.exports = Keeper;
