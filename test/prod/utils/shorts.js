const { toBytes32 } = require('../../..');
const { connectContract } = require('./connectContract');

async function implementsShorts({ network, deploymentPath }) {
	const AddressResolver = await connectContract({
		network,
		deploymentPath,
		contractName: 'AddressResolver',
	});

	const collateralShort = await AddressResolver.getAddress(toBytes32('CollateralShort'));
	return collateralShort !== '0x0000000000000000000000000000000000000000';
}

module.exports = {
	implementsShorts,
};
