'use strict';

require('dotenv').config();
require('pretty-error').start();

const path = require('path');
const fs = require('fs');
const Web3 = require('web3');
const { gray, red, green } = require('chalk');
const program = require('commander');

// // Configure Web3 so we can sign transactions and connect to the network.
const initiateWeb3 = ({ network }) => {
	console.log(gray(`Connecting to ${network.toUpperCase()}...`));
	const providerUrl = process.env.INFURA_PROJECT_ID
		? `https://${network}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
		: `https://${network}.infura.io/${process.env.INFURA_KEY}`;

	const web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));
	web3.eth.accounts.wallet.add(process.env.DEPLOY_PRIVATE_KEY);
	const account = web3.eth.accounts.wallet[0].address;
	console.log(gray(`Using account ${account}...`));
	return { web3, account };
};

const loadContract = ({ deploymentPath, name }) => {
	if (!deploymentPath) {
		throw Error('You must enter a deployment path with a valid deployment.json file.');
	}

	const deploymentFile = path.join(deploymentPath, 'deployment.json');
	const deployment = JSON.parse(fs.readFileSync(deploymentFile));
	const { abi, address } = deployment[name];

	if (!abi || !address) {
		throw Error(
			`${name} must be deployed and have an address and valid ABI in this network. Check deployment.json`
		);
	}

	return { abi, address };
};
program
	.command('request-price')
	.description('Request a chainlink price')
	.option('-d, --deployment-path <value>', `Path to a folder that has your deployment files`)
	.option('-g, --gas-price <value>', 'Gas price in GWEI', '1')
	.option('-m, --method-call-gas-limit <value>', 'Method call gas limit', parseInt, 30e4)
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
	.option(
		'-s, --symbol [value]',
		'Symbol (currently only supports CMC tokens such as ETH, SNX, etc',
		'SNX'
	)

	.action(async ({ deploymentPath, gasPrice, methodCallGasLimit, network, symbol }) => {
		const { abi, address } = loadContract({ deploymentPath, name: 'ExchangeRates' });
		const { account, web3 } = initiateWeb3({ network });
		const ExchangeRates = new web3.eth.Contract(abi, address);
		console.log(gray(`Connecting to ExchangeRates at ${address}`));

		console.log(gray(`Requesting update of price of ${symbol} from the Chainlink oracle...`));
		const link = `https://${network !== 'mainnet' ? network + '.' : ''}etherscan.io`;

		try {
			const { transactionHash: txn } = await ExchangeRates.methods.requestCryptoPrice(symbol).send({
				from: account,
				gas: methodCallGasLimit,
				gasPrice: web3.utils.toWei(gasPrice, 'gwei'),
			});

			console.log(green(`Txn created. See ${link}/tx/${txn}`));
		} catch (err) {
			console.error(
				red(
					`Transaction failed. Does the contract at have sufficient LINK for that environment? See  ${link}/address/${address}`
				)
			);
			process.exit(1);
		}
	});

program
	.command('get-price')
	.description('See a price added to our contract via the chainlink oracle')
	.option('-d, --deployment-path <value>', `Path to a folder that has your deployment files`)
	.option('-n, --network <value>', 'The network to run off.', x => x.toLowerCase(), 'kovan')
	.option(
		'-s, --symbol [value]',
		'Symbol (currently only supports CMC tokens such as ETH, SNX, etc',
		'SNX'
	)
	.action(async ({ deploymentPath, network, symbol }) => {
		const { abi, address } = loadContract({ deploymentPath, name: 'ExchangeRates' });
		const { web3 } = initiateWeb3({ network });
		const ExchangeRates = new web3.eth.Contract(abi, address);
		console.log(gray(`Connecting to ExchangeRates at ${address}`));
		const price = await ExchangeRates.methods.rateForCurrencyString(symbol).call();
		console.log(green(`${symbol} ${web3.utils.asciiToHex(symbol)} is ${price} (${price / 1e18})`));

		const lastUpdate = await ExchangeRates.methods
			.lastRateUpdateTimeForCurrency(web3.utils.asciiToHex(symbol))
			.call();
		// Note: due to our contract code, only "currencyKeys" provided at instantiation have last updated, and of these, only SNX
		// gets updated and only during initiation.
		if (Number(lastUpdate) > 0) {
			console.log(gray(`Last updated ${new Date(lastUpdate * 1000)} ${lastUpdate}`));
		} else {
			console.log(gray(`No last update timestamp.`));
		}
	});
program.parse(process.argv);
