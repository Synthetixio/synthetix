require('dotenv').config();
const ethers = require('ethers');
const { gray } = require('chalk');
const Keeper = require('../keeper');
const { NonceManager } = require('@ethersproject/experimental');

const DEFAULTS = {
	fromBlock: 'latest',
	providerUrl: 'ws://localhost:8546',
	numAccounts: 10,
};

async function run({
	fromBlock = DEFAULTS.fromBlock,
	providerUrl = DEFAULTS.providerUrl,
	numAccounts = DEFAULTS.numAccounts,
} = {}) {
	const { FUTURES_MARKET_ADDRESS, EXCHANGE_RATES_ADDRESS, ETH_HDWALLET_MNEMONIC } = process.env;
	if (!FUTURES_MARKET_ADDRESS) {
		throw new Error('FUTURES_MARKET_ADDRESS environment variable is not configured.');
	}
	if (!EXCHANGE_RATES_ADDRESS) {
		throw new Error('EXCHANGE_RATES_ADDRESS environment variable is not configured.');
	}
	if (!ETH_HDWALLET_MNEMONIC) {
		throw new Error('ETH_HDWALLET_MNEMONIC environment variable is not configured.');
	}

	fromBlock = fromBlock === 'latest' ? fromBlock : parseInt(fromBlock);

	// Setup.
	//
	const provider = new ethers.providers.WebSocketProvider(providerUrl);
	console.log(gray(`Connected to Ethereum node at ${providerUrl}`));

	let signers = createWallets({ provider, mnemonic: ETH_HDWALLET_MNEMONIC, num: numAccounts });
	console.log(gray`Using ${signers.length} account(s) to submit transactions:`);
	signers = await Promise.all(
		signers.map(async (signer, i) => {
			console.log(gray(`Account #${i}: ${await signer.getAddress()}`));
			let wrappedSigner = new NonceManager(signer);

			// Each signer gets its own WebSocket RPC connection.
			// This seems to improve the transaction speed even further.
			wrappedSigner = wrappedSigner.connect(new ethers.providers.WebSocketProvider(providerUrl));
			return wrappedSigner;
		})
	);

	const keeper = new Keeper({
		proxyFuturesMarket: FUTURES_MARKET_ADDRESS,
		exchangeRates: EXCHANGE_RATES_ADDRESS,
		signer: signers[0],
		signers,
		provider,
	});
	keeper.run({ fromBlock });

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

module.exports = {
	run,
	DEFAULTS,
	cmd: program =>
		program
			.command('run')
			.description('Run the keeper')
			.option(
				'-b, --from-block <value>',
				'Rebuild the keeper index from a starting block, before initiating keeper actions.',
				DEFAULTS.fromBlock
			)
			.option('-p, --provider-url <value>', 'Ethereum RPC URL', DEFAULTS.providerUrl)
			.option(
				'-n, --num-accounts <value>',
				'Number of accounts from the HD wallet to use for parallel tx submission. Improves performance.',
				DEFAULTS.numAccounts
			)
			.action(run),
};
