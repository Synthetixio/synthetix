'use strict';

const path = require('path');
const fs = require('fs');
const ethers = require('ethers');
const { red, gray, green, yellow } = require('chalk');

const {
	getVersions,
	constants: { CONFIG_FILENAME, DEPLOYMENT_FILENAME },
	getUsers,
} = require('../../..');

const DEFAULTS = {
	gasPrice: '1',
	gasLimit: 1.5e6, // 1.5m
	network: 'kovan',
};

const {
	ensureNetwork,
	ensureDeploymentPath,
	getDeploymentPathForNetwork,
	loadAndCheckRequiredSources,
	loadConnections,
	confirmAction,
	stringify,
} = require('../util');

const pathToLocal = name => path.join(__dirname, `${name}.json`);

const saveFeePeriodsToFile = ({ network, feePeriods, sourceContractAddress }) => {
	fs.writeFileSync(
		pathToLocal(`recent-feePeriods-${network}-${sourceContractAddress}`),
		stringify(feePeriods)
	);
};

const importFeePeriods = async ({
	deploymentPath,
	network = DEFAULTS.network,
	gasPrice = DEFAULTS.gasPrice,
	gasLimit = DEFAULTS.gasLimit,
	sourceContractAddress,
	privateKey,
	yes,
	override,
	skipTimeCheck = false,
	useFork,
}) => {
	ensureNetwork(network);
	deploymentPath = deploymentPath || getDeploymentPathForNetwork({ network });
	ensureDeploymentPath(deploymentPath);

	const { deployment } = loadAndCheckRequiredSources({
		deploymentPath,
		network,
	});

	const { providerUrl, privateKey: envPrivateKey, etherscanLinkPrefix } = loadConnections({
		network,
		useFork,
	});

	// allow local deployments to use the private key passed as a CLI option
	if (network !== 'local' || !privateKey) {
		privateKey = envPrivateKey;
	}

	const provider = new ethers.providers.JsonRpcProvider(providerUrl);
	let wallet;
	if (useFork) {
		const account = getUsers({ network, user: 'owner' }).address; // protocolDAO
		wallet = provider.getSigner(account);
	} else {
		wallet = new ethers.Wallet(privateKey, provider);
	}

	if (!wallet.address) wallet.address = wallet._address;
	console.log(gray(`Using account with public key ${wallet.address}`));

	const { address: targetContractAddress, source } = deployment.targets['FeePool'];

	if (!sourceContractAddress) {
		// load from versions file if not supplied
		const feePoolVersions = getVersions({ network, byContract: true }).FeePool;
		// it will be the last entry in the versions file if a release hasn't occurred, or the second last if it has
		// note: this is brittle - it assumes the versions file is ordered correctly (which it is
		// but some other engineer may not realize this assumption and modify versions.json directly and
		// break the assumption).
		const [secondLastEntry, lastEntry] = feePoolVersions.slice(-2);

		if (lastEntry.address !== targetContractAddress) {
			sourceContractAddress = lastEntry.address;
		} else if (secondLastEntry.address !== targetContractAddress) {
			sourceContractAddress = secondLastEntry.address;
		} else {
			throw Error('Cannot determine which is the last version of FeePool for the network');
		}
	} else if (!ethers.utils.isAddress(sourceContractAddress)) {
		throw Error(
			'Invalid address detected for source (please check your inputs): ',
			sourceContractAddress
		);
	}

	const feePeriods = [];

	const { abi } = deployment.sources[source];
	if (sourceContractAddress.toLowerCase() === targetContractAddress.toLowerCase()) {
		throw Error(
			'Cannot use same FeePool address as the source and the target. Check your source input.'
		);
	} else {
		console.log(gray(`Reading from old FeePool at: ${sourceContractAddress}`));
		console.log(gray(`Importing into new FeePool at: ${targetContractAddress}`));
	}

	const sourceContract = new ethers.Contract(sourceContractAddress, abi, wallet);
	const targetContract = new ethers.Contract(targetContractAddress, abi, wallet);

	const feePeriodLength = await sourceContract.FEE_PERIOD_LENGTH();

	// Check sources
	for (let i = 0; i <= feePeriodLength - 1; i++) {
		const period = await sourceContract.recentFeePeriods(i);
		if (!skipTimeCheck) {
			if (period.feePeriodId === '0') {
				throw Error(
					`Fee period at index ${i} has NOT been set. Are you sure this is the right FeePool source? ${etherscanLinkPrefix}/address/${sourceContractAddress} `
				);
			} else if (i === 0 && period.startTime < Date.now() / 1000 - 3600 * 24 * 7) {
				throw Error(
					`The initial fee period is more than one week ago - this is likely an error. ` +
						`Please check to make sure you are using the correct FeePool source (this should ` +
						`be the one most recently replaced). Given: ${etherscanLinkPrefix}/address/${sourceContractAddress}`
				);
			}
		}

		// remove redundant index keys (returned from struct calls)
		const filteredPeriod = {};
		Object.keys(period)
			.filter(key => /^[0-9]+$/.test(key) === false)
			.forEach(key => (filteredPeriod[key] = period[key]));

		feePeriods.push(filteredPeriod);
		console.log(
			gray(
				`loaded feePeriod ${i} from FeePool (startTime: ${new Date(
					filteredPeriod.startTime * 1000
				)})`
			)
		);
	}

	// Check target does not have existing periods
	if (!override) {
		for (let i = 0; i < feePeriodLength; i++) {
			const period = await targetContract.recentFeePeriods(i);
			console.log(period);
			// ignore any initial entry where feePeriodId is 1 as this is created by the FeePool constructor
			if (period.feePeriodId !== '1' && period.startTime !== '0') {
				throw Error(
					`The new target FeePool already has imported fee periods (one or more entries has ` +
						`startTime as 0. Please check to make sure you are using the latest FeePool ` +
						`(this should be the most recently deployed). Given: ${etherscanLinkPrefix}/address/${targetContractAddress}`
				);
			}
		}
	} else {
		console.log(
			gray('Warning: Setting target to override - ignoring existing FeePool periods in target!')
		);
	}

	console.log(gray('The fee periods to import over are as follows:'));
	console.log(gray(stringify(feePeriods)));

	console.log(gray(`Gas Price: ${gasPrice} gwei`));

	if (network !== 'local') {
		saveFeePeriodsToFile({ network, feePeriods, sourceContractAddress });
	}

	let index = 0;
	for (const feePeriod of feePeriods) {
		console.log('Fee period to import is as follows:');
		console.log(stringify(feePeriod));

		if (!yes) {
			try {
				await confirmAction(
					yellow(
						`Do you want to continue importing this fee period in index position ${index} (y/n) ?`
					)
				);
			} catch (err) {
				console.log(gray('Operation cancelled'));
				return;
			}
		}

		const importArgs = [
			index,
			feePeriod.feePeriodId,
			feePeriod.startingDebtIndex,
			feePeriod.startTime,
			feePeriod.feesToDistribute,
			feePeriod.feesClaimed,
			feePeriod.rewardsToDistribute,
			feePeriod.rewardsClaimed,
		];
		console.log(yellow(`Attempting action FeePool.importFeePeriod(${importArgs})`));
		const tx = await targetContract.importFeePeriod(...importArgs, {
			gasLimit: ethers.BigNumber.from(gasLimit),
			gasPrice: ethers.utils.parseUnits(gasPrice, 'gwei'),
		});
		const { transactionHash } = await tx.wait();

		index++;

		console.log(
			green(
				`Successfully emitted importFeePeriod with transaction: ${etherscanLinkPrefix}/tx/${transactionHash}`
			)
		);
	}

	console.log(gray('Action complete.'));
};

