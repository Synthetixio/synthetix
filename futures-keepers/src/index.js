require('dotenv').config();
const ethers = require('ethers');
const { gray } = require('chalk');
const Keeper = require('./keeper');
const { NonceManager } = require('@ethersproject/experimental');

async function main() {
	const {
		FUTURES_MARKET_ETH_ADDRESS,
		EXCHANGE_RATES_ADDRESS,
		ETH_HDWALLET_MNEMONIC,
		FROM_BLOCK,
	} = process.env;
	if (!FUTURES_MARKET_ETH_ADDRESS) {
		throw new Error('FUTURES_MARKET_ETH_ADDRESS environment variable is not configured.');
	}
	if (!EXCHANGE_RATES_ADDRESS) {
		throw new Error('EXCHANGE_RATES_ADDRESS environment variable is not configured.');
	}
	if (!ETH_HDWALLET_MNEMONIC) {
		throw new Error('ETH_HDWALLET_MNEMONIC environment variable is not configured.');
	}

	const pollInterval = 1; // TODO
	const fromBlock = parseInt(FROM_BLOCK);

	// Setup.
	//
	const provider = new ethers.providers.WebSocketProvider();
	console.log(gray(`Connected to Ethereum node at http://localhost:8545`));

	let signers = createWallets({ provider, mnemonic: ETH_HDWALLET_MNEMONIC, num: 10 });
	console.log(gray`Using ${signers.length} account(s) to submit transactions:`);
	signers = await Promise.all(
		signers.map(async (signer, i) => {
			console.log(gray(`Account #${i}: ${await signer.getAddress()}`));
			let wrappedSigner = new NonceManager(signer);

			// Each signer gets its own WebSocket RPC connection.
			// This seems to improve the transaction speed even further.
			wrappedSigner = wrappedSigner.connect(new ethers.providers.WebSocketProvider());
			return wrappedSigner;
		})
	);

	const keeper = new Keeper({
		proxyFuturesMarket: FUTURES_MARKET_ETH_ADDRESS,
		exchangeRates: EXCHANGE_RATES_ADDRESS,
		signer: signers[0],
		signers,
		pollInterval,
		provider,
	});
	keeper.run({ fromBlock: fromBlock || 'latest' });

	await new Promise((resolve, reject) => {});
}

function createWallets({ provider, mnemonic, num }) {
	const masterNode = ethers.utils.HDNode.fromMnemonic(mnemonic);
	const wallets = [];

	for (let i = 0; i < num; i++) {
		wallets.push(
			new ethers.Wallet(masterNode.derivePath(`m/44'/60'/0'/0/${i}`).privateKey, provider)
		);
	}

	return wallets;
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
