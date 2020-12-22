const { toBytes32 } = require('../../..');
const { connectContract } = require('./connectContract');

async function implementsMultiCollateral({ network, deploymentPath }) {
	const AddressResolver = await connectContract({
		network,
		deploymentPath,
		contractName: 'AddressResolver',
	});

	const collateralManager = await AddressResolver.getAddress(toBytes32('CollateralManager'));
	return collateralManager !== '0x0000000000000000000000000000000000000000';
}

module.exports = {
	implementsMultiCollateral,
};
