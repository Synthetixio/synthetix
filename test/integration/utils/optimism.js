const chalk = require('chalk');
const ethers = require('ethers');
const { wait } = require('../../test-utils/wait');
const { dummyTx } = require('../../test-utils/rpc');
const OptimismMessengerABI = require('@eth-optimism/contracts/artifacts/contracts/optimistic-ethereum/iOVM/bridge/messaging/iAbs_BaseCrossDomainMessenger.sol/iAbs_BaseCrossDomainMessenger.json')
	.abi;

async function deposit({ ctx, from, to, amount }) {
	let { Synthetix, SynthetixBridgeToOptimism } = ctx.contracts;
	Synthetix = Synthetix.connect(from);
	SynthetixBridgeToOptimism = SynthetixBridgeToOptimism.connect(from);

	let tx;

	const allowance = await Synthetix.allowance(from.address, SynthetixBridgeToOptimism.address);
	if (allowance.lt(amount)) {
		tx = await Synthetix.approve(SynthetixBridgeToOptimism.address, amount);
		await tx.wait();
	}

	tx = await SynthetixBridgeToOptimism.depositTo(to.address, amount);
	const receipt = await tx.wait();

	await finalizationOnL2({ ctx, transactionHash: receipt.transactionHash });
}

async function withdraw() {
	// TODO
}

async function approveBridge({ ctx, amount }) {
	const { Synthetix, SynthetixBridgeToOptimism } = ctx.contracts;
	let { SynthetixBridgeEscrow } = ctx.contracts;
	SynthetixBridgeEscrow = SynthetixBridgeEscrow.connect(ctx.users.owner);

	let tx;

	tx = await SynthetixBridgeEscrow.approveBridge(
		Synthetix.address,
		SynthetixBridgeToOptimism.address,
		ethers.constants.Zero
	);
	await tx.wait();

	tx = await SynthetixBridgeEscrow.approveBridge(
		Synthetix.address,
		SynthetixBridgeToOptimism.address,
		amount
	);
	await tx.wait();
}

/*
 * Sends L1 and L2 txs on a timer, which keeps the L2 timestamp in
 * sync with the L1 timestamp.
 * */
let heartbeatActive = false;
async function startOpsHeartbeat({ l1Wallet, l2Wallet }) {
	if (heartbeatActive) {
		return;
	}

	heartbeatActive = true;

	async function heartbeat() {
		await dummyTx({ wallet: l1Wallet, useOvm: false });
		await dummyTx({ wallet: l2Wallet, useOvm: true });

		await wait({ seconds: 1 });

		const l1Timestamp = (await l1Wallet.provider.getBlock()).timestamp;
		const l2Timestamp = (await l2Wallet.provider.getBlock()).timestamp;
		console.log(chalk.gray(`> Ops heartbeat - Timestamps: [${l1Timestamp}, ${l2Timestamp}]`));

		await heartbeat();
	}

	await heartbeat();
}

function skipIfL2({ ctx, reason }) {
	before('skip if running on :2', async function() {
		if (!ctx.useOvm) {
			return;
		}

		if (!reason) {
			throw new Error('Please specify a reason when skipping L2 tests.');
		}
		console.log(chalk.yellow(`>> Skipping L2 tests because ${reason}`));

		this.skip();
	});
}

async function finalizationOnL1({ ctx, transactionHash }) {
	const messageHashes = await ctx.watcher.getMessageHashesFromL2Tx(transactionHash);
	console.log(chalk.gray(`> Awaiting for ${messageHashes} to finalize on L1...`));

	const promises = messageHashes.map(messageHash =>
		ctx.watcher.getL1TransactionReceipt(messageHash)
	);

	const receipts = await Promise.all(promises).catch(console.log);
	receipts.map(receipt =>
		console.log(chalk.gray(`> Tx finalized on L1: ${receipt.transactionHash}`))
	);
}

async function finalizationOnL2({ ctx, transactionHash }) {
	const messageHashes = await ctx.watcher.getMessageHashesFromL1Tx(transactionHash);
	console.log(chalk.gray(`> Awaiting for ${messageHashes} to finalize on L2...`));

	const promises = messageHashes.map(messageHash =>
		ctx.watcher.getL2TransactionReceipt(messageHash)
	);

	const receipts = await Promise.all(promises).catch(console.log);
	receipts.map(receipt =>
		console.log(chalk.gray(`> Tx finalized on L2: ${receipt.transactionHash}`))
	);
}

function _parseMessengerLog(log) {
	const messengerInterface = new ethers.utils.Interface(OptimismMessengerABI);

	return messengerInterface.parseLog(log);
}

function _printMessengerLog(log) {
	const event = _parseMessengerLog(log);
	// console.log(JSON.stringify(event, null, 2));
	const argName = event.eventFragment.inputs[0].name;
	const argType = event.eventFragment.inputs[0].type;
	const argValue = event.args[0];
	console.log(chalk.gray(`> ${event.name}(${argName}:${argType} = ${argValue})`));
}

