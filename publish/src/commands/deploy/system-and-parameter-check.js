'use strict';

const path = require('path');

const { gray, green, yellow, red } = require('chalk');

const {
	utils: { parseUnits, formatUnits, isAddress },
	constants,
} = require('ethers');

const checkAggregatorPrices = require('./check-aggregator-prices');

const { confirmAction, parameterNotice } = require('../../util');

const { getLatestSolTimestamp } = require('../../solidity');

const {
	constants: { CONTRACTS_FOLDER, inflationStartTimestampInSecs },
} = require('../../../..');

module.exports = async ({
	account,
	addNewSynths,
	concurrency,
	config,
	contractDeploymentGasLimit,
	deployer,
	deploymentPath,
	dryRun,
	earliestCompiledTimestamp,
	freshDeploy,
	gasPrice,
	getDeployParameter,
	methodCallGasLimit,
	network,
	oracleExrates,
	providerUrl,
	skipFeedChecks,
	standaloneFeeds,
	synths,
	useFork,
	useOvm,
	yes,
	buildPath,
}) => {
	let oracleAddress;
	let currentSynthetixSupply;
	let oldExrates;
	let currentLastMintEvent;
	let currentWeekOfInflation;
	let systemSuspended = false;
	let systemSuspendedReason;

	try {
		const oldSynthetix = deployer.getExistingContract({ contract: 'Synthetix' });
		currentSynthetixSupply = await oldSynthetix.methods.totalSupply().call();

		// inflationSupplyToDate = total supply - 100m
		const inflationSupplyToDate = parseUnits(currentSynthetixSupply, 'wei').sub(
			parseUnits((100e6).toString(), 'wei')
		);

		// current weekly inflation 75m / 52
		const weeklyInflation = parseUnits((75e6 / 52).toString()).toString();
		currentWeekOfInflation = inflationSupplyToDate.div(weeklyInflation);

		// Check result is > 0 else set to 0 for currentWeek
		currentWeekOfInflation = currentWeekOfInflation.gt(constants.Zero)
			? currentWeekOfInflation.toNumber()
			: 0;

		// Calculate lastMintEvent as Inflation start date + number of weeks issued * secs in weeks
		const mintingBuffer = 86400;
		const secondsInWeek = 604800;
		const inflationStartDate = inflationStartTimestampInSecs;
		currentLastMintEvent =
			inflationStartDate + currentWeekOfInflation * secondsInWeek + mintingBuffer;
	} catch (err) {
		if (freshDeploy) {
			currentSynthetixSupply = await getDeployParameter('INITIAL_ISSUANCE');
			currentWeekOfInflation = 0;
			currentLastMintEvent = 0;
		} else {
			console.error(
				red(
					'Cannot connect to existing Synthetix contract. Please double check the deploymentPath is correct for the network allocated'
				)
			);
			throw Error('Cannot deploy. Halted.');
		}
	}

	try {
		oldExrates = deployer.getExistingContract({ contract: 'ExchangeRates' });
		if (!oracleExrates) {
			oracleAddress = await oldExrates.methods.oracle().call();
		}
	} catch (err) {
		if (freshDeploy) {
			oracleAddress = oracleExrates || account;
			oldExrates = undefined; // unset to signify that a fresh one will be deployed
		} else {
			console.error(
				red(
					'Cannot connect to existing ExchangeRates contract. Please double check the deploymentPath is correct for the network allocated'
				)
			);
			throw Error('Cannot deploy. Halted.');
		}
	}

	try {
		const oldSystemStatus = deployer.getExistingContract({ contract: 'SystemStatus' });

		const systemSuspensionStatus = await oldSystemStatus.methods.systemSuspension().call();

		systemSuspended = systemSuspensionStatus.suspended;
		systemSuspendedReason = systemSuspensionStatus.reason;
	} catch (err) {
		if (!freshDeploy) {
			console.error(
				red(
					'Cannot connect to existing SystemStatus contract. Please double check the deploymentPath is correct for the network allocated'
				)
			);
			throw Error('Cannot deploy. Halted.');
		}
	}

	for (const address of [account, oracleAddress]) {
		if (!isAddress(address)) {
			console.error(red('Invalid address detected (please check your inputs):', address));
			process.exitCode = 1;
			process.exit();
		}
	}

	const newSynthsToAdd = synths
		.filter(({ name }) => !config[`Synth${name}`])
		.map(({ name }) => name);

	let aggregatedPriceResults = 'N/A';

	if (oldExrates && network !== 'local' && !skipFeedChecks) {
		const padding = '\n\t\t\t\t';
		const aggResults = await checkAggregatorPrices({
			network,
			useOvm,
			providerUrl,
			synths,
			oldExrates,
			standaloneFeeds,
		});
		aggregatedPriceResults = padding + aggResults.join(padding);
	}

	const deployerBalance = parseInt(
		formatUnits(await deployer.provider.web3.eth.getBalance(account), 'ether'),
		10
	);
	if (useFork) {
		// Make sure the pwned account has ETH when using a fork
		const accounts = await deployer.provider.web3.eth.getAccounts();

		await deployer.provider.web3.eth.sendTransaction({
			from: accounts[0],
			to: account,
			gas: 50000,
			value: parseUnits('10', 'ether').toString(),
		});
	} else if (deployerBalance < 5) {
		console.log(
			yellow(`⚠ WARNING: Deployer account balance could be too low: ${deployerBalance} ETH`)
		);
	}

	let ovmDeploymentPathWarning = false;
	// OVM targets must end with '-ovm'.
	if (useOvm) {
		const lastPathElement = path.basename(deploymentPath);
		ovmDeploymentPathWarning = !lastPathElement.includes('ovm');
	}

	// now get the latest time a Solidity file was edited
	const latestSolTimestamp = getLatestSolTimestamp(CONTRACTS_FOLDER);

	parameterNotice({
		'Dry Run': dryRun ? green('true') : yellow('⚠ NO'),
		'Using a fork': useFork ? green('true') : yellow('⚠ NO'),
		Concurrency: `${concurrency} max parallel calls`,
		Network: network,
		'OVM?': useOvm
			? ovmDeploymentPathWarning
				? red('⚠ No -ovm folder suffix!')
				: green('true')
			: 'false',
		'Gas price to use': `${gasPrice} GWEI`,
		'Method call gas limit': `${methodCallGasLimit} gas`,
		'Contract deployment gas limit': `${contractDeploymentGasLimit} gas`,
		'Build Path': buildPath,
		'Deployment Path': new RegExp(network, 'gi').test(deploymentPath)
			? deploymentPath
			: yellow('⚠⚠⚠ cant find network name in path. Please double check this! ') + deploymentPath,
		Provider: providerUrl,
		'Local build last modified': `${new Date(earliestCompiledTimestamp)} ${yellow(
			((new Date().getTime() - earliestCompiledTimestamp) / 60000).toFixed(2) + ' mins ago'
		)}`,
		'Last Solidity update':
			new Date(latestSolTimestamp) +
			(latestSolTimestamp > earliestCompiledTimestamp
				? yellow(' ⚠⚠⚠ this is later than the last build! Is this intentional?')
				: green(' ✅')),
		'Add any new synths found?': addNewSynths
			? green('✅ YES\n\t\t\t\t') + newSynthsToAdd.join(', ')
			: yellow('⚠ NO'),
		'Deployer account:': account,
		'Synthetix totalSupply': `${Math.round(formatUnits(currentSynthetixSupply) / 1e6)}m`,
		'ExchangeRates Oracle': oracleAddress,
		'Last Mint Event': `${currentLastMintEvent} (${new Date(currentLastMintEvent * 1000)})`,
		'Current Weeks Of Inflation': currentWeekOfInflation,
		'Aggregated Prices': aggregatedPriceResults,
		'System Suspended': systemSuspended
			? green(' ✅', 'Reason:', systemSuspendedReason)
			: yellow('⚠ NO'),
	});

	if (!yes) {
		try {
			await confirmAction(
				yellow(
					`⚠⚠⚠ WARNING: This action will deploy the following contracts to ${network}:\n${Object.entries(
						config
					)
						.filter(([, { deploy }]) => deploy)
						.map(([contract]) => contract)
						.join(', ')}` + `\nIt will also set proxy targets and add synths to Synthetix.\n`
				) +
					gray('-'.repeat(50)) +
					'\nDo you want to continue? (y/n) '
			);
		} catch (err) {
			console.log(gray('Operation cancelled'));
			throw Error('Halted.');
		}
	}

	return {
		currentSynthetixSupply,
		currentLastMintEvent,
		currentWeekOfInflation,
		oldExrates,
		oracleAddress,
	};
};