module.exports = {
	importFeePeriods,
	cmd: program =>
		program
			.command('import-fee-periods')
			.description('Import fee periods')
			.option(
				'-d, --deployment-path <value>',
				`Path to a folder that has your input configuration file (${CONFIG_FILENAME}) and where your ${DEPLOYMENT_FILENAME} files will go`
			)
			.option('-g, --gas-price <value>', 'Gas price in GWEI', DEFAULTS.gasPrice)
			.option('-l, --gas-limit <value>', 'Gas limit', parseInt, DEFAULTS.gasLimit)
			.option('-s, --source-contract-address <value>', 'The Fee Pool source contract address')
			.option(
				'-n, --network <value>',
				'The network to run off.',
				x => x.toLowerCase(),
				DEFAULTS.network
			)
			.option(
				'-v, --private-key [value]',
				'The private key to deploy with (only works in local mode, otherwise set in .env).'
			)
			.option(
				'-o, --override',
				'Override fee periods in target - use when resuming an import process that failed or was cancelled partway through'
			)
			.option(
				'-t, --skip-time-check',
				"Do not do a time check - I sure hope you know what you're doing"
			)
			.option(
				'-k, --use-fork',
				'Perform the deployment on a forked chain running on localhost (see fork command).',
				false
			)
			.option('-y, --yes', 'Dont prompt, just reply yes.')

			.action(async (...args) => {
				try {
					await importFeePeriods(...args);
				} catch (err) {
					// show pretty errors for CLI users
					console.error(red(err));
					process.exitCode = 1;
				}
			}),
};
