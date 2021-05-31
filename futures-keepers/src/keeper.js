const ethers = require('ethers');
const { gray, blue, red } = require('chalk');
const FuturesMarketABI = require('synthetix/build/artifacts/contracts/FuturesMarket.sol/FuturesMarket.json')
	.abi;
const PollRoutine = require('./poll-routine');

const DEFAULT_GAS_PRICE = '1';

class Keeper {
	routines = {};

	constructor({ proxyFuturesMarket: proxyFuturesMarketAddress, signer }) {
		// Setup KeeperRegistry.
		//
		const futuresMarket = new ethers.Contract(proxyFuturesMarketAddress, FuturesMarketABI, signer);
		console.log(gray(`Listening for events on FuturesMarket [${futuresMarket.address}]`));
		this.futuresMarket = futuresMarket;

		// Listen for events.
		//
		futuresMarket.on('OrderSubmitted', (id, account) => {
			console.log('FuturesMarket', blue('OrderSubmitted'), `[id=${id} account=${account}]`);
			this.confirmOrder(id, account);

			// Begin checkUpkeep routine.
			const confirmOrderRoutine = new PollRoutine(() => this.confirmOrder(id, account), 1000);
			this.routines[id] = confirmOrderRoutine;
			confirmOrderRoutine.run();
		});

		futuresMarket.on('OrderConfirmed', (id, account) => {
			console.log('FuturesMarket', blue('OrderConfirmed'), `[id=${id} account=${account}]`);

			if (id in this.routines) {
				this.routines[id].cancel();
				delete this.routines[id];
			}
		});
	}

	async confirmOrder(id, account) {
		console.log(
			`FuturesMarket [${this.futuresMarket.address}]`,
			`begin canConfirmOrder [id=${id}]`
		);
		const canConfirmOrder = await this.futuresMarket.canConfirmOrder(account);
		if (!canConfirmOrder) {
			console.error(
				`FuturesMarket [${this.futuresMarket.address}]`,
				`cannot confirm order [id=${id}]`
			);
			return;
		}

		console.log(`FuturesMarket [${this.futuresMarket.address}]`, `begin confirmOrder [id=${id}]`);
		let confirmOrderTx, receipt;

		try {
			confirmOrderTx = await this.futuresMarket.confirmOrder(account, {
				gasPrice: '0',
				gasLimit: '3500000',
			});
			receipt = await confirmOrderTx.wait(1);
		} catch (err) {
			console.log(red(err));
			return;
		}

		console.log(
			`FuturesMarket [${this.futuresMarket.address}]`,
			`done confirmOrder [id=${id}]`,
			`success=${!!receipt.status}`,
			`tx=${receipt.transactionHash}`
		);
	}

	// async checkUpkeep(id) {
	// 	console.log(`Upkeep ${id}`, `begin checkUpkeep`);

	// 	// log
	// 	let checkUpkeepResult;

	// 	try {
	// 		checkUpkeepResult = await this.keeperRegistry.checkUpkeep.call(id);
	// 	} catch (err) {
	// 		console.log(`Upkeep ${id}`, `done checkUpkeep`, `${err.toString()}`);
	// 		// log
	// 		// upkeep not needed
	// 		return;
	// 	}

	// 	console.log(`Upkeep ${id}`, `begin performUpkeep`);
	// 	// if it was a success, then we call it.
	// 	// TODO: maxLinkPayment, , gasWei, linkEth
	// 	const { performData, gasLimit, gasWei } = checkUpkeepResult;

	// 	const performUpkeepTx = await this.keeperRegistry.performUpkeep(id, performData, {
	// 		gasLimit,
	// 		gas: gasWei,
	// 	});
	// 	const receipt = await performUpkeepTx.wait(1);

	// 	console.log(
	// 		`Upkeep ${id}`,
	// 		`done performUpkeep`,
	// 		`success=${!!receipt.status}`,
	// 		`tx=${receipt.transactionHash}`
	// 	);
	// }
}

module.exports = Keeper;
