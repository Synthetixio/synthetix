const { takeSnapshot, restoreSnapshot } = require('../utils/testUtils');

let lastSnapshotId;

beforeEach(async function() {
	lastSnapshotId = await takeSnapshot();
});

afterEach(async function() {
	await restoreSnapshot(lastSnapshotId);
});
