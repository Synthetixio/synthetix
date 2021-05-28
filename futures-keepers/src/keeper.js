const ethers = require('ethers');
const { gray, blue } = require('chalk');
const IKeeperRegistryABI = require('synthetix/build/artifacts/contracts/interfaces/IKeeperRegistry.sol/IKeeperRegistry.json')
	.abi;

class Keeper {
	routines = {};

	constructor({ keeperRegistry: keeperRegistryAddress, signer }) {
		// Setup KeeperRegistry.
		//
		const keeperRegistry = new ethers.Contract(keeperRegistryAddress, IKeeperRegistryABI, signer);
		console.log(gray(`Listening for events on KeeperRegistry [${keeperRegistry.address}]`));
		this.keeperRegistry = keeperRegistry;

		// Listen for events.
		//
		keeperRegistry.on('UpkeepRegistered', (id, executeGas, admin) => {
			console.log('KeeperRegistry', blue('UpkeepRegistered'), `[id=${id}]`);

			// Begin checkUpkeep routine.
			const checkUpkeepRoutine = new PollRoutine(
				() => this.checkUpkeep(keeperRegistry, id),
				pollInterval
			);
			this.routines[id] = checkUpkeepRoutine;
			checkUpkeepRoutine.run();
		});

		keeperRegistry.on('UpkeepCanceled', (id, executeGas, admin) => {
			// Cancel checkUpkeep routine.
			console.log('KeeperRegistry', blue('UpkeepCanceled'), `[id=${id}]`);
			this.routines[id].cancel();
		});
	}

	async checkUpkeep(id) {
		console.log(`Upkeep ${id}`, `begin checkUpkeep`);

		// log
		let checkUpkeepResult;

		try {
			checkUpkeepResult = await this.keeperRegistry.checkUpkeep.call(id);
		} catch (err) {
			console.log(`Upkeep ${id}`, `done checkUpkeep`, `${err.toString()}`);
			// log
			// upkeep not needed
			return;
		}

		console.log(`Upkeep ${id}`, `begin performUpkeep`);
		// if it was a success, then we call it.
		// TODO: maxLinkPayment, , gasWei, linkEth
		const { performData, gasLimit, gasWei } = checkUpkeepResult;

		const performUpkeepTx = await this.keeperRegistry.performUpkeep(id, performData, {
			gasLimit,
			gas: gasWei,
		});
		const receipt = await performUpkeepTx.wait(1);

		console.log(
			`Upkeep ${id}`,
			`done performUpkeep`,
			`success=${!!receipt.status}`,
			`tx=${receipt.transactionHash}`
		);
	}
}

module.exports = Keeper;
