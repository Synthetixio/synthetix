const { web3 } = require('@nomiclabs/buidler');

const { assert } = require('chai');

const {
	assertEventEqual,
	assertEventsEqual,
	assertBNEqual,
	assertBNNotEqual,
	assertBNClose,
	assertDeepEqual,
	assertInvalidOpcode,
	assertUnitEqual,
	assertUnitNotEqual,
	assertRevert,
	fromUnit,
	takeSnapshot,
	restoreSnapshot,
} = require('./testUtils');

// Helper for logging transactions
console.logTransaction = transaction => {
	const lineLength = 66;

	console.log('='.repeat(lineLength));
	console.log(transaction.tx);

	for (const log of transaction.logs) {
		console.log('-'.repeat(lineLength));
		console.log(`Event: ${log.event}`);
		for (const key of Object.keys(log.args)) {
			if (!/^\d+$/.test(key) && key !== '__length__') {
				if (web3.utils.isBN(log.args[key])) {
					console.log(`    ${key}: ${log.args[key]} fromUnit(${fromUnit(log.args[key])})`);
				} else {
					console.log(`    ${key}: ${log.args[key]}`);
				}
			}
		}
	}

	console.log('-'.repeat(lineLength));
};

let lastSnapshotId;

module.exports = {
	// So we don't have to constantly import our assert helpers everywhere
	// we'll just tag them onto the assert object for easy access.
	assert: Object.assign({}, assert, {
		eventEqual: assertEventEqual,
		eventsEqual: assertEventsEqual,
		bnEqual: assertBNEqual,
		bnNotEqual: assertBNNotEqual,
		bnClose: assertBNClose,
		deepEqual: assertDeepEqual,
		etherEqual: assertUnitEqual,
		etherNotEqual: assertUnitNotEqual,
		invalidOpcode: assertInvalidOpcode,
		unitEqual: assertUnitEqual,
		unitNotEqual: assertUnitNotEqual,
		revert: assertRevert,
	}),
	// And this is our test sandboxing. It snapshots and restores between each test.
	addSnapshotBeforeRestoreAfterEach() {
		beforeEach(async () => {
			lastSnapshotId = await takeSnapshot();
		});

		afterEach(async () => {
			await restoreSnapshot(lastSnapshotId);
		});
	},
};
