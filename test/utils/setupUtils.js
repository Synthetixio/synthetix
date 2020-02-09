const Synthetix = artifacts.require('Synthetix');
const AddressResolver = artifacts.require('AddressResolver');

const { toBytes32 } = require('../../.');

module.exports = {
	// Helper function that can issue synths directly to a user without having to have them exchange anything
	async issueSynthsToUser({ owner, user, amount, synth }) {
		const synthetix = await Synthetix.deployed();
		const addressResolver = await AddressResolver.deployed();

		// First override the resolver to make it seem the owner is the Synthetix contract
		await addressResolver.importAddresses(['Synthetix'].map(toBytes32), [owner], {
			from: owner,
		});
		await synth.issue(user, amount, {
			from: owner,
		});
		await addressResolver.importAddresses(['Synthetix'].map(toBytes32), [synthetix.address], {
			from: owner,
		});
	},
};
