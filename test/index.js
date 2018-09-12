const { assertEventEqual, takeSnapshot, restoreSnapshot } = require('../utils/testUtils');

let lastSnapshotId;

beforeEach(async function() {
	lastSnapshotId = await takeSnapshot();
});

afterEach(async function() {
	await restoreSnapshot(lastSnapshotId);
});

// So we don't have to constantly import assertEventEqual everywhere,
// we'll just tag it onto the assert object for easy access.
assert.eventEqual = assertEventEqual;
