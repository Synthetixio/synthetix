'use strict';

const { gray, yellow, red, cyan } = require('chalk');
const Web3 = require('web3');
const w3utils = require('web3-utils');
const axios = require('axios');

const { CONFIG_FILENAME, DEPLOYMENT_FILENAME } = require('../constants');

const {
	toBytes4,
	ensureNetwork,
	ensureDeploymentPath,
	loadAndCheckRequiredSources,
	loadConnections,
	confirmAction,
	performTransactionalStep,
} = require('../util');

module.exports = program =>
	program
		.command('purge-synths')
		.description('Purge a number of synths from the system')
		.option(
			'-d, --deployment-path <value>',
			`Path to a folder that has your input configuration file ${CONFIG_FILENAME} and where your ${DEPLOYMENT_FILENAME} files will go`
		)
		.option('-g, --gas-price <value>', 'Gas price in GWEI', 1)
		.option('-l, --gas-limit <value>', 'Gas limit', 15e4)
		.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
		.option(
			'-s, --synths-to-purge <value>',
			'The list of synths to purge',
			(val, memo) => {
				memo.push(val);
				return memo;
			},
			[]
		)
		.action(async ({ network, deploymentPath, gasPrice, gasLimit, synthsToPurge }) => {
			ensureNetwork(network);
			ensureDeploymentPath(deploymentPath);

			const { synths, deployment } = loadAndCheckRequiredSources({
				deploymentPath,
				network,
			});

			if (synthsToPurge.length < 1) {
				console.log(gray('No synths provided. Please use --synths-to-remove option'));
				return;
			}

			// sanity-check the synth list
			for (const synth of synthsToPurge) {
				if (synths.filter(({ name }) => name === synth).length < 1) {
					console.error(red(`Synth ${synth} not found!`));
					process.exitCode = 1;
					return;
				} else if (['XDR', 'sUSD'].indexOf(synth) >= 0) {
					console.error(red(`Synth ${synth} cannot be purged`));
					process.exitCode = 1;
					return;
				}
			}

			const { providerUrl, privateKey, etherscanLinkPrefix } = loadConnections({ network });

			const web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));
			web3.eth.accounts.wallet.add(privateKey);
			const account = web3.eth.accounts.wallet[0].address;
			console.log(gray(`Using account with public key ${account}`));
			console.log(gray(`Using gas of ${gasPrice} GWEI with a max of ${gasLimit}`));

			try {
				await confirmAction(
					cyan(
						`${yellow(
							'⚠ WARNING'
						)}: This action will purge the following synths from the Synthetix contract on ${network}:\n- ${synthsToPurge.join(
							'\n- '
						)}`
					) + '\nDo you want to continue? (y/n) '
				);
			} catch (err) {
				console.log(gray('Operation cancelled'));
				return;
			}

			const { address: synthetixAddress, source } = deployment.targets['Synthetix'];
			const { abi: synthetixABI } = deployment.sources[source];
			const Synthetix = new web3.eth.Contract(synthetixABI, synthetixAddress);

			for (const currencyKey of synthsToPurge) {
				const { address: synthAddress, source: synthSource } = deployment.targets[
					`Synth${currencyKey}`
				];
				const { abi: synthABI } = deployment.sources[synthSource];
				const Synth = new web3.eth.Contract(synthABI, synthAddress);
				const { address: proxyAddress } = deployment.targets[`Proxy${currencyKey}`];

				const currentSynthInSNX = await Synthetix.methods.synths(toBytes4(currencyKey)).call();

				if (synthAddress !== currentSynthInSNX) {
					console.error(
						red(
							`Synth address in Synthetix for ${currencyKey} is different from what's deployed in Synthetix to the local ${DEPLOYMENT_FILENAME} of ${network} \ndeployed: ${yellow(
								currentSynthInSNX
							)}\nlocal:    ${yellow(synthAddress)}`
						)
					);
					process.exitCode = 1;
					return;
				}

				// step 1. fetch all holders via ethplorer api
				const topTokenHoldersUrl = `http://api.ethplorer.io/getTopTokenHolders/${proxyAddress}`;
				const response = await axios.get(topTokenHoldersUrl, {
					params: {
						apiKey: process.env.ETHPLORER_API_KEY || 'freekey',
						limit: 1000,
					},
				});

				const topTokenHolders = response.data.map(({ address }) => address);
				console.log(gray(`Found ${topTokenHolders.length} holders of ${currencyKey}`));

				// step 2. start the purge
				performTransactionalStep({
					account,
					contract: `Synth${currencyKey}`,
					target: Synth,
					write: 'purge',
					writeArg: topTokenHolders,
					gasLimit,
					gasPrice,
					etherscanLinkPrefix,
				});

				// step 3. confirmation
				const totalSupply = w3utils.fromWei(await Synth.methods.totalSupply().call());
				if (Number(totalSupply) > 0) {
					console.log(
						yellow(
							`⚠⚠⚠ WARNING: totalSupply is not 0 after purge of ${currencyKey}. It is ${totalSupply}. ` +
								`Were there 100 or 1000 holders noted above? If so then we have likely hit the tokenHolder ` +
								`API limit; another purge is required for this synth.`
						)
					);
				}
			}
		});
