const { web3 } = require('hardhat');
const { connectContract } = require('./connectContract');

async function implementsVirtualSynths({ network, deploymentPath }) {
	const Synthetix = await connectContract({
		network,
		deploymentPath,
		contractName: 'Synthetix',
	});

	const code = await web3.eth.getCode(Synthetix.address);
	const sighash = web3.eth.abi
		.encodeFunctionSignature('exchangeWithVirtual(bytes32,uint256,bytes32,bytes32)')
		.slice(2, 10);

	return code.includes(sighash);
}

module.exports = {
	implementsVirtualSynths,
};
