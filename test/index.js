const {
	assertEventEqual,
	assertEventNotEqual,
	assertBNEqual,
	assertBNNotEqual,
	assertEtherEqual,
	assertEtherNotEqual,
	assertRevert,
	takeSnapshot,
	restoreSnapshot,
} = require('../utils/testUtils');

// So we don't have to constantly import our assert helpers everywhere
// we'll just tag them onto the assert object for easy access.
assert.eventEqual = assertEventEqual;
assert.eventNotEqual = assertEventNotEqual;
assert.bnEqual = assertBNEqual;
assert.bnNotEqual = assertBNNotEqual;
assert.etherEqual = assertEtherEqual;
assert.etherNotEqual = assertEtherNotEqual;
assert.revert = assertRevert;

// And this is our test sandboxing. It snapshots and restores between each test.
let lastSnapshotId;

beforeEach(async function() {
	lastSnapshotId = await takeSnapshot();
});

afterEach(async function() {
	await restoreSnapshot(lastSnapshotId);
});
