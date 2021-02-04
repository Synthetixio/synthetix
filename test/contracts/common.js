const { web3 } = require('hardhat');

const { assert } = require('chai');

const {
	assertEventEqual,
	assertEventsEqual,
	assertBNEqual,
	assertBNNotEqual,
	assertBNClose,
	assertBNGreaterEqualThan,
	assertBNGreaterThan,
	assertBNLessEqualThan,
	assertBNLessThan,
	assertDeepEqual,
	assertInvalidOpcode,
	assertUnitEqual,
	assertUnitNotEqual,
	assertRevert,
	fromUnit,
	takeSnapshot,
	restoreSnapshot,
} = require('../utils')();

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
		bnGte: assertBNGreaterEqualThan,
		bnLte: assertBNLessEqualThan,
		bnLt: assertBNLessThan,
		bnGt: assertBNGreaterThan,
		deepEqual: assertDeepEqual,
		etherEqual: assertUnitEqual,
		etherNotEqual: assertUnitNotEqual,
		invalidOpcode: assertInvalidOpcode,
		unitEqual: assertUnitEqual,
		unitNotEqual: assertUnitNotEqual,
		revert: assertRevert,
	}),

	// And this is our test sandboxing. It snapshots and restores between each test.
	// Note: if a test suite uses fastForward at all, then it MUST also use these snapshots,
	// otherwise it will update the block time of the EVM and future tests that expect a
	// starting timestamp will fail.
	addSnapshotBeforeRestoreAfterEach() {
		beforeEach(async () => {
			lastSnapshotId = await takeSnapshot();
		});

		afterEach(async () => {
			await restoreSnapshot(lastSnapshotId);
		});
	},

	addSnapshotBeforeRestoreAfter() {
		before(async () => {
			lastSnapshotId = await takeSnapshot();
		});

		after(async () => {
			await restoreSnapshot(lastSnapshotId);
		});
	},
};
