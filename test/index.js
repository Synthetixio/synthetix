const {
	assertBNEqual,
	assertEventEqual,
	assertRevert,
	takeSnapshot,
	restoreSnapshot,
} = require('../utils/testUtils');

let lastSnapshotId;

beforeEach(async function() {
	lastSnapshotId = await takeSnapshot();
});

afterEach(async function() {
	await restoreSnapshot(lastSnapshotId);
});

// So we don't have to constantly import our assert functions everywhere,
// we'll just tag them onto the assert object for easy access.
assert.bnEqual = assertBNEqual;
assert.eventEqual = assertEventEqual;
assert.revert = assertRevert;
