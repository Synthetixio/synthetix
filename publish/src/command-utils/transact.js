const ethers = require('ethers');
const { appendOwnerActionGenerator, confirmAction, stringify } = require('../util');
const { gray, yellow, green, redBright } = require('chalk');

let _dryRunCounter = 0;

/**
 * Run a single transaction step, first checking to see if the value needs
 * changing at all, and then whether or not its the owner running it.
 *
 * @returns transaction hash if successful, true if user completed, or falsy otherwise
 */
const performTransactionalStep = async ({
	account,
	contract,
	target,
	read,
	readArg, // none, 1 or an array of args, array will be spread into params
	expected,
	write,
	writeArg, // none, 1 or an array of args, array will be spread into params
	gasLimit,
	gasPrice,
	etherscanLinkPrefix,
	ownerActions,
	ownerActionsFile,
	dryRun,
	encodeABI,
	nonceManager,
	publiclyCallable,
}) => {
	const argumentsForWriteFunction = [].concat(writeArg).filter(entry => entry !== undefined); // reduce to array of args
	const action = `${contract}.${write}(${argumentsForWriteFunction.map(arg =>
		arg.length === 66 ? ethers.utils.toUtf8String(arg) : arg
	)})`;

	// check to see if action required
	console.log(yellow(`Attempting action: ${action}`));

	if (read) {
		const argumentsForReadFunction = [].concat(readArg).filter(entry => entry !== undefined); // reduce to array of args
		const response = await target[read](...argumentsForReadFunction);

		if (expected(response)) {
			console.log(gray(`Nothing required for this action.`));
			return { noop: true };
		}
	}
	// otherwise check the owner
	const owner = await target.owner();
	if (owner === account.address || publiclyCallable) {
		// perform action
		let hash;
		let gasUsed = 0;
		if (dryRun) {
			_dryRunCounter++;
			hash = '0x' + _dryRunCounter.toString().padStart(64, '0');
		} else {
			const params = {
				gasLimit,
				gasPrice: ethers.utils.parseUnits(gasPrice.toString(), 'gwei'),
			};

			if (nonceManager) {
				params.nonce = await nonceManager.getNonce();
			}

			target = target.connect(account);

			const tx = await target[write](...argumentsForWriteFunction, params);
			const receipt = await tx.wait();

			hash = receipt.transactionHash;
			gasUsed = receipt.gasUsed;

			if (nonceManager) {
				nonceManager.incrementNonce();
			}
		}

		console.log(
			green(
				`${
					dryRun ? '[DRY RUN] ' : ''
				}Successfully completed ${action} in hash: ${hash}. Gas used: ${(gasUsed / 1e6).toFixed(
					2
				)}m `
			)
		);

		return { mined: true, hash };
	} else {
		console.log(gray(`  > Account ${account.address} is not owner ${owner}`));
	}

	let data;
	if (ownerActions && ownerActionsFile) {
		// append to owner actions if supplied
		const appendOwnerAction = appendOwnerActionGenerator({
			ownerActions,
			ownerActionsFile,
			etherscanLinkPrefix,
		});

		data = target.interface.encodeFunctionData(write, argumentsForWriteFunction);

		const ownerAction = {
			key: action,
			target: target.address,
			action: `${write}(${argumentsForWriteFunction})`,
			data: data,
		};

		if (dryRun) {
			console.log(
				gray(`[DRY RUN] Would append owner action of the following:\n${stringify(ownerAction)}`)
			);
		} else {
			appendOwnerAction(ownerAction);
		}
		return { pending: true };
	} else {
		// otherwise wait for owner in real time
		try {
			data = target.interface.encodeFunctionData(write, argumentsForWriteFunction);
			if (encodeABI) {
				console.log(green(`Tx payload for target address ${target.address} - ${data}`));
				return { pending: true };
			}

			await confirmAction(
				redBright(
					`Confirm: Invoke ${write}(${argumentsForWriteFunction}) via https://gnosis-safe.io/app/#/safes/${owner}/transactions` +
						`to recipient ${target.address}` +
						`with data: ${data}`
				) + '\nPlease enter Y when the transaction has been mined and not earlier. '
			);

			return { pending: true };
		} catch (err) {
			console.log(gray('Cancelled'));
			return {};
		}
	}
};

module.exports = {
	performTransactionalStep,
};
