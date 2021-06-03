require('dotenv').config();
const ethers = require('ethers');
const { gray } = require('chalk');
const Keeper = require('./keeper');

async function main() {
	const {
		FUTURES_MARKET_ETH_ADDRESS,
		EXCHANGE_RATES_ADDRESS,
		ETH_PRIVATE_KEY,
		FROM_BLOCK,
	} = process.env;
	if (!FUTURES_MARKET_ETH_ADDRESS) {
		throw new Error('FUTURES_MARKET_ETH_ADDRESS environment variable is not configured.');
	}
	if (!EXCHANGE_RATES_ADDRESS) {
		throw new Error('EXCHANGE_RATES_ADDRESS environment variable is not configured.');
	}
	if (!ETH_PRIVATE_KEY) {
		throw new Error('ETH_PRIVATE_KEY environment variable is not configured.');
	}

	const privateKey = ETH_PRIVATE_KEY;
	const pollInterval = 1; // TODO
	const fromBlock = parseInt(FROM_BLOCK);

	// Setup.
	//
	const provider = new ethers.providers.JsonRpcProvider();
	// const signer = new NonceManager(
	// 	new ethers.Wallet(privateKey, provider)
	// )
	const signer = new ethers.Wallet(privateKey, provider);
	// const signer = new ethers.Wallet(privateKey, provider)
	const account = await signer.getAddress();
	console.log(gray(`Connected to Ethereum node at http://localhost:8545`));
	console.log(gray(`Account: ${account}`));

	const keeper = new Keeper({
		proxyFuturesMarket: FUTURES_MARKET_ETH_ADDRESS,
		exchangeRates: EXCHANGE_RATES_ADDRESS,
		signer,
		pollInterval,
		provider,
	});
	keeper.run({ fromBlock: fromBlock || 'latest' });

	await new Promise((resolve, reject) => {});
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
