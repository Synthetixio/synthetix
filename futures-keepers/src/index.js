require('dotenv').config();
const ethers = require('ethers');
const { gray, blue } = require('chalk');
const Keeper = require('./keeper');
const PollRoutine = require('./poll-routine');

async function main() {
	const { FUTURES_MARKET_ETH_ADDRESS, POLL_INTERVAL, ETH_PRIVATE_KEY } = process.env;
	if (!FUTURES_MARKET_ETH_ADDRESS) {
		throw new Error('FUTURES_MARKET_ETH_ADDRESS environment variable is not configured.');
	}
	if (!POLL_INTERVAL) {
		throw new Error('POLL_INTERVAL environment variable is not configured.');
	}
	if (!ETH_PRIVATE_KEY) {
		throw new Error('ETH_PRIVATE_KEY environment variable is not configured.');
	}

	let privateKey = ETH_PRIVATE_KEY;
	const pollInterval = parseInt(POLL_INTERVAL);

	// Setup.
	//
	const provider = new ethers.providers.JsonRpcProvider();
	const signer = new ethers.Wallet(privateKey, provider);
	const account = await signer.getAddress();
	console.log(gray(`Connected to Ethereum node at http://localhost:8545`));
	console.log(gray(`Account: ${account}`));

	new Keeper({
		proxyFuturesMarket: FUTURES_MARKET_ETH_ADDRESS,
		signer,
		pollInterval,
	});

	await new Promise((resolve, reject) => {});
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
