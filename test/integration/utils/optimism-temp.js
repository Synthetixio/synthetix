/*
 * Note: This file contains a series of "hacks" to work around the current issue with
 * the Optimism ops tool relayer unreliablity.
 * https://github.com/ethereum-optimism/optimism/issues/1041
 * */

const hre = require('hardhat');
const ethers = require('ethers');
const chalk = require('chalk');
const { wait } = require('../../test-utils/wait');
const { dummyTx } = require('../../test-utils/rpc');
const OptimismMessengerABI = require('@eth-optimism/contracts/artifacts/contracts/optimistic-ethereum/iOVM/bridge/messaging/iAbs_BaseCrossDomainMessenger.sol/iAbs_BaseCrossDomainMessenger.json')
	.abi;

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
		console.log(chalk.green('L1 Messenger log emitted:', log));
		_printMessengerLog(log);
	});
	ctx.l2.provider.on(l2Filter, log => {
		console.log(chalk.green('L2 Messenger log emitted:', log));
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
				log.topics[0] === '0x4b388aecf9fa6cc92253704e5975a6129a4f735bdbd99567df4ed0094ee4ceb5' // TransactionEnqueued event
			) {
				const [, message] = ethers.utils.defaultAbiCoder.decode(
					['uint', 'bytes', 'uint'],
					log.data
				);
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
		if (hre.config.debugOptimism) {
			console.log(
				chalk.yellow(
					`Watcher.getTransactionReceipt - getLogs: ${JSON.stringify(logs.map(l => l.topics[1]))}`
				)
			);
			logs.map(log => _printMessengerLog(log));
		}

		const matches = logs.filter(log => log.topics[1] === msgHash);
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
				if (hre.config.debugOptimism) {
					console.log(
						chalk.yellow(`Watcher.getTransactionReceipt - handleEvent: ${JSON.stringify(log)}`)
					);
					_printMessengerLog(log);
				}

				if (log.topics[1] === msgHash) {
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

function _parseMessengerLog(log) {
	const messengerInterface = new ethers.utils.Interface(OptimismMessengerABI);

	return messengerInterface.parseLog(log);
}

function _printMessengerLog(log) {
	try {
		const event = _parseMessengerLog(log);
		const argName = event.eventFragment.inputs[0].name;
		const argType = event.eventFragment.inputs[0].type;
		const argValue = event.args[0];
		console.log(chalk.gray(`> ${event.name}(${argName}:${argType} = ${argValue})`));
	} catch (err) {
		console.error('could not parse messenger log:', log);
	}
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
		await dummyTx({ wallet: l1Wallet, gasPrice: 1, gasLimit: 8000000 });
		await dummyTx({ wallet: l2Wallet, gasPrice: 0, gasLimit: 3360001 });

		await wait({ seconds: 1 });

		const l1Timestamp = (await l1Wallet.provider.getBlock()).timestamp;
		const l2Timestamp = (await l2Wallet.provider.getBlock()).timestamp;
		if (hre.config.debugOptimism) {
			console.log(chalk.gray(`> Ops heartbeat - Timestamps: [${l1Timestamp}, ${l2Timestamp}]`));
		}

		await heartbeat();
	}

	await heartbeat();
}

module.exports = {
	startOpsHeartbeat,
	watchOptimismMessengers,
	Watcher,
};
