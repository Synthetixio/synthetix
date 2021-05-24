const { bootstrapDual } = require('../utils/bootstrap');

describe('Synthetix integration tests (layer 1 and layer 2)', () => {
	const ctx = this;

	bootstrapDual({ ctx });

	it('test', () => {
		console.log("Hey there! How's your rekt going?");
	});
});