let watchingBridges = false;
function watchOptimismMessengers({ ctx, l1MessengerAddress, l2MessengerAddress }) {
	if (watchingBridges) {
		return;
	}
	watchingBridges = true;

	// Event listeners
	const l1Filter = {
		address: l1MessengerAddress,
		topics: [
			[
				ethers.utils.id(`SentMessage(bytes)`),
				ethers.utils.id(`RelayedMessage(bytes32)`),
				ethers.utils.id(`FailedRelayedMessage(bytes32)`),
			],
		],
		fromBlock: 0,
	};
	const l2Filter = {
		address: l2MessengerAddress,
		topics: [
			[
				ethers.utils.id(`SentMessage(bytes)`),
				ethers.utils.id(`RelayedMessage(bytes32)`),
				ethers.utils.id(`FailedRelayedMessage(bytes32)`),
			],
		],
		fromBlock: 0,
	};
	ctx.l1.provider.on(l1Filter, log => {
		console.log(chalk.green('L1 Messenger log emitted:'));
		_printMessengerLog(log);
	});
	ctx.l2.provider.on(l2Filter, log => {
		console.log(chalk.green('L2 Messenger log emitted:'));
		_printMessengerLog(log);
	});

	// Block listeners
	ctx.l1.provider.on('block', async blockNumber => {
		const block = await ctx.l1.provider.getBlock(blockNumber);
		const txs = await Promise.all(
			block.transactions.map(hash => ctx.l1.provider.getTransaction(hash))
		);
		txs.map(tx => {
			if (tx.to === l1MessengerAddress) {
				console.log(chalk.blue('L1 Messenger tx:'));
				console.log(chalk.gray(JSON.stringify(tx, null, 2)));
			}
		});
	});
	ctx.l2.provider.on('block', async blockNumber => {
		const block = await ctx.l2.provider.getBlock(blockNumber);
		const txs = await Promise.all(
			block.transactions.map(hash => ctx.l2.provider.getTransaction(hash))
		);
		txs.map(tx => {
			if (tx.to === l2MessengerAddress) {
				console.log(chalk.blue('L2 Messenger tx:'));
				console.log(chalk.gray(JSON.stringify(tx, null, 2)));
			}
		});
	});
}

// Temp workaround until this issue is fixed:
// https://github.com/ethereum-optimism/optimism/issues/1041
class Watcher {
	constructor(opts) {
		this.NUM_BLOCKS_TO_FETCH = 10000000;
		this.l1 = opts.l1;
		this.l2 = opts.l2;
	}

	async getMessageHashesFromL1Tx(l1TxHash) {
		return this.getMessageHashesFromTx(this.l1, l1TxHash);
	}

	async getMessageHashesFromL2Tx(l2TxHash) {
		return this.getMessageHashesFromTx(this.l2, l2TxHash);
	}

	async getL1TransactionReceipt(l2ToL1MsgHash, pollForPending = true) {
		return this.getTransactionReceipt(this.l1, l2ToL1MsgHash, pollForPending);
	}

	async getL2TransactionReceipt(l1ToL2MsgHash, pollForPending = true) {
		return this.getTransactionReceipt(this.l2, l1ToL2MsgHash, pollForPending);
	}

	async getMessageHashesFromTx(layer, txHash) {
		const receipt = await layer.provider.getTransactionReceipt(txHash);
		if (!receipt) {
			return [];
		}

		const msgHashes = [];
		for (const log of receipt.logs) {
			if (
				log.address === layer.messengerAddress &&
				log.topics[0] === ethers.utils.id('SentMessage(bytes)')
			) {
				const [message] = ethers.utils.defaultAbiCoder.decode(['bytes'], log.data);
				msgHashes.push(ethers.utils.solidityKeccak256(['bytes'], [message]));
			}
		}
		return msgHashes;
	}

	async getTransactionReceipt(layer, msgHash, pollForPending = true) {
		const blockNumber = await layer.provider.getBlockNumber();
		const startingBlock = Math.max(blockNumber - this.NUM_BLOCKS_TO_FETCH, 0);

		const successFilter = {
			address: layer.messengerAddress,
			topics: [ethers.utils.id(`RelayedMessage(bytes32)`)],
			fromBlock: startingBlock,
		};
		const failureFilter = {
			address: layer.messengerAddress,
			topics: [ethers.utils.id(`FailedRelayedMessage(bytes32)`)],
			fromBlock: startingBlock,
		};

		const successLogs = await layer.provider.getLogs(successFilter);
		const failureLogs = await layer.provider.getLogs(failureFilter);
		const logs = successLogs.concat(failureLogs);
		console.log(chalk.yellow('Watcher.getTransactionReceipt - getLogs:'));
		logs.map(log => _printMessengerLog(log));

		const matches = logs.filter(log => log.data === msgHash);
		if (matches.length > 0) {
			if (matches.length > 1) {
				throw Error('Found multiple transactions relaying the same message hash.');
			}
			return layer.provider.getTransactionReceipt(matches[0].transactionHash);
		}

		if (!pollForPending) {
			return Promise.resolve(undefined);
		}

		return new Promise(async (resolve, reject) => {
			const handleEvent = async log => {
				console.log(chalk.yellow('Watcher.getTransactionReceipt - handleEvent:'));
				_printMessengerLog(log);

				if (log.data === msgHash) {
					try {
						const txReceipt = await layer.provider.getTransactionReceipt(log.transactionHash);

						layer.provider.off(successFilter);
						layer.provider.off(failureFilter);

						resolve(txReceipt);
					} catch (e) {
						reject(e);
					}
				}
			};

			layer.provider.on(successFilter, handleEvent);
			layer.provider.on(failureFilter, handleEvent);
		});
	}
}

module.exports = {
	deposit,
	withdraw,
	approveBridge,
	watchOptimismMessengers,
	finalizationOnL1,
	finalizationOnL2,
	Watcher,
	skipIfL2,
	startOpsHeartbeat,
};
