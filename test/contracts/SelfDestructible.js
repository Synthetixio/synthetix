require('.'); // import common test scaffolding

const SelfDestructible = artifacts.require('SelfDestructible');

const { fastForward } = require('../utils/testUtils');

contract('SelfDestructible', async accounts => {
	const [, owner] = accounts;
	let selfDestructible;
	const SELFDESTRUCT_DELAY = 2419200;

	beforeEach(async () => {
		selfDestructible = await SelfDestructible.deployed();
	});
	it('should only be terminated after we reach the SELFDESTRUCT_DELAY', async () => {
		// We initiate the self destruction of the contract
		await selfDestructible.initiateSelfDestruct({ from: owner });

		// Self destruct should revert as delay has not yet elapsed
		await assert.revert(selfDestructible.selfDestruct({ from: owner }));

		// We fast forward to reach the delay
		await fastForward(SELFDESTRUCT_DELAY + 1);

		// Self destruct should now work and emit the correct event
		const transaction = await selfDestructible.selfDestruct({ from: owner });
		assert.eventEqual(transaction, 'SelfDestructed', {
			beneficiary: owner,
		});
	});
});
