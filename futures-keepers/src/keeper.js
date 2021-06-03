const ethers = require('ethers');
const { gray, blue, red, green, yellow } = require('chalk');
const FuturesMarketABI = require('synthetix/build/artifacts/contracts/FuturesMarket.sol/FuturesMarket.json')
	.abi;
const ExchangeRatesABI = require('synthetix/build/artifacts/contracts/ExchangeRates.sol/ExchangeRates.json')
	.abi;
const PollRoutine = require('./poll-routine');

const DEFAULT_GAS_PRICE = '0';

class Keeper {
	// The index.
	constructor({
		proxyFuturesMarket: proxyFuturesMarketAddress,
		exchangeRates: exchangeRatesAddress,
		signer,
		provider,
	}) {
		// The index.
		this.orders = {};
		this.positions = {};

		// A mapping of already running keeper tasks.
		this.keeperTasks = {};

		const futuresMarket = new ethers.Contract(proxyFuturesMarketAddress, FuturesMarketABI, signer);
		this.futuresMarket = futuresMarket;

		const exchangeRates = new ethers.Contract(exchangeRatesAddress, ExchangeRatesABI, provider);
		this.exchangeRates = exchangeRates;

		this.blockTip = null;
		this.provider = provider;
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
		this.runKeepers();

		console.log(`Listening for events on FuturesMarket [${this.futuresMarket.address}]`);
		this.provider.on('block', async blockNumber => {
			if (!this.blockTip) {
				// Don't process the first block we see.
				this.blockTip = blockNumber;
				return;
			}

			this.blockTip = blockNumber;
			const events = await this.futuresMarket.queryFilter('*', blockNumber, blockNumber);
			console.log('');
			console.log(gray(`New block: ${blockNumber}`));
			console.log('FuturesMarket', gray`${events.length} events to process`);
			this.updateIndex(events);
			this.runKeepers();
		});
	}

	async runKeepers() {
		// Unconfirmed orders.
		for (let { orderId, account } of Object.values(this.orders)) {
			await this.runKeeperTask(`${orderId}-confirm`, () => this.confirmOrder(orderId, account));
		}

		// Open positions.
		for (let { orderId, account } of Object.values(this.positions)) {
			await this.runKeeperTask(`${orderId}-liquidation`, () =>
				this.liquidateOrder(orderId, account)
			);
		}
	}

	async runKeeperTask(id, cb) {
		if (this.keeperTasks[id]) {
			// Skip task as its already running.
			return;
		}
		this.keeperTasks[id] = true;

		console.log(gray(`KeeperTask running [id=${id}]`));
		try {
			await cb();
		} catch (err) {
			console.error(red(`KeeperTask error [id=${id}]`), '\n', red(err.toString()));
		}
		console.log(gray(`KeeperTask done [id=${id}]`));

		delete this.keeperTasks[id];
	}

	updateIndex(events) {
		events.forEach(({ event, args }) => {
			if (event === 'OrderSubmitted') {
				const { id: orderId, account, sender, leverage, fee, roundId } = args;
				console.log('FuturesMarket', blue('OrderSubmitted'), `[id=${orderId} account=${account}]`);

				this.orders[orderId] = {
					account,
					orderId,
					event,
				};
			} else if (event === 'OrderConfirmed') {
				const { id: orderId, account } = args;
				console.log('FuturesMarket', blue('OrderConfirmed'), `[id=${orderId} account=${account}]`);

				delete this.orders[orderId];
				this.positions[account] = {
					event,
					orderId,
					account,
				};
			} else if (event === 'PositionLiquidated') {
				const { account, liquidator } = args;
				console.log(
					'FuturesMarket',
					blue('PositionLiquidated'),
					`[account=${account} liquidator=${liquidator}]`
				);

				delete this.positions[account];
			} else if (event == 'OrderCancelled') {
				const { id: orderId, account } = args;
				console.log('FuturesMarket', blue('OrderCancelled'), `[id=${orderId} account=${account}]`);

				delete this.orders[orderId];
			} else {
				console.log('FuturesMarket', blue(event), 'No handler');
			}
		});
	}

	async confirmOrder(id, account) {
		// console.log(
		// 	`FuturesMarket [${this.futuresMarket.address}]`,
		// 	`begin canConfirmOrder [id=${id}]`
		// );
		const canConfirmOrder = await this.futuresMarket.canConfirmOrder(account);
		if (!canConfirmOrder) {
			// console.error(
			// 	`FuturesMarket [${this.futuresMarket.address}]`,
			// 	`cannot confirm order [id=${id}]`
			// );
			return;
		}

		console.log(`FuturesMarket [${this.futuresMarket.address}]`, `begin confirmOrder [id=${id}]`);
		let confirmOrderTx, receipt;

		try {
			confirmOrderTx = await this.futuresMarket.confirmOrder(account, {
				gasPrice: DEFAULT_GAS_PRICE,
				gasLimit: '3500000',
			});
			receipt = await confirmOrderTx.wait(1);
		} catch (err) {
			throw err;
			return;
		}

		console.log(
			`FuturesMarket [${this.futuresMarket.address}]`,
			green`done confirmOrder [id=${id}]`,
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

		// console.log(
		// 	`FuturesMarket [${this.futuresMarket.address}]`,
		// 	`begin liquidatePosition [id=${id}]`
		// );
		let tx, receipt;

		try {
			tx = await this.futuresMarket.liquidatePosition(account, {
				gasPrice: DEFAULT_GAS_PRICE,
				gasLimit: '6500000',
			});
			receipt = await tx.wait(1);
		} catch (err) {
			console.log(red(err));
			return;
		}

		console.log(
			`FuturesMarket [${this.futuresMarket.address}]`,
			green(`done liquidatePosition [id=${id}]`),
			`success=${!!receipt.status}`,
			`tx=${receipt.transactionHash}`,
			yellow(`gasUsed=${receipt.gasUsed}`)
		);
	}
}

module.exports = Keeper;
