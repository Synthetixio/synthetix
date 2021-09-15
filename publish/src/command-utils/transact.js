const ethers = require('ethers');
const {
	appendOwnerActionGenerator,
	confirmAction,
	stringify,
	mixinGasOptions,
} = require('../util');
const { gray, yellow, green, redBright } = require('chalk');

let _dryRunCounter = 0;

/**
 * Run a single transaction step, first checking to see if the value needs
 * changing at all, and then whether or not its the owner running it.
 *
 * @returns transaction hash if successful, true if user completed, or falsy otherwise
 */
const performTransactionalStep = async ({
	signer,
	contract,
	target,
	read,
	readArg, // none, 1 or an array of args, array will be spread into params
	expected,
	write,
	writeArg, // none, 1 or an array of args, array will be spread into params
	maxFeePerGas,
	maxPriorityFeePerGas,
	generateSolidity,
	skipSolidity,
	explorerLinkPrefix,
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
		let response = await target[read](...argumentsForReadFunction);

		// Ethers returns uints as BigNumber objects, while web3 stringified them.
		// This can cause BigNumber(0) !== '0' and make runStep think there is nothing to do
		// in some edge cases.
		// To avoid using .toString() on runStep calls, we do the check here.
		if (ethers.BigNumber.isBigNumber(response)) {
			response = response.toString();
		}

		if (expected(response)) {
			console.log(gray(`Nothing required for this action.`));
			return { noop: true };
		}
	}

	// now if generate solidity mode, simply doing anything, a bit like a dry-run
	if (generateSolidity) {
		if (!skipSolidity) {
			console.log(
				green(
					`[GENERATE_SOLIDITY_SIMULATION] Successfully completed ${action} number ${++_dryRunCounter}.`
				)
			);
		}
		return {};
	}

	// otherwise check the owner
	const owner = await target.owner();
	if (owner === signer.address || publiclyCallable) {
		// perform action
		let hash;
		let gasUsed = 0;
		if (dryRun) {
			_dryRunCounter++;
			hash = '0x' + _dryRunCounter.toString().padStart(64, '0');
		} else {
			const overrides = await mixinGasOptions(
				{},
				target.provider,
				maxFeePerGas,
				maxPriorityFeePerGas
			);

			if (nonceManager) {
				overrides.nonce = await nonceManager.getNonce();
			}

			target = target.connect(signer);

			const tx = await target[write](...argumentsForWriteFunction, overrides);
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
		console.log(gray(`  > Account ${signer.address} is not owner ${owner}`));
	}

	let data;
	if (ownerActions && ownerActionsFile) {
		// append to owner actions if supplied
		const appendOwnerAction = appendOwnerActionGenerator({
			ownerActions,
			ownerActionsFile,
			explorerLinkPrefix,
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
