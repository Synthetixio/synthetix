const {
	assertEventEqual,
	assertBNEqual,
	assertEtherEqual,
	assertRevert,
	takeSnapshot,
	restoreSnapshot,
} = require('../utils/testUtils');

// So we don't have to constantly import our assert helpers everywhere
// we'll just tag them onto the assert object for easy access.
assert.eventEqual = assertEventEqual;
assert.bnEqual = assertBNEqual;
assert.etherEqual = assertEtherEqual;
assert.revert = assertRevert;

// And this is our test sandboxing. It snapshots and restores between each test.
let lastSnapshotId;

beforeEach(async function() {
	lastSnapshotId = await takeSnapshot();
});

afterEach(async function() {
	await restoreSnapshot(lastSnapshotId);
});
