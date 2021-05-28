require('dotenv').config();
const ethers = require('ethers');
const { gray, blue } = require('chalk');
const Keeper = require('./keeper');
const PollRoutine = require('./poll-routine');

async function main() {
	const { KEEPER_REGISTRY_ADDRESS, POLL_INTERVAL } = process.env;
	if (!KEEPER_REGISTRY_ADDRESS) {
		throw new Error('KEEPER_REGISTRY_ADDRESS environment variable is not configured.');
	}
	if (!POLL_INTERVAL) {
		throw new Error('POLL_INTERVAL environment variable is not configured.');
	}

	let privateKey;
	const pollInterval = parseInt(POLL_INTERVAL);

	// Setup.
	//
	const provider = new ethers.providers.JsonRpcProvider();
	const signer = privateKey ? new ethers.Wallet(privateKey) : await provider.getSigner();
	const account = await signer.getAddress();
	console.log(gray(`Connected to Ethereum node at http://localhost:8545`));
	console.log(gray(`Account: ${account}`));

	new Keeper({
		keeperRegistry: KEEPER_REGISTRY_ADDRESS,
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
