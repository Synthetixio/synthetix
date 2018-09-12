const {
	assertEventEqual,
	assertBNEqual,
	assertEtherEqual,
	takeSnapshot,
	restoreSnapshot,
} = require('../utils/testUtils');

// So we don't have to constantly import our assert helpers everywhere
// we'll just tag them onto the assert object for easy access.
assert.eventEqual = assertEventEqual;
assert.BNEqual = assertBNEqual;
assert.etherEqual = assertEtherEqual;

// And this is our test sandboxing. It snapshots and restores between each test.
let lastSnapshotId;

beforeEach(async function() {
	lastSnapshotId = await takeSnapshot();
});

afterEach(async function() {
	await restoreSnapshot(lastSnapshotId);
});
