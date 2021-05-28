async function checkUpkeep(keeperRegistry, upkeepId) {
	console.log(`Upkeep ${upkeepId}`, `begin checkUpkeep`);

	// log
	let checkUpkeepResult;

	try {
		checkUpkeepResult = await keeperRegistry.checkUpkeep.call(upkeepId);
	} catch (err) {
		console.log(`Upkeep ${upkeepId}`, `done checkUpkeep`, `${err.toString()}`);
		// log
		// upkeep not needed
		return;
	}

	console.log(`Upkeep ${upkeepId}`, `begin performUpkeep`);
	// if it was a success, then we call it.
	// TODO: maxLinkPayment, , gasWei, linkEth
	const { performData, gasLimit, gasWei } = checkUpkeepResult;

	const performUpkeepTx = await keeperRegistry.performUpkeep(upkeepId, performData, {
		gasLimit,
		gas: gasWei,
	});
	const receipt = await performUpkeepTx.wait(1);

	console.log(
		`Upkeep ${upkeepId}`,
		`done performUpkeep`,
		`success=${!!receipt.status}`,
		`tx=${receipt.transactionHash}`
	);
}

require('dotenv').config();
const ethers = require('ethers');
const { gray, blue } = require('chalk');
const IKeeperRegistryABI = require('synthetix/build/artifacts/contracts/interfaces/IKeeperRegistry.sol/IKeeperRegistry.json')
	.abi;

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
	const routines = {};

	// Setup.
	//
	const provider = new ethers.providers.JsonRpcProvider();
	const signer = privateKey ? new ethers.Wallet(privateKey) : await provider.getSigner();
	const account = await signer.getAddress();
	console.log(gray(`Connected to Ethereum node at http://localhost:8545`));
	console.log(gray(`Account: ${account}`));

	// Setup KeeperRegistry.
	//
	const keeperRegistry = new ethers.Contract(KEEPER_REGISTRY_ADDRESS, IKeeperRegistryABI, signer);
	console.log(gray(`Listening for events on KeeperRegistry [${keeperRegistry.address}]`));

	// Listen for events.
	//
	keeperRegistry.on('UpkeepRegistered', (id, executeGas, admin) => {
		console.log('KeeperRegistry', blue('UpkeepRegistered'), `[id=${id}]`);

		// Begin checkUpkeep routine.
		const checkUpkeepRoutine = new PollRoutine(() => checkUpkeep(keeperRegistry, id), pollInterval);
		routines[id] = checkUpkeepRoutine;
		checkUpkeepRoutine.run();
	});

	keeperRegistry.on('UpkeepCanceled', (id, executeGas, admin) => {
		// Cancel checkUpkeep routine.
		console.log('KeeperRegistry', blue('UpkeepCanceled'), `[id=${id}]`);
		routines[id].cancel();
	});

	await new Promise((resolve, reject) => {});
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
